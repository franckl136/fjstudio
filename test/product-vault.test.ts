import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { archiveName, readVaultKey, setupVaultKey, vaultPath } from '../scripts/product-vault-files.ts';
import { packVault, unpackVault } from '../scripts/product-vault.ts';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/product-vault.ts', import.meta.url));
async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'fjstudio-vault-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dump = join(dir, 'résumé de recette.dump');
  const bytes = Buffer.concat([Buffer.from('PGDMP'), randomBytes(300000)]);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const manifest = Buffer.from(
    JSON.stringify(
      {
        format: 'fjstudio-backup-v2',
        id: randomUUID(),
        studioVersion: 'version synthétique',
        postgresVersion: '17',
        database: 'fjstudio_a1',
        createdAt: new Date().toISOString(),
        file: basename(dump),
        bytes: bytes.length,
        sha256,
        schema: {
          migrations: [{ name: '001-a1.sql', digest: '0'.repeat(64) }],
          tables: [{ table: 'projects', rows: 2, sha256: '0'.repeat(64) }],
        },
      },
      null,
      2,
    ) + '\r\n',
  );
  await writeFile(dump, bytes, { flag: 'wx' });
  await writeFile(dump + '.json', manifest, { flag: 'wx' });
  return {
    dir,
    dump,
    bytes,
    manifest,
    sha256,
    target: join(dir, 'test.fjvault'),
    recovery: join(dir, 'restored'),
  };
}
test('Coffre · CLI hors ligne, clé privée indépendante, identité exacte de la paire après récupération', async (t) => {
  const { dir, dump, bytes, manifest, sha256, target, recovery } = await fixture(t);
  const call = (...args: string[]) =>
    run(process.execPath, [script, ...args], { cwd: dir, windowsHide: true, timeout: 30000 });
  const setup = await call('key');
  const keypath = join(dir, '.env.archive.local'),
    secret = await readVaultKey(keypath);
  const encoded = secret.toString('base64url');
  secret.fill(0);
  assert.ok(!setup.stdout.includes(encoded));
  assert.equal(setup.stderr, '');
  const retained = await readFile(keypath);
  await assert.rejects(call('key'));
  assert.deepEqual(await readFile(keypath), retained);
  const pack = await call('pack', dump, target);
  assert.equal(JSON.parse(pack.stdout).dumpSha256, sha256);
  assert.ok(!pack.stdout.includes(encoded));
  const encrypted = await readFile(target);
  assert.ok(!encrypted.includes(manifest.subarray(0, 40)));
  assert.ok(!encrypted.includes(bytes.subarray(0, 64)));
  assert.ok(!encrypted.includes(Buffer.from(encoded)));
  const unpack = await call('unpack', target, recovery);
  assert.equal(JSON.parse(unpack.stdout).dumpSha256, sha256);
  assert.ok(!unpack.stdout.includes(encoded));
  assert.deepEqual(await readFile(join(recovery, basename(dump))), bytes);
  assert.deepEqual(await readFile(join(recovery, basename(dump) + '.json')), manifest);
  assert.deepEqual((await readdir(recovery)).sort(), [basename(dump), basename(dump) + '.json']);
  if (process.platform === 'win32') {
    const command = `
      $expected=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')|Sort-Object -Unique
      foreach($path in @($env:VAULT_TEST_KEY,$env:VAULT_TEST_FOLDER,$env:VAULT_TEST_DUMP,($env:VAULT_TEST_DUMP+'.json'))) {
        if ([IO.Directory]::Exists($path)) {$acl=[IO.Directory]::GetAccessControl($path)} else {$acl=[IO.File]::GetAccessControl($path)}
        $actual=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|ForEach-Object {$_.IdentityReference.Value}|Sort-Object -Unique)
        if(Compare-Object $expected $actual){exit 1}
      }`;
    await run(
      join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', command],
      {
        windowsHide: true,
        env: {
          SystemRoot: process.env.SystemRoot,
          VAULT_TEST_KEY: keypath,
          VAULT_TEST_FOLDER: recovery,
          VAULT_TEST_DUMP: join(recovery, basename(dump)),
        },
      },
    );
  }
});
test('Coffre · clé incorrecte, octets altérés, troncature et paire source invalide sont refusés', async (t) => {
  const { dir, dump, bytes, target, recovery } = await fixture(t);
  const key = randomBytes(32);
  await packVault(dump, target, key);
  await assert.rejects(unpackVault(target, recovery, randomBytes(32)), /authentification/);
  const data = await readFile(target);
  const corrupt = join(dir, 'altered.fjvault');
  for (const index of [8, Math.floor(data.length / 2), data.length - 1]) {
    const changed = Buffer.from(data);
    changed[index] ^= 1;
    await writeFile(corrupt, changed);
    await assert.rejects(unpackVault(corrupt, recovery, key), /authentification/);
  }
  await writeFile(corrupt, data.subarray(0, -1));
  await assert.rejects(unpackVault(corrupt, recovery, key), /authentification/);
  await assert.rejects(stat(recovery), { code: 'ENOENT' });
  assert.ok(!(await readdir(dir)).some((n) => n.startsWith('.fjstudio-backup-')));
  await writeFile(dump, Buffer.concat([bytes, Buffer.from('variation')]));
  const other = join(dir, 'unpublished.fjvault');
  await assert.rejects(packVault(dump, other, key), /Intégrité/);
  await assert.rejects(stat(other), { code: 'ENOENT' });
});
test('Coffre · publications concurrentes exclusives, destination vide ou occupée conservée', async (t) => {
  const { dir, dump, bytes, target, recovery } = await fixture(t);
  const key = randomBytes(32);
  const writes = await Promise.allSettled([packVault(dump, target, key), packVault(dump, target, key)]);
  assert.equal(writes.filter((x) => x.status === 'fulfilled').length, 1);
  const immutable = await readFile(target);
  await assert.rejects(packVault(dump, target, key), { code: 'EEXIST' });
  assert.deepEqual(await readFile(target), immutable);
  await mkdir(recovery);
  await assert.rejects(unpackVault(target, recovery, key), { code: 'EEXIST' });
  assert.deepEqual(await readdir(recovery), []);
  await writeFile(join(recovery, 'témoin'), 'précédent');
  await assert.rejects(unpackVault(target, recovery, key), { code: 'EEXIST' });
  assert.equal(await readFile(join(recovery, 'témoin'), 'utf8'), 'précédent');
  const fresh = join(dir, 'new');
  const reads = await Promise.allSettled([unpackVault(target, fresh, key), unpackVault(target, fresh, key)]);
  assert.equal(reads.filter((x) => x.status === 'fulfilled').length, 1);
  assert.deepEqual(await readFile(join(fresh, basename(dump))), bytes);
});
test('Coffre · noms Windows locaux, refus des flux alternatifs, des liens et des clés partagées', async (t) => {
  for (const value of [
    '../réserve',
    'sub\\file',
    'CON.txt',
    'NUL',
    'COM¹.dump',
    'file:stream',
    '.decrypted',
    'fin.',
    'fin ',
  ])
    assert.throws(() => archiveName(value));
  assert.equal(archiveName('résumé du 26.dump'), 'résumé du 26.dump');
  assert.throws(() => vaultPath('//archive/share/backup.fjvault'), /local/);
  if (process.platform === 'win32') assert.throws(() => vaultPath('D:\\recette\\a.dump:autre'), /local/);
  const { dir } = await fixture(t);
  const direct = join(dir, 'folder'),
    redirect = join(dir, 'shortcut');
  await mkdir(direct);
  await symlink(direct, redirect, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => vaultPath(join(redirect, 'archive.fjvault')), /lien ni jonction/);
  const unrelated = join(dir, '.env.human.local');
  await assert.rejects(setupVaultKey(unrelated));
  await assert.rejects(stat(unrelated), { code: 'ENOENT' });
  const key = join(dir, '.env.archive.local');
  await setupVaultKey(key);
  await writeFile(key, 'STUDIO_ARCHIVE_KEY=' + Buffer.alloc(32).toString('base64url') + '\n');
  if (process.platform === 'win32') {
    const cmd = `$acl=[IO.File]::GetAccessControl($env:VAULT_TEST_KEY)
      $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-11'),'Read','Allow'))
      [IO.File]::SetAccessControl($env:VAULT_TEST_KEY,$acl)`;
    await run(
      join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', cmd],
      {
        windowsHide: true,
        env: { SystemRoot: process.env.SystemRoot, VAULT_TEST_KEY: key },
      },
    );
  } else {
    const { chmod } = await import('node:fs/promises');
    await chmod(key, 0o644);
  }
  await assert.rejects(readVaultKey(key), /privées/);
});
