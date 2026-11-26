import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {before,after,test} from 'node:test';
import type {Pool} from 'pg';
import {createPool} from '../src/config.ts';
import {migrate,Core} from '../src/core.ts';
import {importSource,revokeSource} from '../src/explorer-store.ts';
import {attachEvidence} from '../src/knowledge-evidence.ts';
import {schemaQuality} from '../src/schema-quality.ts';
import {activityFilter,readActivity} from '../src/activity.ts';
import {agentPresence} from '../src/product-workspace.ts';
import {createControlMission,commandMission,controlDetail} from '../src/control-room.ts';
import {claimControl,completeControl} from '../src/control-room-queue.ts';
import {executeControl} from '../src/control-room-adapters.ts';

const actor={id:'recette-evolution',accountRole:'operator' as const,projectIds:['a']};
let manager:Pool,db:Pool,core:Core,testName='';
before(async()=>{
  const url=new URL(process.env.DATABASE_URL!);manager=createPool(url.href);
  const name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  await manager.query('CREATE DATABASE '+name+' TEMPLATE template0');testName=name;
  url.pathname='/'+name;db=createPool(url.href);await migrate(db);core=new Core(db);
});
after(async()=>{try{await db?.end();if(testName)await manager.query('DROP DATABASE '+testName);}finally{await manager?.end();}});

test('Dossier séquentiel · enregistrement des dépendances, ordre de travail et preuves indépendantes',async()=>{
  const m=await createControlMission(db,actor,'a',randomUUID(),{purpose:'audit',standard:'Contrôle synthétique',planMode:'sequential',objective:'Audit de recette',
    scope:'Dossier fictif',constraints:'Local',document:'# Résultat\nPreuve synthétique',criteria:['Preuve'],risk:'normal',durationMinutes:5});
  await commandMission(db,actor,'a',m.id,'plan',randomUUID(),1);
  const maker={id:'atelier-m',projectId:'a',role:'preparer' as const},reviewer={id:'atelier-v',projectId:'a',role:'verifier' as const};
  assert.equal(await claimControl(db,reviewer),null);
  for(const [key,runner] of [['structure',maker],['coverage',reviewer],['synthesis',reviewer]] as const) {
    const work=await claimControl(db,runner);assert.ok(work);assert.equal(work.task,key);assert.deepEqual(work.input.briefDetails,{standard:'Contrôle synthétique'});
    await completeControl(db,runner,work.attemptId,work.generation,executeControl(work));
  }
  const done=await controlDetail(db,actor,'a',m.id);
  assert.equal(done.mission.status,'completed');assert.deepEqual(done.tasks[1].dependencies,['structure']);
  assert.equal(done.tasks[2].result.verdict,'PASS');assert.equal(done.attempts.length,3);
  assert.deepEqual(agentPresence([]),{registered:0,available:0,busy:0,connected:0,offline:0,unseen:0,latestFailed:0});
});

test('Schéma → qualité → mémoire → journal · version liée et révocation dans chaque surface',async()=>{
  const imported=await importSource(db,actor,'a',{environment:'test',label:'Atelier',origin:'sql',document:
    'CREATE TABLE ateliers(id int PRIMARY KEY); CREATE TABLE pieces(atelier_id int REFERENCES ateliers(id));'});
  const params=new URLSearchParams({source:imported.source,snapshot:imported.id});
  const audit=await schemaQuality(db,actor,'a',params);
  assert.equal(audit.report?.signals.foreignKeys,1);
  assert(audit.report?.findings.some(f=>f.object.endsWith('.pieces')&&f.category==='Identité'));
  const {id}=await core.knowledge.propose(actor,'a',{kind:'decision',origin:'human',scope:'reference',title:'Étudier la clé',content:'Vérifier le catalogue.',reference:''});
  const selection='schema/'+imported.id;
  await assert.rejects(attachEvidence(db,{...actor,accountRole:'viewer'},'a',id,1,selection),{status:403});
  await attachEvidence(db,actor,'a',id,1,selection);await attachEvidence(db,actor,'a',id,1,selection);
  const current=await core.knowledge.detail(actor,'a',id);assert.equal(current.evidence.attached.length,1);
  assert(current.evidence.attached[0].href.includes(imported.id));
  const filter=activityFilter(new URLSearchParams({days:'1',type:'schema'}));
  assert.equal((await readActivity(db,actor,'a',filter)).events.length,1);
  await assert.rejects(readActivity(db,actor,'b',filter),{status:404});
  assert.equal((await readActivity(db,{...actor,projectIds:['b']},'b',filter)).events.length,0);
  await assert.rejects(attachEvidence(db,actor,'a',id,2,selection),{status:409});
  await core.knowledge.revise(actor,'a',id,{action:'validate',version:1});
  const validated=await core.knowledge.detail(actor,'a',id);
  assert.deepEqual(validated.evidence.attached.map(e=>e.version),[2,1]);
  assert.deepEqual(validated.evidence.choices,[]);
  await assert.rejects(attachEvidence(db,actor,'a',id,2,selection),{status:409});
  await assert.rejects(revokeSource(db,actor,'a',imported.source),{status:403});
  await revokeSource(db,{...actor,accountRole:'admin'},'a',imported.source);
  assert.equal((await core.knowledge.detail(actor,'a',id)).evidence.attached.length,0);
  assert.equal((await readActivity(db,actor,'a',filter)).events.length,0);
  await assert.rejects(schemaQuality(db,actor,'a',params),{status:404});
});
