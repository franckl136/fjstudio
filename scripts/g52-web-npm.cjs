'use strict';
// Only public package coordinates and their expected integrity enter this container.
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { join } = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { entries, offline } = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = '/cache';
let byteCount = 0;
let missing = 0;
async function get({ name, version, integrity }) {
  if (
    !/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) ||
    !/^[a-z0-9.+-]+$/i.test(version) ||
    !/^sha(512|1)-[A-Za-z0-9+/=]+$/.test(integrity)
  )
    throw Error('coordonnées');
  const basename = name.split('/').at(-1);
  const key = createHash('sha256').update(integrity).digest('hex');
  const file = join(root, key);
  const [alg, expected] = integrity.split('-');
  async function verified() {
    if (!fs.existsSync(file)) return false;
    const checksum = createHash(alg);
    for await (const chunk of fs.createReadStream(file)) checksum.update(chunk);
    return checksum.digest('base64') === expected;
  }
  if (await verified()) return;
  if (offline) {
    missing++;
    return;
  }
  const part = file + '.part';
  // A terminated transfer may leave its read-only partial file. The Docker cache lock is exclusive.
  fs.rmSync(part, { force: true });
  const response = await fetch(
    'https://registry.npmjs.org/' + name + '/-/' + basename + '-' + version + '.tgz',
    {
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(90000),
    },
  );
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + name + '@' + version);
  let bytes = 0;
  const hash = createHash(alg);
  const verify = new Transform({
    transform(chunk, _, next) {
      bytes += chunk.length;
      byteCount += chunk.length;
      if (bytes > 220 * 1024 * 1024 || byteCount > 2100 * 1024 * 1024) return next(Error('quota'));
      hash.update(chunk);
      next(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body),
    verify,
    fs.createWriteStream(part, { flags: 'w', mode: 0o444 }),
  );
  if (hash.digest('base64') !== expected) throw Error('integrité ' + name);
  fs.renameSync(part, file);
}
(async () => {
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < entries.length) await get(entries[next++]);
    }),
  );
  console.log(
    JSON.stringify({ packages: entries.length, downloadedBytes: byteCount, complete: missing === 0 }),
  );
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
