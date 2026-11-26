import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';
import { createPool } from '../src/config.ts';
import { Core, migrate } from '../src/core.ts';
import { createServer } from '../src/http.ts';
import { digestJson, type Operator } from '../src/contracts.ts';
import { beginLesson, checkLesson, notebook, teachingSchema } from '../src/academy.ts';
import { lessons, academyGuide } from '../src/academy-catalog.ts';
import { helpSearch } from '../src/academy-help.ts';

const person:Operator={id:'formation',accountRole:'operator',projectIds:['a']};
const viewer:Operator={id:'lecture',accountRole:'viewer',projectIds:['a']};
let db:Pool,maintenance:Pool,database:string|undefined;
before(async()=>{
  const url=new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/fjstudio_a1');
  const name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  maintenance=createPool(url.href);
  await maintenance.query('CREATE DATABASE '+name+' TEMPLATE template0');
  database=name;url.pathname='/'+name;db=createPool(url.href);await migrate(db);
});
after(async()=>{
  try {if(db) await db.end();if(database) await maintenance.query('DROP DATABASE '+database);}
  finally {if(maintenance) await maintenance.end();}
});
async function businessCounts() {
  return (await db.query('SELECT (SELECT count(*) FROM projects)::int AS projets,(SELECT count(*) FROM missions)::int AS missions,(SELECT count(*) FROM control_missions)::int AS control,(SELECT count(*) FROM product_lab_runs)::int AS lab,(SELECT count(*) FROM project_repositories)::int AS dépôts')).rows[0];
}
test('Academy · 19 exercices, preuves recalculées, transactions, reprise et carnet isolé',async()=>{
  const before=await businessCounts();
  assert.equal(lessons.length,19);
  await beginLesson(db,person,'plan');
  await assert.rejects(checkLesson(db,person,'plan','plan'),{status:409});
  assert.equal((await notebook(db,person)).stage,0);
  for(const l of lessons) {
    await beginLesson(db,person,l.id);
    if(l.id==='decouvrir') {
      assert.equal((await checkLesson(db,person,l.id,'lab')).correct,false);
      assert.equal((await notebook(db,person)).progress.find(p=>p.lesson===l.id)?.completed_at,null);
      await assert.rejects(checkLesson(db,person,l.id,'saisie-libre'),{status:400});
    }
    const answer=l.id==='projets'?'cuivre':l.id==='preuve'?(await notebook(db,person)).practice.synthesis!.sha256:l.answer;
    if(l.id==='qualite') assert.equal((await checkLesson(db,person,l.id,'pass')).correct,false);
    const [a,b]=await Promise.all([checkLesson(db,person,l.id,answer),checkLesson(db,person,l.id,answer)]);
    assert.equal(a.correct,true);assert.deepEqual(a,b);
    if(['mission','plan','tache','resultat'].includes(l.id)) {
      const w=(await notebook(db,person)).practice;
      assert.equal(w.mission!.projectId,w.projectId);
      assert.equal(w.mission!.status,({mission:'draft',plan:'planned',tache:'running',resultat:'completed'})[l.id]);
      if(l.id==='plan') assert.deepEqual(w.tasks!.map(t=>t.state),['ready','ready','waiting']);
      if(l.id==='tache') assert.deepEqual(w.tasks!.map(t=>t.state),['completed','completed','ready']);
      if(l.id==='resultat') assert(w.tasks!.every(t=>t.state==='completed'));
    }
  }
  const receipt=await notebook(db,person),work=receipt.practice;
  assert.equal(receipt.stage,6);assert.equal(receipt.progress.filter(r=>r.completed_at).length,19);
  assert.equal(work.project,'Atelier Cuivre');
  assert.equal(work.tasks!.length,3);assert.deepEqual(work.tasks![2].dependencies,['structure','coverage']);
  assert.deepEqual(new Set(work.tasks!.map(t=>t.assignee)),new Set(['Lou · Academy','Iris · Academy']));
  assert.equal(work.checkpoints!.structure.sha256,digestJson(work.checkpoints!.structure.artifact));
  assert.equal(work.checkpoints!.coverage.sha256,digestJson(work.checkpoints!.coverage.artifact));
  assert.equal(work.synthesis!.sha256,digestJson(work.synthesis!.artifact));assert.equal(work.synthesis!.artifact.verdict,'PASS');
  assert.equal(receipt.progress.find(p=>p.lesson==='qualite')!.evidence!.verdict,'failed');
  assert.equal((await checkLesson(db,person,'projets','papier')).correct,false);
  assert.equal((await checkLesson(db,person,'mission','ambre','controle')).correct,false);
  await assert.rejects(checkLesson(db,person,'mission','ambre','libre'),{status:400});
  assert.equal((await notebook(db,person)).practice.project,'Atelier Cuivre');
  assert.deepEqual(await businessCounts(),before);
  assert.deepEqual((await notebook(db,{...person,id:'voisin'})).practice,{});
  assert.equal((await notebook(db,{id:person.id,projectIds:[]})).progress.length,0);
  await assert.rejects(beginLesson(db,viewer,'projets'),{status:403});
  await assert.rejects(checkLesson(db,viewer,'projets','papier'),{status:403});
  await assert.rejects(beginLesson(db,person,'inconnue'),{status:404});
  assert.equal((await notebook(db,viewer)).progress.length,0);
});
test('Academy · aide locale, FK et comparaison PostgreSQL exactes, RLS lue depuis la déclaration',async()=>{
  const s=await teachingSchema();
  assert.deepEqual(s.relation,{from:'travaux.atelier_id',to:'ateliers.id'});
  assert.equal(s.rls,true);assert.equal(s.policy.command,'SELECT');assert.equal(s.policy.using,'true');
  assert.deepEqual(s.changes,['public.travaux.colonne.titre']);
  assert(helpSearch('REDIGER un brief').lessons.some(l=>l.id==='mission'));
  assert(helpSearch('sauvegarde').docs.some(d=>d.id==='recovery'));assert.deepEqual(helpSearch('<img NO_RESULT>'),{docs:[],lessons:[]});
  assert.equal(academyGuide('quality'),'/academy/qualite');
});

