import { readFile } from 'node:fs/promises';

const nodeImage = 'node@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530';

export async function prepareCache({ entries, lockSha, baseLock, volume, command, attach, containers, id }) {
  const labels = 'studio.g5.public-lock';
  const prev = 'fjg5-lab-public-' + baseLock.slice(0, 16);
  async function inspect(expected, name) {
    const [cache] = JSON.parse(await command(['volume', 'inspect', name]));
    if (
      cache.Driver !== 'local' ||
      Object.keys(cache.Options ?? {}).length ||
      cache.Labels?.[labels] !== expected
    )
      throw Error('Unexpected local volume.');
  }
  await command(['volume', 'create', '--label', labels + '=' + lockSha, volume]);
  await inspect(lockSha, volume);
  const mount = 'type=volume,src=' + volume + ',dst=/cache,volume-nocopy';
  const limits = [
    '--pull',
    'never',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '48',
    '--cpus',
    '2',
    '--memory',
    '512m',
    '--memory-swap',
    '512m',
    '--log-driver',
    'none',
  ];
  async function create(name, args) {
    await command(['create', '--name', name, ...limits, ...args]);
    containers.push(name);
  }
  const lock = volume + '-lock';
  await create(lock, [
    '--network',
    'none',
    '--cap-add',
    'CHOWN',
    '--mount',
    mount,
    '--entrypoint',
    '/bin/chown',
    nodeImage,
    '65534:65534',
    '/cache',
  ]);
  await command(['start', '-a', lock]);
  let havePrevious = false;
  if (prev !== volume) {
    const names = (await command(['volume', 'ls', '--format', '{{.Name}}'])).trim().split(/\r?\n/);
    if (names.includes(prev)) {
      await inspect(baseLock, prev);
      havePrevious = true;
    }
  }
  const warm = 'fjg52-web-' + id + '-verify';
  const sourceMount = havePrevious
    ? ['--mount', 'type=volume,src=' + prev + ',dst=/previous,readonly,volume-nocopy']
    : [];
  const program = `
    const fs=require('fs'),crypto=require('crypto'),list=JSON.parse(fs.readFileSync(0,'utf8'));
    (async()=>{const missing=[];
      for(const {name,version,integrity} of list){
        const key=crypto.createHash('sha256').update(integrity).digest('hex'),target='/cache/'+key;
        let found=false;
        for(const source of [target,'/previous/'+key]){
          if(!fs.existsSync(source))continue;
          const [alg,expected]=integrity.split('-'),sum=crypto.createHash(alg);
          for await(const b of fs.createReadStream(source))sum.update(b);
          if(sum.digest('base64')!==expected)continue;
          if(source!==target)fs.copyFileSync(source,target);
          found=true;break;
        }
        if(!found)missing.push({name,version,integrity});
      }
      console.log(JSON.stringify(missing));
    })().catch(()=>process.exit(1));`;
  await create(warm, [
    '-i',
    '--network',
    'none',
    '--user',
    '65534:65534',
    '--mount',
    mount,
    ...sourceMount,
    '--entrypoint',
    'node',
    nodeImage,
    '-e',
    program,
  ]);
  const missing = await attach(warm, entries);
  if (missing.length) {
    const approved = [baseLock, '67284de4f7341f0b91a9c8dab709c73fd169bedb7e52dc74012d4fbd0b5ac4ff'];
    if (!approved.includes(lockSha))
      throw Error('Cache incomplet et lock non approuvé pour une récupération publique.');
    const fetchCode = await readFile(new URL('./g52-web-npm.cjs', import.meta.url), 'utf8');
    const download = 'fjg52-web-' + id + '-public';
    await create(download, [
      '-i',
      '--user',
      '65534:65534',
      '--mount',
      mount,
      '--entrypoint',
      'node',
      nodeImage,
      '-e',
      fetchCode,
    ]);
    const result = await attach(download, { entries: missing, offline: false });
    if (!result.complete || result.packages !== missing.length) throw Error('Cache public incomplet.');
  }
  console.log(JSON.stringify({ verified: entries.length, newPublicPackages: missing.length, lockSha }));
}
