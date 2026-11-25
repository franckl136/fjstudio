// Standalone local PostgreSQL transport for the G5.2 public qualification kit.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const image = 'sha256:1eff563f6c868b9b433566e9f3cf6e5c79fbd3b95bf70ec7277d376cdbfc50d7';
export const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const household = '11111111-1111-4111-8111-111111111111',
  list = '22222222-2222-4222-8222-222222222222';
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const sqlString = (text) => "'" + String(text).replaceAll("'", "''") + "'";

async function execute(tool, argv, input = '') {
  const proc = spawn(tool, argv, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const stdout = [],
    stderr = [];
  proc.stdout.on('data', (chunk) => stdout.push(chunk));
  proc.stderr.on('data', (chunk) => stderr.push(chunk));
  proc.stdin.on('error', () => {});
  const complete = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(stdout))
        : reject(new Error(Buffer.concat(stderr).toString().slice(-2500))),
    );
  });
  proc.stdin.end(input);
  return complete;
}
export async function readyWhen(check, description) {
  for (let n = 0; n < 100; n++) {
    if (await check()) return;
    await delay(90);
  }
  throw new Error('Délai du laboratoire dépassé · ' + description);
}

export async function startLab(sources) {
  const context = (await execute('docker', ['context', 'show'])).toString().trim();
  const endpoint = (
    await execute('docker', [
      'context',
      'inspect',
      context,
      '--format',
      '{{.Endpoints.docker.Host}}',
    ])
  )
    .toString()
    .trim();
  assert.match(endpoint, /^(npipe:\/\/\/\/\.\/pipe\/|unix:\/\/\/)/);
  assert.ok(!process.env.DOCKER_HOST, 'DOCKER_HOST non accepté.');
  const flags = ['--context', context];
  const docker = async (argv, input) =>
    (await execute('docker', [...flags, ...argv], input)).toString().trim();
  const name = 'fjg52-sql-' + randomUUID();
  const id = await docker([
    'run',
    '--detach',
    '--pull=never',
    '--network',
    'none',
    '--pids-limit',
    '110',
    '--memory',
    '512m',
    '--name',
    name,
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    image,
    'postgres',
    '-c',
    'listen_addresses=',
    '-c',
    'fsync=on',
  ]);
  assert.match(id, /^[0-9a-f]{64}$/);
  const args = [
    'exec',
    '-i',
    id,
    'psql',
    '-XqAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=verbose',
    '-U',
    'postgres',
    '-d',
    'postgres',
  ];
  const query = async (sql) => docker(args, sql + '\n');
  const close = async () => docker(['rm', '--force', '--volumes', id]);
  const ready = async () =>
    readyWhen(async () => {
      try {
        return (
          (await docker(['exec', id, 'cat', '/proc/1/comm'])) === 'postgres' &&
          (await query('select 1;')) === '1'
        );
      } catch {
        return false;
      }
    }, 'PostgreSQL');
  try {
    await ready();
    assert.equal(await docker(['inspect', '-f', '{{.HostConfig.NetworkMode}}', id]), 'none');
    assert.equal(await docker(['port', id]), '');
    await query(sources.sql);
    await query(`insert into auth.users(id,email) values ('${alice}','alice@example.invalid'),('${bob}','bob@example.invalid');
      insert into public.households(id,name) values ('${household}','G52 synthétique');
      insert into public.household_members(household_id,user_id,role,status,joined_at) values
        ('${household}','${alice}','owner','active',now()),('${household}','${bob}','member','active',now());
      insert into public.lists(id,household_id,name,kind) values ('${list}','${household}','Courses','shopping');`);
  } catch (e) {
    await close();
    throw e;
  }
  const as = (who, sql, application = 'g52_rpc') => {
    assert.ok([alice, bob].includes(who));
    assert.match(application, /^g52_[a-z_]+$/);
    return query(`begin; set local application_name=${sqlString(application)}; set local role authenticated;
      set local request.jwt.claim.sub=${sqlString(who)}; ${sql}; commit;`);
  };
  // A real third SQL session holds the row until both normal mobile requests have entered PostgreSQL.
  async function holdRow(item) {
    assert.match(item, /^[a-f0-9-]{36}$/);
    const proc = spawn('docker', [...flags, ...args], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    proc.stdout.on('data', (data) => (output += data.toString()));
    proc.stderr.resume();
    const closed = new Promise((resolve, reject) => {
      proc.on('error', reject);
      proc.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error('Session SQL barrière interrompue.')),
      );
    });
    proc.stdin.write(
      `begin; select id from list_items where id='${item}' for update;\n\\echo ROW_HELD\n`,
    );
    await readyWhen(async () => output.includes('ROW_HELD'), 'verrou de contrôle');
    return async () => {
      proc.stdin.end('commit;\n');
      await closed;
    };
  }
  return {
    id,
    name,
    as,
    query,
    holdRow,
    close,
    ready,
    crash: () => docker(['kill', '--signal', 'KILL', id]),
    start: () => docker(['start', id]),
  };
}
