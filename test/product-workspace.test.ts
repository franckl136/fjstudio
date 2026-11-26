import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { after, before, test } from 'node:test';
import type { Pool } from 'pg';
import { composeDatabaseUrl } from '../scripts/postgres-tools.ts';
import { createPool } from '../src/config.ts';
import { migrate } from '../src/core.ts';
import type { Operator } from '../src/contracts.ts';
import { createWorkspaceProject, changeProfile, profileDetail } from '../src/product-workspace-projects.ts';
import { workspaceRoute } from '../src/product-workspace-routes.ts';
import { readWorkspace, type DeskIdentity } from '../src/product-workspace.ts';
import { importCursorPulls, cursorPulls } from '../src/cursor-sessions.ts';
import { orderedProjects } from '../src/views.ts';

const owner: Operator = { id: 'workspace-owner', accountRole: 'admin', projectIds: ['a','b'] };
test('Ordre français des projets, accents, nombres et noms identiques',()=>{
  const names=[{id:'b',name:'Équipe 10'},{id:'z',name:'équipe 2'},{id:'c',name:'Equipe 2'},{id:'a',name:'Atelier'}];
  assert.deepEqual(orderedProjects(names).map(p=>p.id),['a','c','z','b']);
  assert.deepEqual(names.map(p=>p.id),['b','z','c','a']);
});

test('Sessions Cursor · lien corroboré, import atomique, reprise des PR et périmètre du projet',async()=>{
  await pool.query("INSERT INTO project_repositories(project_id,repository_key,remote_url,registered_by) VALUES ('b','cursor-test','','recette')");
  const agent='bc-'+randomUUID();
  const pr={number:7,title:'Relecture des articles',url:'https://github.com/example/atelier/pull/7',body:'[Session](https://cursor.com/agents/'+agent+')',
    headRefName:'cursor/articles',state:'OPEN',isDraft:true};
  const t=new Date(Date.now()-60000);
  assert.equal(await importCursorPulls(pool,'b','example/atelier',[pr],t),1);
  await importCursorPulls(pool,'b','example/atelier',[{...pr,state:'MERGED'}],new Date());
  await importCursorPulls(pool,'b','example/atelier',[pr],t);
  assert.equal(await importCursorPulls(pool,'b','example/atelier',[{...pr,body:'Simple branche Cursor'}],t),0);
  await assert.rejects(importCursorPulls(pool,'b','example/atelier',[{...pr,number:8,url:pr.url.slice(0,-1)+'8'},{...pr,url:'https://example.net/'}],t));
  assert.deepEqual((await cursorPulls(pool,owner,'b')).map(r=>[r.pr_number,r.state]),[[7,'merged']]);
  assert.equal((await cursorPulls(pool,operator)).length,0);
  await assert.rejects(cursorPulls(pool,operator,'b'),{status:404});
});
const operator: Operator = { id: 'op-alpha', accountRole: 'operator', projectIds: ['a'] };
const viewer: Operator = { id: 'lecteur-alpha', accountRole: 'viewer', projectIds: ['a'] };
const profile = {
  name: 'Atelier éditorial', description: 'Suivi du catalogue', mainBranch: 'main',
  workBranches: ['feat/atelier'], repository: 'https://github.com/example/atelier', acceptance: 'Valider le catalogue.',
};
const runners: DeskIdentity[] = [
  { id: 'analyseur', projectId: 'a', role: 'preparer' }, { id: 'relecteur', projectId: 'a', role: 'verifier' },
  { id: 'hors-ligne', projectId: 'a', role: 'preparer' }, { id: 'b-confidentiel', projectId: 'b', role: 'verifier' },
];
let maintenance: Pool;
let pool: Pool;
let created: string | undefined;

before(async () => {
  const url = composeDatabaseUrl();
  assert.equal(url.pathname,'/fjstudio_a1');
  const name = 'fjstudio_a1_test_' + randomUUID().replaceAll('-','');
  maintenance = createPool(url.href);
  await maintenance.query('CREATE DATABASE ' + name + ' TEMPLATE template0');
  created = name;
  url.pathname = '/' + name;
  pool = createPool(url.href);
  await migrate(pool);
  await pool.query('INSERT INTO studio_accounts(id,role) VALUES ($1,$2)',[owner.id,owner.accountRole]);
});
after(async () => {
  try {
    if (pool) await pool.end();
    if (created) await maintenance.query('DROP DATABASE ' + created);
  } finally { if (maintenance) await maintenance.end(); }
});

async function get(path: string, actor: Operator) {
  const req = new IncomingMessage(new Socket());
  req.method = 'GET';
  const res = new ServerResponse(req);
  let html = '';
  const handled = await workspaceRoute(pool,req,res,new URL(path,'http://localhost'),actor,false,{
    runners, html(_res,_status,value){ html = value; },
    body(){ throw new Error('unexpected body'); }, json(){ throw new Error('unexpected JSON'); },
    redirect(){ throw new Error('unexpected redirect'); },
  });
  assert(handled);
  return { html, refresh:res.getHeader('Refresh') };
}

test('Command Center · création atomique du profil et de son périmètre, rejeu et collisions', async () => {
  const input = { ...profile, id: 'atelier-test' };
  await assert.rejects(createWorkspaceProject(pool,operator,input),{status:403});
  const [first,second] = await Promise.all([createWorkspaceProject(pool,owner,input),createWorkspaceProject(pool,owner,input)]);
  assert.deepEqual(first,second);
  await assert.rejects(createWorkspaceProject(pool,owner,{...input,name:'Écrasement'}),{status:409});
  const grants = await pool.query('SELECT account_id FROM studio_account_projects WHERE project_id=$1',[input.id]);
  assert.deepEqual(grants.rows,[{account_id:owner.id}]);
  const freshActor = {...owner,projectIds:[...owner.projectIds,input.id]};
  assert.deepEqual((await profileDetail(pool,freshActor,input.id)).profile,first);
  assert.equal((await profileDetail(pool,freshActor,input.id)).revisions.length,1);
  await assert.rejects(profileDetail(pool,operator,input.id),{status:404});
});

