import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { webDatabase } from './g52-web-sql.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const [gitDir, revision, mode = 'authenticated'] = process.argv.slice(2);
if (
  !gitDir ||
  !/^[0-9a-f]{40}$/.test(revision) ||
  !['authenticated', 'preview', 'prepare-cache'].includes(mode)
) {
  throw Error(
    'Usage : node scripts/g52-web.mjs <git-common-dir> <sha40> [authenticated|preview|prepare-cache]',
  );
}
const exec = promisify(execFile);
const windows = process.platform === 'win32';
const docker = windows ? 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe' : '/usr/bin/docker';
const host = [
  '--host',
  windows ? 'npipe:////./pipe/dockerDesktopLinuxEngine' : 'unix:///var/run/docker.sock',
];
const env = windows
  ? { SystemRoot: 'C:\\Windows', PATH: 'C:\\Windows\\System32' }
  : { PATH: '/usr/bin:/bin' };
const baseLock = 'c14ff9315f8b63f24d7e2503b4c3810783d58fca95ba3229ac79c07de0183d94';
let lockSha;
let volume;
const image =
  'mcr.microsoft.com/playwright@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d';
const pnpm = {
  name: 'pnpm',
  version: '10.33.4',
  integrity:
    'sha512-HGezs1my1AgRm6HtKJ80uPw8aHNBK+xv0mT73IJInlEPy+y5zp0i2ufzt2Jp2EQQRgFL3KU7mXnNelYa1jG4AA==',
};
const sha = (value) => createHash('sha256').update(value).digest('hex');
const uid = '65534:65534';
const work = await mkdtemp(join(tmpdir(), 'fjg52-web-'));
const id = randomUUID();
const out = join(scripts, '..', 'backups', 'g52-web', id);
const containers = [];
let failed = false;
async function command(args) {
  return (
    await exec(docker, [...host, ...args], { env, timeout: 30000, maxBuffer: 262144, windowsHide: true })
  ).stdout;
}
async function gitReader() {
  const repo = resolve(gitDir);
  const objects = join(repo, 'objects');
  for (const dir of [repo, objects])
    if (relative(dir, await realpath(dir)) !== '') throw Error('Magasin Git indirect.');
  for (const file of ['commondir', 'objects/info/alternates', 'objects/info/http-alternates']) {
    if (
      await lstat(join(repo, file)).then(
        () => true,
        (e) => (e.code === 'ENOENT' ? false : Promise.reject(e)),
      )
    )
      throw Error('Alternates Git non autorisés.');
  }
  const dirs = [objects];
  let count = 0;
  while (dirs.length) {
    const dir = dirs.pop();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (++count > 100000 || entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
        throw Error('Magasin Git hors profil.');
      if (entry.isDirectory()) dirs.push(join(dir, entry.name));
    }
  }
  const binaries = windows ? ['C:\\Program Files\\Git\\cmd\\git.exe'] : ['/usr/bin/git'];
  if (windows) {
    const packages = 'C:\\Program Files\\WindowsApps';
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
      const m = /^(OpenAI\.CodexPrimaryRuntime\.[\w.-]+_3k8sg7r9htsxt)\\/i.exec(
        relative(packages, resolve(dir)),
      );
      if (m) binaries.push(join(packages, m[1], 'dependencies', 'native', 'git', 'cmd', 'git.exe'));
    }
  }
  let git;
  for (const path of binaries)
    if (
      await realpath(path).then(
        (p) => relative(path, p) === '',
        () => false,
      )
    ) {
      git = path;
      break;
    }
  if (!git) throw Error('Git absent du répertoire système protégé.');
  const bare = join(work, 'bare'),
    config = join(work, 'config');
  await writeFile(config, '', { flag: 'wx' });
  const gitEnv = {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: config,
    GIT_ATTR_NOSYSTEM: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_ALLOW_PROTOCOL: 'none',
    GIT_TERMINAL_PROMPT: '0',
    HOME: work,
    TEMP: work,
    TMP: work,
  };
  const opts = {
    cwd: work,
    env: gitEnv,
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
    encoding: 'buffer',
    windowsHide: true,
  };
  await exec(git, ['init', '--bare', '--template=', bare], opts);
  gitEnv.GIT_ALTERNATE_OBJECT_DIRECTORIES = join(repo, 'objects');
  return async (args) =>
    (await exec(git, ['--git-dir=' + bare, '-c', 'core.hooksPath=' + join(work, 'disabled'), ...args], opts))
      .stdout;
}
async function snapshot(git, commit) {
  if ((await git(['rev-parse', '--verify', commit + '^{commit}'])).toString().trim() !== commit)
    throw Error('Révision non confirmée.');
  const paths = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    ...[
      'app',
      'assets',
      'components',
      'lib',
      'scripts',
      'app.json',
      'metro.config.js',
      'package.json',
      'tsconfig.json',
    ].map((k) => 'apps/homeos/' + k),
    ...['ai', 'data', 'domain', 'ui'].flatMap((k) =>
      ['src', 'package.json', 'tsconfig.json'].map((p) => 'packages/' + k + '/' + p),
    ),
  ];
  const tree = (await git(['ls-tree', '-rlz', commit, '--', ...paths]))
    .toString()
    .split('\0')
    .filter(Boolean);
  if (
    tree.length > 1500 ||
    tree.some(
      (t) =>
        !/^100(644|755) blob [\da-f]{40} +\d+\t/.test(t) ||
        /[\\/](?:\.env(?:\.|$)|\.git|\.npmrc|node_modules|[^/]+\.(?:pem|key|p12)$)/i.test(t) ||
        Number(t.split('\t')[0].trim().split(/\s+/).at(-1)) > 12 * 1024 * 1024,
    )
  )
    throw Error('Arbre source hors profil.');
  const file = join(work, commit + '.tar');
  await git(['archive', '--format=tar', '--output=' + file, commit, '--', ...paths]);
  if ((await lstat(file)).size > 80 * 1024 * 1024) throw Error('Archive trop grande.');
  const lock = await git(['cat-file', 'blob', commit + ':pnpm-lock.yaml']);
  lockSha = sha(lock);
  volume = 'fjg5-lab-public-' + lockSha.slice(0, 16);
  const pkgs = lock
    .toString()
    .split('\npackages:\n')[1]
    .split('\nsnapshots:\n')[0]
    .split(/\n(?=  [^ ])/);
  const entries = [];
  for (const block of pkgs.filter((x) => x.trim())) {
    const m =
      /^  '?((?:@[\w.-]+\/)?[\w.-]+)@([\w.+-]+)'?:\n    resolution: \{integrity: (sha(?:512|1)-[A-Za-z0-9+/=]+)\}/.exec(
        block,
      );
    if (!m) throw Error('Coordonnées de paquet hors profil.');
    const [, name, version, integrity] = m;
    const supported = (key, value) => {
      const v = new RegExp('^    ' + key + ': \\[([^\\]]+)\\]', 'm').exec(block);
      return !v || v[1].split(', ').includes(value);
    };
    if (supported('os', 'linux') && supported('cpu', 'x64') && supported('libc', 'glibc'))
      entries.push({ name, version, integrity });
  }
  entries.push(pnpm);
  return { archive64: (await readFile(file)).toString('base64'), entries, pnpm };
}
function attach(name, payload) {
  return new Promise((ok, fail) => {
    const p = spawn(docker, [...host, 'start', '-ai', name], { env, timeout: 400000, windowsHide: true });
    const stdout = [],
      stderr = [];
    let total = 0;
    const collect = (list, b) => {
      total += b.length;
      if (total > 1000000) p.kill();
      else list.push(b);
    };
    p.stdout.on('data', (b) => collect(stdout, b));
    p.stderr.on('data', (b) => collect(stderr, b));
    p.on('error', fail);
    p.stdin.on('error', fail);
    p.on('close', (code) => {
      if (code === 0 && total <= 1000000) {
        try {
          return ok(JSON.parse(Buffer.concat(stdout).toString()));
        } catch {
          return fail(Error('Sortie de preuve illisible.'));
        }
      }
      const tag = Buffer.concat(stderr)
        .toString()
        .match(/^G52_ERROR [a-z0-9-]+$/m)?.[0];
      fail(Error(tag ?? 'Fin anormale du conteneur ' + name + ' (code ' + code + ').'));
    });
    p.stdin.end(JSON.stringify(payload));
  });
}
function attachBrowser(name, input, database) {
  return new Promise((resolve, reject) => {
    const child = spawn(docker, [...host, 'start', '-ai', name], { env, windowsHide: true, timeout: 400000 });
    let buffer = '',
      errors = '',
      result,
      requests = 0,
      pending = 0;
    child.stdout.setEncoding('utf8');
    const bad = () => {
      child.kill();
      reject(Error('Protocole de recette invalide.'));
    };
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 1000000) return bad();
      let pos;
      while ((pos = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, pos);
        buffer = buffer.slice(pos + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          return bad();
        }
        if (message.result) {
          if (result) return bad();
          result = message.result;
          continue;
        }
        if (
          !database ||
          !Number.isSafeInteger(message.id) ||
          message.id < 1 ||
          ++requests > 400 ||
          ++pending > 24
        )
          return bad();
        database
          .request(message.query)
          .then(
            (value) => ({ id: message.id, value }),
            (e) => {
              const state = String(e.message).match(/ERROR:\s+([0-9A-Z]{5}):/i)?.[1] ?? 'query';
              return { id: message.id, error: 'database-' + state };
            },
          )
          .then((reply) => {
            pending--;
            if (!child.stdin.destroyed) child.stdin.write(JSON.stringify(reply) + '\n');
          })
          .catch(bad);
      }
    });
    child.stderr.on('data', (b) => {
      errors = (errors + b.toString()).slice(-256);
    });
    child.once('error', reject);
    child.stdin.once('error', reject);
    child.once('close', (code) =>
      code === 0 && result && !buffer.trim()
        ? resolve(result)
        : reject(Error(errors.match(/G52_ERROR [a-z0-9-]+/)?.[0] ?? 'Arrêt de la recette navigateur.')),
    );
    child.stdin.write(JSON.stringify(input) + '\n');
  });
}
async function executeCase(profile, snapshot, driver, database) {
  const name = 'fjg52-web-' + id + '-' + profile;
  // The formatted browser driver exceeds the Windows command-line limit in plain text.
  const encoded = gzipSync(Buffer.from(driver)).toString('base64');
  const bootstrap =
    "require('node:fs').writeFileSync('/tmp/g52-browser.cjs',require('node:zlib').gunzipSync(Buffer.from('" +
    encoded +
    "','base64')),{flag:'wx'});require('/tmp/g52-browser.cjs')";
  const mount = 'type=volume,src=' + volume + ',dst=/cache,readonly,volume-nocopy';
  await command([
    'create',
    '-i',
    '--name',
    name,
    '--pull',
    'never',
    '--network',
    'none',
    '--user',
    uid,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges=true',
    '--memory',
    '5g',
    '--memory-swap',
    '5g',
    '--cpus',
    '3',
    '--pids-limit',
    '384',
    '--shm-size',
    '256m',
    '--tmpfs',
    '/tmp:rw,exec,nosuid,nodev,size=4g,mode=1777',
    '--mount',
    mount,
    '--log-driver',
    'none',
    '--ulimit',
    'core=0',
    '--env',
    'HOME=/tmp/home',
    '--env',
    'CI=1',
    '--env',
    'EXPO_OFFLINE=1',
    '--env',
    'EXPO_NO_TELEMETRY=1',
    '--env',
    'EXPO_NO_DOTENV=1',
    '--env',
    'EXPO_PUBLIC_APP_ENV=development',
    '--env',
    'EXPO_PUBLIC_PREVIEW_AUTH_BYPASS=' + (profile === 'preview' ? '1' : '0'),
    '--env',
    'EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:8083',
    '--env',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=' + randomUUID(),
    '--entrypoint',
    '/usr/bin/timeout',
    image,
    '--kill-after=4s',
    '370s',
    '/usr/bin/node',
    '-e',
    bootstrap,
  ]);
  containers.push(name);
  const [desc] = JSON.parse(await command(['inspect', name]));
  const h = desc.HostConfig;
  if (
    h.NetworkMode !== 'none' ||
    h.Privileged ||
    !h.ReadonlyRootfs ||
    h.Binds?.length ||
    Object.keys(h.PortBindings ?? {}).length ||
    desc.Config.User !== uid ||
    desc.Mounts.length !== 1 ||
    desc.Mounts[0].Name !== volume ||
    desc.Mounts[0].RW
  )
    throw Error('Profil Docker inattendu.');
  const adapter = await readFile(join(scripts, 'g52-web-service.cjs'), 'utf8');
  const { png, ...observed } = await attachBrowser(
    name,
    { ...snapshot, profile, adapter, scope: database?.scope },
    database,
  );
  if (
    !['PASS', 'FAILED'].includes(observed.status) ||
    !Array.isArray(observed.steps) ||
    !observed.exported?.configUnchanged
  )
    throw Error('Reçu Expo incomplet.');
  const label = 'web-' + profile;
  let screenshot = null;
  if (png) {
    const data = Buffer.from(png, 'base64');
    if (
      data.length < 5000 ||
      data.length > 250000 ||
      !data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    )
      throw Error('Capture invalide.');
    screenshot = { file: label + '.png', bytes: data.length, sha256: sha(data) };
    await writeFile(join(out, screenshot.file), data, { flag: 'wx' });
  }
  const receipt = {
    schema: 'g52-web-v1',
    commit: revision,
    profile,
    database: database?.profile ?? null,
    toolSha256: {
      launcher: sha(await readFile(new URL(import.meta.url))),
      browser: sha(driver),
      service: sha(adapter),
    },
    lockSha256: lockSha,
    image,
    cachePackages: snapshot.entries.length,
    network: 'none',
    publishedPorts: 0,
    observedAt: new Date().toISOString(),
    ...observed,
    screenshot,
  };
  const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n');
  const receiptName = label + '.json';
  await writeFile(join(out, receiptName), bytes, { flag: 'wx' });
  const entry = {
    profile,
    commit: receipt.commit,
    status: receipt.status,
    receipt: receiptName,
    sha256: sha(bytes),
    screenshot,
  };
  console.log(JSON.stringify(entry));
  if (receipt.steps.some((step) => step.status === 'FAIL')) failed = true;
  return entry;
}
try {
  const git = await gitReader();
  const source = await snapshot(git, revision);
  if (mode === 'prepare-cache') {
    const { prepareCache } = await import('./g52-web-cache.mjs');
    await prepareCache({
      entries: source.entries,
      lockSha,
      baseLock,
      volume,
      command,
      attach,
      containers,
      id,
    });
  } else {
    const [cache] = JSON.parse(await command(['volume', 'inspect', volume]));
    if (
      cache.Driver !== 'local' ||
      Object.keys(cache.Options ?? {}).length ||
      cache.Labels?.['studio.g5.public-lock'] !== lockSha
    )
      throw Error('Cache npm hors profil.');
    const driver = await readFile(join(scripts, 'g52-web-browser.cjs'), 'utf8');
    await mkdir(out, { recursive: true });
    const db = mode === 'authenticated' ? await webDatabase(git, revision) : null;
    let entry;
    try {
      entry = await executeCase(mode, source, driver, db);
    } finally {
      if (db) await db.close();
    }
    await writeFile(
      join(out, 'manifest.json'),
      JSON.stringify({ schema: 'g52-web-campaign-v1', entries: [entry] }, null, 2) + '\n',
      { flag: 'wx' },
    );
    console.log('EVIDENCE ' + out);
    if (failed) process.exitCode = 2;
  }
} catch (err) {
  console.error(
    typeof err.code === 'number'
      ? 'Échec de la commande locale, code ' + err.code
      : String(err.message).slice(0, 160),
  );
  process.exitCode = 1;
} finally {
  for (const name of containers.reverse())
    await command(['rm', '--force', name]).catch(() => {
      console.error('Nettoyage requis ' + name);
      process.exitCode = 1;
    });
  await rm(work, { recursive: true, force: true });
}
