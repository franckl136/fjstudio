import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {after,before,test} from 'node:test';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import type {Pool} from 'pg';
import {createPool} from '../src/config.ts';
import {Core,migrate} from '../src/core.ts';
import {createServer} from '../src/http.ts';
import {importSource,revokeSource} from '../src/explorer-store.ts';
import {queueLab,runProductLabTick} from '../src/product-lab.ts';
import {saveCampaign,type Campaign} from '../src/product-campaign.ts';
import {controls,presets,profileCatalogue,profileReview,recordProfile,saveProfile} from '../src/quality-profiles.ts';

const op={id:'profil-tests',accountRole:'operator' as const,projectIds:['a']};
const viewer={...op,id:'profil-lecture',accountRole:'viewer' as const};
const admin={...op,id:'profil-admin',accountRole:'admin' as const,projectIds:['a','b']};
const sql={origin:'sql',environment:'test',label:'Atelier profils',reference:'001.sql',document:'CREATE TABLE atelier (id int PRIMARY KEY); ALTER TABLE atelier ENABLE ROW LEVEL SECURITY; CREATE POLICY lire ON atelier FOR SELECT USING (true);'};
const beforeSources=process.env.STUDIO_LAB_SOURCES;
let pool:Pool,main:Pool,name:string,created=false;
before(async()=>{
  const url=new URL(process.env.DATABASE_URL!);
  main=createPool(url.href);name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  await main.query('CREATE DATABASE '+name+' TEMPLATE template0');created=true;
  url.pathname='/'+name;pool=createPool(url.href);await migrate(pool);
  process.env.STUDIO_LAB_SOURCES='[]';
});
after(async()=>{
  if(beforeSources===undefined)delete process.env.STUDIO_LAB_SOURCES;else process.env.STUDIO_LAB_SOURCES=beforeSources;
  await pool?.end();if(created)await main.query('DROP DATABASE '+name);await main?.end();
});

