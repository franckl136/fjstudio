import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';
import type { Operator } from '../src/contracts.ts';
import { createPool } from '../src/config.ts';
import { Core, migrate } from '../src/core.ts';
import { createServer } from '../src/http.ts';
import { pollLabRule, queueLab, runProductLabTick, setLabRule } from '../src/product-lab.ts';
import { projectArchitecture, projectAutomations } from '../src/project-operations.ts';

const actor:Operator={id:'architecture-test',accountRole:'operator',projectIds:['a']};
const scopedViewer:Operator={id:'lecture-atelier',accountRole:'viewer',projectIds:['a']};
const source='site-test';
let pool:Pool, admin:Pool, database:string|undefined, root:string|undefined;
let previous:string|undefined;
let commit:string;
before(async()=>{
  const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/fjstudio_a1');
  const name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  admin=createPool(url.href);await admin.query('CREATE DATABASE '+name+' TEMPLATE template0');database=name;url.pathname='/'+name;
  pool=createPool(url.href);await migrate(pool);
  root=await mkdtemp(join(tmpdir(),'fj-architecture-'));
  function git(...args:string[]) {
    return execFileSync('git',['-c','core.hooksPath='+join(root!,'no-hooks'),'-c','commit.gpgSign=false','-c','user.name=Atelier',
      '-c','user.email=formation@example.invalid',...args],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  }
  git('init','--template=','-b','atelier');
  await mkdir(join(root,'src'));await writeFile(join(root,'src','module.txt'),'Exemple');
  await writeFile(join(root,'package.json'),'{"dependencies":{"exemple":"1"},"devDependencies":{}}');
  await writeFile(join(root,'index.html'),'<!doctype html><html lang="fr"><title>Exercice</title><main><h1>Atelier</h1></main></html>');
  git('add','--','src','package.json','index.html');git('commit','-m','Source synthétique');commit=git('rev-parse','HEAD');
  previous=process.env.STUDIO_LAB_SOURCES;
  process.env.STUDIO_LAB_SOURCES=JSON.stringify([{project:'a',key:source,directory:root,ref:'refs/heads/atelier',entry:'index.html'}]);
});
after(async()=>{
  if(previous===undefined) delete process.env.STUDIO_LAB_SOURCES;else process.env.STUDIO_LAB_SOURCES=previous;
  try{if(pool)await pool.end();if(database)await admin.query('DROP DATABASE '+database);}
  finally{if(admin)await admin.end();if(root)await rm(root,{recursive:true,force:true});}
});

test('Architecture · inventaire figé, source déclarée, historique, preuve et autorisations',async()=>{
  const initial=await projectArchitecture(pool,scopedViewer,'a');
  assert.equal(initial.observation,null);
  assert.equal(initial.catalog.find(s=>s.key===source)?.declaration?.ref,'refs/heads/atelier');
  assert.equal(initial.catalog.find(s=>s.key==='studio-types')?.declaration?.kind,'studio-example');
  const run=await queueLab(pool,actor,'a',source,'structure',randomUUID(),commit);
  await runProductLabTick(pool);
  const observed=await projectArchitecture(pool,scopedViewer,'a',run.id);
  const x=observed.observation!;
  assert.equal(x.id,run.id);assert.equal(x.state,'finished');assert.equal(x.commit,commit);assert.equal(x.verdict,'PASS');assert(x.worker);
  assert.deepEqual(x.manifests,['package.json']);assert.deepEqual(x.directories,['src']);assert.equal(x.dependencies,1);assert.equal(x.devDependencies,0);
  assert.match(x.reportSha256!,/^[a-f0-9]{64}$/);
  assert(!JSON.stringify(observed).includes(root!));assert(!JSON.stringify(observed).includes('source_html'));
  const saved=process.env.STUDIO_LAB_SOURCES;delete process.env.STUDIO_LAB_SOURCES;
  try {
    const removed=await projectArchitecture(pool,actor,'a');
    assert.equal(removed.catalog.find(s=>s.key===source)?.declaration,null);assert.equal(removed.observation?.id,run.id);
  } finally {process.env.STUDIO_LAB_SOURCES=saved;}
  await pool.query("UPDATE product_lab_runs SET inventory=inventory-'directories' WHERE id=$1",[run.id]);
  assert.equal((await projectArchitecture(pool,actor,'a',run.id)).observation?.directories,null);
  await assert.rejects(projectArchitecture(pool,actor,'b'),{status:404});
  await assert.rejects(projectArchitecture(pool,{...actor,projectIds:['a','b']},'b',run.id),{status:404});
  await pool.query("UPDATE product_lab_runs SET result_sha=repeat('e',64) WHERE id=$1",[run.id]);
  await assert.rejects(projectArchitecture(pool,actor,'a',run.id),{status:409});
  await pool.query('UPDATE product_lab_runs SET result_sha=$2 WHERE id=$1',[run.id,x.reportSha256]);
});

test('Automatisations · échéance réelle, résultat automatique distinct du manuel, suspension, périmètre',async()=>{
  assert.equal((await projectAutomations(pool,actor,'a')).rules.length,0);
  await setLabRule(pool,actor,'a',source,'structure','on-change',15);
  const configured=(await projectAutomations(pool,scopedViewer,'a')).rules[0];
  assert(configured.enabled&&configured.nextPoll);assert.equal(configured.lastRun,null);
  await pollLabRule(pool);
  let r=(await projectAutomations(pool,actor,'a')).rules[0];
  assert.equal(r.mode,'on-change');assert.equal(r.lastCommit,commit);assert.equal(r.lastRun?.state,'queued');assert.equal(r.lastResult,null);
  await runProductLabTick(pool);r=(await projectAutomations(pool,actor,'a')).rules[0];
  const finished=r.lastResult;
  assert.equal(finished?.verdict,'PASS');assert.equal(finished?.trigger_kind,'on-change');
  const manual=await queueLab(pool,actor,'a',source,'structure',randomUUID(),commit);
  await runProductLabTick(pool);
  assert.notEqual(manual.id,(await projectAutomations(pool,actor,'a')).rules[0].lastRun?.id);
  await setLabRule(pool,actor,'a',source,'structure','interval',5);
  await pollLabRule(pool);r=(await projectAutomations(pool,actor,'a')).rules[0];
  assert.equal(r.totalRuns,2);assert.equal(r.lastRun?.state,'queued');assert.equal(r.lastResult?.id,finished?.id);
  await setLabRule(pool,actor,'a',source,'structure','off',5);
  r=(await projectAutomations(pool,actor,'a')).rules[0];assert.equal(r.nextPoll,null);assert(!r.enabled);
  assert.equal(r.recent.length,2);assert.equal(r.intervalMinutes,5);
  await assert.rejects(projectAutomations(pool,actor,'b'),{status:404});
  assert(finished);
  const stored=(await pool.query<{result_sha:string}>('SELECT result_sha FROM product_lab_runs WHERE id=$1',[finished.id])).rows[0];
  await pool.query("UPDATE product_lab_runs SET result_sha=repeat('e',64) WHERE id=$1",[finished.id]);
  await assert.rejects(projectAutomations(pool,actor,'a'),{status:409});
  await pool.query('UPDATE product_lab_runs SET result_sha=$2 WHERE id=$1',[finished.id,stored.result_sha]);
});

test('Architecture et automatisations HTTP · lecture seule des données du projet autorisé',async()=>{
  const token=randomUUID(), server=createServer(new Core(pool),[{kind:'operator',id:'micro',projectIds:['a'],token}]);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address='http://127.0.0.1:'+(server.address() as AddressInfo).port;
  try{
    const headers={authorization:'Bearer '+token};
    for(const module of ['architecture','automations']){
      assert.equal((await fetch(address+'/api/projects/b/'+module,{headers})).status,404);
      assert.equal((await fetch(address+'/api/projects/a/'+module)).status,401);
      assert.equal((await fetch(address+'/api/projects/a/'+module,{method:'POST',headers})).status,405);
      assert.equal((await fetch(address+'/api/projects/a/'+module,{headers})).status,200);
    }
    const login=await fetch(address+'/login',{method:'POST',headers:{origin:address},body:new URLSearchParams({token}),redirect:'manual'});
    assert.equal(login.status,303);
    const cookie=login.headers.get('set-cookie')?.split(';')[0];assert(cookie);
    const architecture=await fetch(address+'/projects/a/architecture',{headers:{cookie}});
    assert.equal(architecture.status,200);
    const html=await architecture.text();assert.match(html,/Structure observée/);assert(html.includes(commit));
    const automations=await fetch(address+'/projects/a/automations',{headers:{cookie}});
    assert.equal(automations.status,200);
    const cards=await automations.text();assert.match(cards,/Dernier résultat automatique/);
    assert.match(cards,/#regles-lab/);assert.match(cards,/PASS/);
  } finally {await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});}
});