test('Academy HTTP · authentification, rôle, contexte et identité imposés par le serveur',async()=>{
  const auth=randomUUID(),reader=randomUUID();
  const api=createServer(new Core(db),[{kind:'operator',id:'api-academy',token:auth,projectIds:['a']},
    {kind:'operator',id:'api-lecture',accountRole:'viewer',token:reader,projectIds:['a']}]);
  api.listen(0,'127.0.0.1');await once(api,'listening');
  try {
    const base='http://127.0.0.1:'+(api.address() as AddressInfo).port+'/api/academy';
    const request=(suffix:string,key?:string,data?:unknown)=>fetch(base+suffix,{method:data===undefined?'GET':'POST',headers:{
      ...(key?{authorization:'Bearer '+key}:{}),'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
    assert.equal((await request('')).status,401);
    assert.equal((await request('/projets?project=b',auth)).status,404);
    assert.equal((await request('/decouvrir/start',reader,{})).status,403);
    assert.equal((await request('/decouvrir/start',auth,{owner:'lecture'})).status,400);
    assert.equal((await request('/decouvrir/start',auth,{})).status,200);
    assert.equal((await request('/decouvrir/check',auth,{answer:'office'})).status,422);
    assert.equal((await request('/decouvrir/check',auth,{answer:'workspace'})).status,200);
    assert.equal((await (await request('/decouvrir',reader)).json()).progress,null);
    assert((await (await request('/decouvrir',auth)).json()).progress.completed_at);
  } finally {await new Promise<void>(resolve=>api.close(()=>resolve()));}
});