test('Qualité · catalogue, édition par projet, concurrence et droits de lecture',async()=>{
  assert.equal(Object.keys(presets).length,6);assert.equal(Object.keys(controls).length,11);
  assert.deepEqual((await profileCatalogue(pool,viewer,'a','complete')).chosen.checks,Object.keys(controls));
  await assert.rejects(saveProfile(pool,viewer,'a','quick',['tests'],0),{status:403});
  await assert.rejects(profileCatalogue(pool,op,'b','quick'),{status:404});
  await assert.rejects(saveProfile(pool,op,'a','quick',['shell'],0),{status:400});
  await assert.rejects(saveProfile(pool,op,'a','quick',[],0),{status:400});
  const choice=await saveProfile(pool,op,'a','quick',['database','tests'],0);
  assert.deepEqual(choice,{revision:1,profile:'quick',checks:['tests','database']});
  assert.deepEqual(await saveProfile(pool,op,'a','quick',['tests','database'],0),choice);
  await assert.rejects(saveProfile(pool,op,'a','quick',['lint'],0),{status:409});
  assert.equal((await profileCatalogue(pool,admin,'b','quick')).chosen.revision,0);
  const race=await Promise.allSettled([saveProfile(pool,op,'a','quick',['tests'],1),saveProfile(pool,op,'a','quick',['rls'],1)]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((race.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.status,409);
});

test('Qualité · bilan versionné sans preuve, répétition et référence non substituable',async()=>{
  const fields={commandKey:randomUUID(),revision:0};
  const [a,b]=await Promise.all([recordProfile(pool,op,'a','release',fields),recordProfile(pool,op,'a','release',fields)]);
  assert.equal(a,b);const r=await profileReview(pool,viewer,'a',a);
  assert.equal(r.coverage,0);assert.equal(r.total,6);assert(r.observations.every(x=>x.status==='not_run'&&x.detail&&!x.proof));
  await assert.rejects(recordProfile(pool,viewer,'a','release',fields),{status:403});
  await assert.rejects(recordProfile(pool,op,'a','complete',fields),{status:409});
  await assert.rejects(profileReview(pool,admin,'b',a),{status:404});
  await saveProfile(pool,op,'a','release',['build'],0);
  assert.equal((await profileReview(pool,viewer,'a',a)).total,6);
  await assert.rejects(recordProfile(pool,op,'a','release',{commandKey:randomUUID(),revision:0}),{status:409});
});

test('Qualité · audit de photographie, empreinte, cloisonnement et révocation',async()=>{
  const s=await importSource(pool,op,'a',sql);
  const doc=await recordProfile(pool,op,'a','database',{commandKey:randomUUID(),revision:0,schema:s.id});
  const r=await profileReview(pool,viewer,'a',doc);
  assert.equal(r.coverage,2);assert(r.observations.every(x=>x.proof?.includes(s.id)&&x.digest?.length===64));
  assert.match(r.observations.find(x=>x.control==='rls')!.detail,/Tables avec RLS · 1 \/ policies · 1/);
  await assert.rejects(recordProfile(pool,admin,'b','database',{commandKey:randomUUID(),revision:0,schema:s.id}),{status:404});
  const stored=(await pool.query('SELECT digest FROM explorer_snapshots WHERE id=$1',[s.id])).rows[0].digest;
  await pool.query('UPDATE explorer_snapshots SET digest=$1 WHERE id=$2',['0'.repeat(64),s.id]);
  await assert.rejects(profileReview(pool,viewer,'a',doc),{status:409});
  await pool.query('UPDATE explorer_snapshots SET digest=$1 WHERE id=$2',[stored,s.id]);
  await revokeSource(pool,admin,'a',s.source);
  const hidden=await profileReview(pool,viewer,'a',doc);assert.equal(hidden.coverage,0);
  assert(hidden.observations.every(x=>!x.proof&&!x.digest&&x.status==='not_run'));
  assert(!(await profileCatalogue(pool,viewer,'a','database')).schemas.some(row=>row.id===s.id));
});

test('Qualité · vrai passage Git et worker local, rapport de campagne vérifié, commits cohérents',async()=>{
  const tempBase=resolve(tmpdir()),checkout=await mkdtemp(join(tempBase,'fjstudio-qa-profil-'));
  const git=(...args:string[])=>promisify(execFile)('git',args,{cwd:checkout,windowsHide:true,timeout:8000});
  try{
    await git('init','-q');await mkdir(join(checkout,'docs'));
    await writeFile(join(checkout,'docs','plan.md'),'Atelier de recette.');await writeFile(join(checkout,'page.html'),'<!doctype html><title>Atelier</title>');
    await writeFile(join(checkout,'package.json'),JSON.stringify({dependencies:{example:'1.0.0'},devDependencies:{}}));
    await git('add','--','docs','page.html','package.json');await git('-c','user.name=Studio Test','-c','user.email=test@localhost','-c','commit.gpgsign=false','commit','-qm','Recette synthétique');
    process.env.STUDIO_LAB_SOURCES=JSON.stringify([{project:'a',key:'atelier-test',directory:checkout,entry:'page.html',ref:'HEAD'}]);
    const run=await queueLab(pool,op,'a','atelier-test','structure',randomUUID());
    await assert.rejects(recordProfile(pool,op,'a','complete',{lab:run.id,revision:0,commandKey:randomUUID()}),{status:400});
    await runProductLabTick(pool);
    const sample=await queueLab(pool,op,'a','studio-sample','structure',randomUUID());await runProductLabTick(pool);
    await assert.rejects(recordProfile(pool,op,'a','complete',{lab:sample.id,revision:0,commandKey:randomUUID()}),{status:400});
    const summary=await profileCatalogue(pool,viewer,'a','complete');
    assert(summary.lab.some(x=>x.id===run.id));assert(summary.lab.every(x=>x.id!==sample.id));
    const now=new Date().toISOString(),stage={exitCode:0,elapsedMs:10,stdoutSha256:'a'.repeat(64),stderrSha256:'b'.repeat(64)};
    const report:Campaign={profile:'studio-npm-v1',startedAt:now,finishedAt:now,commitBefore:run.commit_sha,commitAfter:run.commit_sha,treeBefore:'clean',treeAfter:'clean',
      versions:{node:'24.0.0',npm:'11.0.0',typescript:'6.0.0',git:'2.55.0'},typecheck:stage,tests:stage,counts:{tests:2,suites:0,pass:1,fail:0,cancelled:0,skipped:1,todo:0}};
    const campaign=await saveCampaign(pool,report);
    const id=await recordProfile(pool,op,'a','complete',{lab:run.id,campaign:campaign.id,revision:0,commandKey:randomUUID()});
    const result=await profileReview(pool,viewer,'a',id),check=(k:string)=>result.observations.find(x=>x.control===k)!;
    assert.equal(result.total,11);assert.equal(result.coverage,6);
    assert.equal(check('tests').status,'warning');assert.equal(check('typecheck').status,'measured');assert.match(check('documentation').detail,/docs\/ est présent/);
    assert.match(check('dependencies').detail,/1 dépendance en production/);assert.match(check('architecture').detail,/docs/);assert.equal(check('security').status,'measured');
    assert.equal(check('build').status,'not_run');assert(result.observations.filter(x=>x.proof).every(x=>x.commit===run.commit_sha&&x.digest?.length===64));
    const different=await saveCampaign(pool,{...report,commitBefore:'1'.repeat(40),commitAfter:'1'.repeat(40)});
    await assert.rejects(recordProfile(pool,op,'a','complete',{lab:run.id,campaign:different.id,revision:0,commandKey:randomUUID()}),{status:400});
  }finally{
    process.env.STUDIO_LAB_SOURCES='[]';
    assert.equal(dirname(resolve(checkout)),tempBase);assert(basename(checkout).startsWith('fjstudio-qa-profil-'));
    await rm(checkout,{recursive:true,force:true,maxRetries:3});
  }
});

test('Qualité · navigation HTML, sauvegarde, bilan, validation JSON et projet refusé via HTTP',async()=>{
  const token=randomBytes(32).toString('base64url'),server=createServer(new Core(pool),[{id:'profil-http',kind:'operator',projectIds:['a'],token}]);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const url='http://127.0.0.1:'+(server.address() as AddressInfo).port,base='/projects/a/quality/profiles';
    const login=await fetch(url+'/login',{method:'POST',headers:{origin:url},body:new URLSearchParams({token}),redirect:'manual'});
    assert.equal(login.status,303);const cookie=login.headers.get('set-cookie')!.split(';')[0];
    const page=async(path:string)=>(await fetch(url+path,{headers:{cookie}})).text();
    const submit=(path:string,fields:Record<string,string>)=>fetch(url+path,{method:'POST',headers:{origin:url,cookie},body:new URLSearchParams(fields),redirect:'manual'});
    const home=await page(base+'?profile=security');for(const p of Object.values(presets))assert(home.includes(p.name));
    const saved=await submit(base+'/save',{profile:'security',revision:'0','check-lint':'on'});
    assert.equal(saved.status,303);assert((await page(saved.headers.get('location')!)).includes('version 1'));
    const entry=await submit(base+'/review',{profile:'security',revision:'1',commandKey:randomUUID()});
    assert.equal(entry.status,303);const location=entry.headers.get('location')!;
    const body=await page(location);assert.match(body,/Lint · Non exécuté/);assert.match(body,/0 contrôles documentés sur 1/);
    const headers={authorization:'Bearer '+token,'content-type':'application/json'};
    assert.equal((await fetch(url+'/api'+location,{headers})).status,200);
    assert.equal((await fetch(url+'/api'+base.replace('/a/','/b/'),{headers})).status,404);
    assert.equal((await fetch(url+'/api'+base+'/review',{method:'POST',headers,body:JSON.stringify({profile:'security',revision:1,commandKey:randomUUID(),shell:'dummy'})})).status,400);
  }finally{await new Promise<void>(done=>server.close(()=>done()));}
});