test('Command Center · deux éditions concurrentes, journal de révision et lecture seule', async () => {
  const initial = (await profileDetail(pool,operator,'a')).profile;
  const input = {...profile,revision:initial.revision};
  await assert.rejects(changeProfile(pool,viewer,'a',input),{status:403});
  await assert.rejects(changeProfile(pool,operator,'b',input),{status:404});
  await assert.rejects(changeProfile(pool,operator,'a',{...input,repository:'https://user:password@example.com/x/y'}),{status:400});
  const results = await Promise.allSettled(['Mars','Avril'].map(name => changeProfile(pool,operator,'a',{...input,name})));
  assert.equal(results.filter(row => row.status === 'fulfilled').length,1);
  assert(results.some(row => row.status === 'rejected' && row.reason.status === 409));
  const data = await profileDetail(pool,operator,'a');
  assert.equal(data.profile.revision,initial.revision+1);
  const replay = await changeProfile(pool,operator,'a',{...input,name:data.profile.name});
  assert.equal(replay.revision,data.profile.revision);
  assert.deepEqual(data.revisions.map(row => row.actor),[operator.id]);
  const view = await get('/projects/a/settings',viewer);
  assert.match(view.html,/Révisions du profil/);
  assert.doesNotMatch(view.html,/name="workBranches"/);
  await assert.rejects(get('/projects/new',viewer),{status:403});
});

test('Agent Office · bail actif, contact périmé, poste sans contact, pause du suivi et cloisonnement', async () => {
  const a = randomUUID(), b = randomUUID();
  for (const [project,id,objective] of [['a',a,'Contrôle <Atelier>'],['b',b,'b-confidentiel']]) {
    await pool.query(`INSERT INTO control_missions
      (id,project_id,objective,scope,constraints_text,document,criteria,risk,duration_minutes,status,source_sha256,contract_version,created_by)
      VALUES ($1,$2,$3,'atelier','','document',ARRAY['titre'],'normal',5,'running',repeat('0',64),'1','atelier')`,[id,project,objective]);
    await pool.query(`INSERT INTO control_events(project_id,mission_id,actor,event_type)
      VALUES($1,$2,'atelier','task_claimed')`,[project,id]);
  }
  await pool.query(`INSERT INTO control_tasks(project_id,mission_id,task_key,role,dependencies,state)
    VALUES('a',$1,'structure','preparer',ARRAY[]::text[],'running')`,[a]);
  await pool.query(`INSERT INTO control_attempts(id,project_id,mission_id,task_key,runner_id,generation,state,lease_until)
    VALUES ($1,'a',$2,'structure','analyseur',1,'running',now()+interval '5 minutes')`,[randomUUID(),a]);
  await pool.query(`INSERT INTO control_contacts(project_id,runner_id,role,last_seen) VALUES
    ('a','analyseur','preparer',now()),('a','hors-ligne','preparer',now()-interval '5 minutes'),
    ('b','b-confidentiel','verifier',now())`);
  await pool.query(`INSERT INTO studio_backup_checks(id,outcome,detail) VALUES ($1,'verified','preuve-administrateur')`,[randomUUID()]);
  const data = await readWorkspace(pool,operator,runners);
  assert.deepEqual(data.projects.map(p => p.id),['a']);
  assert.deepEqual(data.agents.map(desk => [desk.id,desk.state]),[['analyseur','working'],['hors-ligne','offline'],['relecteur','unseen']]);
  assert.equal(data.agents[0].records[0].mission_id,a);
  assert.equal(data.backup,undefined);
  assert(!JSON.stringify(data).includes('b-confidentiel'));
  await assert.rejects(get('/office?project=b',operator),{status:404});
  const filtered = await readWorkspace(pool,owner,runners,'b');
  assert.deepEqual(filtered.agents.map(d => d.id),['b-confidentiel']);
  assert.equal(filtered.backup?.outcome,'verified');
  assert(!JSON.stringify(filtered.backup).includes('preuve-administrateur'));
  const desk = await get('/office?station=analyseur&stationProject=a&role=preparer&follow=1',operator);
  assert.equal(desk.refresh,undefined);
  assert.match(desk.html,/data-follow="on"/);
  assert.match(desk.html,/class="office-station occupied"/);
  assert(desk.html.includes('/projects/a/control/'+a));
  assert.match(desk.html,/Contrôle &lt;Atelier&gt;/);
  const center = await get('/workspace',operator);
  assert(!center.html.includes('b-confidentiel'));
  assert(!center.html.includes('Dernier contrôle de sauvegarde'));
  assert(center.html.includes('/projects/a/control/'+a));
  await pool.query(`UPDATE control_attempts SET lease_until=now()-interval '1 second' WHERE mission_id=$1`,[a]);
  const idle = await get('/office?station=analyseur&stationProject=a&role=preparer&follow=1',operator);
  assert.equal(idle.refresh,undefined);
  assert.doesNotMatch(idle.html,/class="office-station occupied"/);
  assert.match(idle.html,/Bail expiré/);
  assert.match(idle.html,/data-follow="on"/);
  assert.match((await get('/office?follow=0',operator)).html,/Suivi en pause/);
});
