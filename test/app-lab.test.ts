import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { composeDatabaseUrl } from '../scripts/postgres-tools.ts';
import { AppLab } from '../src/app-lab.ts';
import { handleAppLabRoute } from '../src/app-lab-routes.ts';
import { createPool } from '../src/config.ts';
import { Core, migrate } from '../src/core.ts';
import type { JsonObject, Operator } from '../src/contracts.ts';

const opA: Operator = {id:'fixture-a',projectIds:['a']};
const opB: Operator = {id:'fixture-b',projectIds:['b']};
let admin: Pool;
let pool: Pool;
let lab: AppLab;
let created: string | undefined;

beforeEach(async () => {
  const url = composeDatabaseUrl();
  assert.equal(url.pathname,'/fjstudio_a1');
  const name = 'fjstudio_a1_test_' + randomUUID().replaceAll('-','');
  admin = createPool(url.href);
  await admin.query(`CREATE DATABASE ${name} TEMPLATE template0`);
  created = name;
  url.pathname = '/' + name;
  pool = createPool(url.href);
  await migrate(pool);
  lab = new AppLab(pool);
});
afterEach(async () => {
  try {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE ${created}`);
  } finally {
    created = undefined;
    await admin.end();
  }
});

test('App Lab · transitions et journal persistés, commandes rejouables', async () => {
  const key = randomUUID();
  const session = await lab.create(opA,'a',key);
  assert.equal(session.state,'created');
  assert.equal(session.profile,'registry-fixture-v1');
  assert.equal(session.expires_at.getTime() - session.created_at.getTime(),900_000);
  assert.equal((await lab.create(opA,'a',key)).id,session.id);
  assert.equal((await lab.act(opA,'a',session.id,'start')).state,'simulated');
  assert.equal((await lab.act(opA,'a',session.id,'start')).state,'simulated');
  await lab.act(opA,'a',session.id,'stop');
  await lab.act(opA,'a',session.id,'stop');
  await assert.rejects(lab.act(opA,'a',session.id,'start'),{code:'app_lab_terminal'});
  const read = await new AppLab(pool).detail(opA,'a',session.id);
  assert.deepEqual(read.events.map(e=>[e.state,e.actor]),[['created',opA.id],['simulated',opA.id],['stopped',opA.id]]);
  assert.equal((await lab.create(opA,'a',key)).state,'stopped');
  assert.notEqual((await lab.create(opA,'a',randomUUID())).id,session.id);
});

test('App Lab · quota concurrent, révocation et isolation par projet', async () => {
  const results = await Promise.allSettled([1,2,3].map(()=>lab.create(opA,'a',randomUUID())));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const refusals = results.filter(r=>r.status==='rejected');
  assert(refusals.every(r=>r.reason.code==='app_lab_quota'));
  const a = (await lab.list(opA,'a'))[0];
  const b = await lab.create(opB,'b',randomUUID());
  await assert.rejects(lab.list(opA,'b'),{status:404});
  await assert.rejects(lab.detail(opA,'a',b.id),{status:404});
  await assert.rejects(lab.act(opB,'a',a.id,'revoke'),{status:404});
  await assert.rejects(lab.act(opA,'a',b.id,'stop'),{status:404});
  assert.equal((await lab.detail(opB,'b',b.id)).events.length,1);
  await lab.act(opA,'a',a.id,'revoke');
  await assert.rejects(lab.act(opA,'a',a.id,'start'),{code:'app_lab_terminal'});
  const detail = await lab.detail(opA,'a',a.id);
  assert.equal(detail.events.at(-1)?.state,'revoked');
  assert.equal(detail.events.at(-1)?.actor,opA.id);
});

test('App Lab · échéance appliquée aux mutations et au balayage, récupération après copie', async () => {
  const a = await lab.create(opA,'a',randomUUID());
  const b = await lab.create(opB,'b',randomUUID());
  await lab.act(opA,'a',a.id,'start');
  await pool.query("UPDATE app_lab_sessions SET created_at=created_at-interval '16 minutes',expires_at=expires_at-interval '16 minutes'");
  await assert.rejects(lab.act(opA,'a',a.id,'start'),{code:'app_lab_expired'});
  assert.equal(await lab.expire(),1);
  assert.equal(await lab.expire(),0);
  for (const [actor,project,id] of [[opA,'a',a.id],[opB,'b',b.id]] as const) {
    const details = await lab.detail(actor,project,id);
    assert.equal(details.session.state,'expired');
    assert.equal(details.events.at(-1)?.reason,'deadline');
  }
  const pending = await lab.create(opB,'b',randomUUID());
  await lab.revokeRestoredSessions();
  await lab.revokeRestoredSessions();
  const restored = await lab.detail(opB,'b',pending.id);
  assert.equal(restored.session.state,'revoked');
  assert.deepEqual(restored.events.map(e=>e.reason),['operator','restored']);
});

test('App Lab · une écriture de journal indisponible annule la transition', async () => {
  const session = await lab.create(opA,'a',randomUUID());
  // A constraint on the disposable database provides a deterministic persistence failure.
  await pool.query("ALTER TABLE app_lab_events ADD CHECK (state <> 'simulated')");
  await assert.rejects(lab.act(opA,'a',session.id,'start'),{code:'23514'});
  const retained=await lab.detail(opA,'a',session.id);
  assert.equal(retained.session.state,'created');
  assert.deepEqual(retained.events.map(event=>event.state),['created']);
  await lab.act(opA,'a',session.id,'revoke');
});

test('App Lab · contrat HTTP borné, refus des paramètres exécutables, traces cloisonnées', async () => {
  const core = new Core(pool);
  const controller = {appLab:lab,listProjects:core.listProjects.bind(core)};
  async function request(method: string, path: string, actor: Operator, input: JsonObject = {}) {
    let reply: {code:number; data:unknown} | undefined;
    const io = {
      body: async () => input,
      json: (_res: ServerResponse,code:number,data:unknown) => { reply={code,data}; },
      html: (_res: ServerResponse,code:number,data:string) => { reply={code,data}; },
      redirect: (_res: ServerResponse,destination:string) => { reply={code:303,data:destination}; },
    };
    const handled = await handleAppLabRoute(controller,{method} as IncomingMessage,{} as ServerResponse,
      new URL(path,'http://127.0.0.1'),actor,path.startsWith('/api/'),io);
    assert(handled && reply);
    return reply;
  }
  const path='/api/projects/a/app-lab';
  await assert.rejects(request('POST',path,opA,{commandKey:randomUUID(),command:'unavailable'}),{status:400});
  await assert.rejects(request('POST',path,opA,{commandKey:randomUUID(),port:8081}),{status:400});
  assert.equal((await lab.list(opA,'a')).length,0);
  const session=await lab.create(opA,'a',randomUUID());
  const endpoint=path+'/'+session.id;
  assert.equal((await request('POST',endpoint+'/start',opA)).code,200);
  await assert.rejects(request('POST',endpoint+'/revoke',opA),{status:400});
  await assert.rejects(request('POST',endpoint+'/revoke',opB,{confirm:'yes'}),{status:404});
  assert.equal((await request('POST',endpoint+'/revoke',opA,{confirm:'yes'})).code,200);
  const page=await request('GET',endpoint.slice(4),opA);
  assert.match(String(page.data),/Révoquée/);
  assert.match(String(page.data),/Journal de la session/);
  assert.doesNotMatch(String(page.data),/action="[^"]+\/start"/);
});
