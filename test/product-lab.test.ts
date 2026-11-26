import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { Pool } from 'pg';
import { composeDatabaseUrl } from '../scripts/postgres-tools.ts';
import { createPool } from '../src/config.ts';
import { migrate } from '../src/core.ts';
import { transaction } from '../src/database.ts';
import type { Operator } from '../src/contracts.ts';
import { labSources, readLabSnapshot } from '../src/product-lab-source.ts';
import { compareLab, detailLab, evidencePng, listLab, pollLabRule, queueLab, quarantineProductLab, runProductLabTick, setLabRule } from '../src/product-lab.ts';
import { productLabRoute } from '../src/product-lab-routes.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';

const actor: Operator = {id:'lab-operator',projectIds:['a']};
const peer: Operator = {id:'other-operator',projectIds:['b']};
let temp: string;
let source: string;
let first: string;
let second: string;
let admin: Pool;
let pool: Pool;
let created = '';
let oldSources: string | undefined;
const entry = 'index.html';

function git(args: string[], input?: Buffer | string) {
  return execFileSync('git',['-C',source,...args],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],
    env:{...process.env,GIT_COMMITTER_NAME:'Fixture',GIT_AUTHOR_NAME:'Fixture',GIT_COMMITTER_EMAIL:'lab@example.invalid',
      GIT_AUTHOR_EMAIL:'lab@example.invalid',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'}}).trim();
}
function revision(bytes: Buffer | string, previous?: string, unit = 'export const slot: number = 1;') {
  const blob=git(['hash-object','-w','--stdin'],bytes);
  const unitBlob = git(['hash-object','-w','--stdin'],unit);
  const pkg=git(['hash-object','-w','--stdin'],'{"dependencies":{"fixture":"1"},"devDependencies":{}}');
  const tree=git(['mktree'],`100644 blob ${blob}\tindex.html\n100644 blob ${pkg}\tpackage.json\n100644 blob ${unitBlob}\tunit.ts\n`);
  return git(['commit-tree',tree,...(previous?['-p',previous]:[]),'-m','Version de qualification']);
}

before(async()=>{
  oldSources=process.env.STUDIO_LAB_SOURCES;
  temp=await mkdtemp(join(tmpdir(),'fjstudio-lab-'));
  source=join(temp,'fixture');
  execFileSync('git',['init','--initial-branch=atelier',source],{windowsHide:true,stdio:'ignore'});
  first=revision('<html lang="fr"><head><title>Atelier incomplet</title></head><body><main>Contenu</main></body></html>',undefined,'export const slot: number = false;');
  second=revision(await readFile(new URL('../fixtures/product-lab.html',import.meta.url)),first);
  git(['update-ref','refs/heads/atelier',second]);
  process.env.STUDIO_LAB_SOURCES=JSON.stringify([{project:'a',key:'atelier',directory:source,entry,ref:'refs/heads/atelier'},
    {project:'a',key:'atelier-types',directory:source,entry:'unit.ts',ref:'refs/heads/atelier'}]);
  const url=composeDatabaseUrl();
  assert.equal(url.pathname,'/fjstudio_a1');
  admin=createPool(url.href);
  const name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  await admin.query('CREATE DATABASE '+name+' TEMPLATE template0');
  created=name; url.pathname='/'+name; pool=createPool(url.href); await migrate(pool);
});
after(async()=>{
  if (oldSources===undefined) delete process.env.STUDIO_LAB_SOURCES; else process.env.STUDIO_LAB_SOURCES=oldSources;
  try { await pool?.end(); if(created)await admin.query('DROP DATABASE '+created); } finally {
    await admin?.end(); if(temp)await rm(temp,{recursive:true,force:true});
  }
});

test('App Lab · lecture bornée d’une révision Git et inventaire des manifestes',async()=>{
  const target=labSources('a').find(s=>s.key==='atelier')!;
  const snapshot=await readLabSnapshot(target);
  assert.equal(snapshot.commit,second);assert.equal(snapshot.entry,entry);
  assert.deepEqual(snapshot.inventory,{manifests:['package.json'],dependencies:1,devDependencies:0,directories:[]});
  assert.equal((await readLabSnapshot(target,first)).commit,first);
  const unreachable=revision('<html>Version indépendante</html>');
  await assert.rejects(readLabSnapshot(target,unreachable),{code:'lab_snapshot'});
  await assert.rejects(readLabSnapshot(target,'HEAD'),{code:'lab_snapshot'});
  assert.equal(labSources('b').some(s=>s.key==='atelier'),false);
});

test('Quality Lab · réservation rejouable, mesures réelles et comparaison entre commits',async()=>{
  const command=randomUUID();
  const [one,duplicate]=await Promise.all([queueLab(pool,actor,'a','atelier','structure',command,first),
    queueLab(pool,actor,'a','atelier','structure',command,first)]);
  assert.equal(one.id,duplicate.id);
  assert.ok(await runProductLabTick(pool));
  const before=await detailLab(pool,actor,'a',one.id);assert.equal(before.verdict,'FAIL');
  assert.equal(before.result?.checks.find(c=>c.id==='doctype')?.status,'failed');
  await assert.rejects(queueLab(pool,actor,'a','atelier','structure',command,second),{status:409});
  const after=await queueLab(pool,actor,'a','atelier','structure',randomUUID(),second);
  assert.ok(await runProductLabTick(pool));
  assert.equal((await detailLab(pool,actor,'a',after.id)).verdict,'PASS');
  const diff=await compareLab(pool,actor,'a',before.id,after.id);
  assert.deepEqual(diff.rows.find(c=>c.title==='Déclaration HTML5'),
    {title:'Déclaration HTML5',before:'failed',after:'passed',observed:'Doctype HTML5 en tête du document.'});
  await assert.rejects(detailLab(pool,peer,'a',one.id),{status:404});
  await assert.rejects(detailLab(pool,peer,'b',one.id),{status:404});
  const other=await listLab(pool,peer,'b');assert.equal(other.runs.length,0);assert.equal(other.rules.length,0);
  await assert.rejects(evidencePng(pool,actor,'a',one.id),{status:404});
});

test('App Lab · Chromium réel sans réseau, capture PNG mesurée et remise cloisonnée',async t=>{
  const job=await queueLab(pool,actor,'a','atelier','visual',randomUUID(),second);
  assert.ok(await runProductLabTick(pool));
  const row=await detailLab(pool,actor,'a',job.id);
  assert.equal(row.verdict,'PASS','Vérifier la présence de l’image Chromium épinglée dans Docker local.');
  assert.equal(row.result?.checks.find(c=>c.id==='heading')?.status,'passed');
  const png=await evidencePng(pool,actor,'a',job.id);
  assert.equal(png.readUInt32BE(16),960);assert.equal(png.readUInt32BE(20),600);
  assert.equal(row.screenshot_sha,row.result?.screenshotSha256);
  await assert.rejects(evidencePng(pool,peer,'b',job.id),{status:404});
  t.diagnostic(JSON.stringify({ profile:row.profile_version,commit:row.commit_sha,browser:row.result?.browser,
    verdict:row.verdict,width:960,height:600,bytes:png.length,screenshot:row.screenshot_sha,profileResults:row.result?.checks.length }));
});

test('App Lab · conserve le motif borné quand le worker ne reconnaît plus le profil réservé',async()=>{
  const job=await queueLab(pool,actor,'a','atelier','visual',randomUUID(),second);
  await pool.query("UPDATE product_lab_runs SET profile_version='fixture-retired-v1' WHERE id=$1",[job.id]);
  assert.ok(await runProductLabTick(pool));
  const row=await detailLab(pool,actor,'a',job.id);
  assert.equal(row.verdict,'NOT QUALIFIED');
  const execution=row.result?.checks.find(check=>check.id==='execution');
  assert.equal(execution?.status,'not_run');
  assert.match(execution?.observed ?? '',/\[snapshot\]$/);
  assert.equal(row.screenshot_sha,null);
});

test('Quality Lab · compilateur strict local, erreur de type et dépendance hors profil',async t=>{
  const third = revision('<!doctype html>',second,"import type { Slot } from './external'; export type Result = Slot;");
  const fourth = revision('<!doctype html>',third,'// @ts-nocheck\nconst x: number = false;');
  git(['update-ref','refs/heads/atelier',fourth]);
  try {
    for (const [commit,expected] of [[first,'FAIL'],[second,'PASS'],[third,'NOT QUALIFIED'],[fourth,'NOT QUALIFIED']] as const) {
      const job=await queueLab(pool,actor,'a','atelier-types','typescript',randomUUID(),commit);
      assert.ok(await runProductLabTick(pool));
      const row=await detailLab(pool,actor,'a',job.id);
      assert.equal(row.verdict,expected);
      assert.match(row.result?.compiler ?? '',/^\d+\.\d+\.\d+$/);
      assert.match(row.result?.toolchainSha256 ?? '',/^[a-f0-9]{64}$/);
      if (commit === fourth) assert.match(row.result!.checks.at(-1)!.observed,/directive/);
      if (expected === 'FAIL') assert.match(row.result!.checks.at(-1)!.observed,/TS2322 L1/);
      t.diagnostic(JSON.stringify({profile:row.profile_version,compiler:row.result?.compiler,verdict:row.verdict,
        toolchain:row.result?.toolchainSha256,measured:row.result?.checks.at(-1)?.observed}));
    }
    await assert.rejects(queueLab(pool,actor,'a','atelier','typescript',randomUUID()),{code:'lab_profile'});
  } finally { git(['update-ref','refs/heads/atelier',second]); }
});

test('Quality Lab · formulaires opérateur et lecture seule',async()=>{
  const viewer = {...actor,accountRole:'viewer'} as const;
  let markup='';
  const io={body:async()=>({}),json:()=>{},redirect:()=>{},html:(_res:ServerResponse,_status:number,page:string)=>{markup=page;}};
  const req={method:'GET'} as IncomingMessage;
  const res={} as ServerResponse;
  const url=new URL('http://127.0.0.1/projects/a/quality');
  await productLabRoute(pool,req,res,url,actor,false,io);
  assert.match(markup,/name="selection"/);assert.match(markup,/atelier-types:typescript/);assert.doesNotMatch(markup,/atelier-types:visual/);
  assert(markup.includes('value="atelier:structure:'+second+'"'));
  assert(markup.includes('data-nature="Démonstration · exemple synthétique du Studio"'));
  assert(markup.includes('data-nature="Audit statique du fichier du projet"'));
  const displayed=second,third=revision('<!doctype html>',second);
  git(['update-ref','refs/heads/atelier',third]);
  try {
    let location='';
    const launch={...io,body:async()=>({selection:'atelier:structure:'+displayed,commandKey:randomUUID(),commit:''}),redirect:(_r:ServerResponse,dest:string)=>{location=dest;}};
    await productLabRoute(pool,{method:'POST'} as IncomingMessage,res,url,actor,false,launch);
    const pinned=await detailLab(pool,actor,'a',location.split('/').at(-1)!);
    assert.equal(pinned.commit_sha,displayed);
    await productLabRoute(pool,req,res,new URL(location,url),actor,false,io);
    assert(markup.includes('id="revision"'));assert(markup.includes('Audit statique du fichier du projet'));
  } finally { git(['update-ref','refs/heads/atelier',second]); }
  await productLabRoute(pool,req,res,url,viewer,false,io);
  assert.doesNotMatch(markup,/name="selection"|Configurer une règle|Nouvelle qualification/);
  await assert.rejects(queueLab(pool,viewer,'a','atelier','structure',randomUUID()),{status:403});
  await assert.rejects(setLabRule(pool,viewer,'a','atelier','structure','interval',5),{status:403});
});

test('Quality Lab · révision locale, déclenchement périodique et gel après restauration',async()=>{
  await setLabRule(pool,actor,'a','atelier','structure','on-change',5);
  await Promise.all([pollLabRule(pool),pollLabRule(pool)]);
  const count=async()=>(await pool.query("SELECT count(*)::int AS n FROM product_lab_runs WHERE trigger_kind<>'manual'")).rows[0].n;
  assert.equal(await count(),1);
  await pool.query("UPDATE product_lab_rules SET next_at=clock_timestamp()");
  await pollLabRule(pool);assert.equal(await count(),1);
  git(['update-ref','refs/heads/atelier',first]);await pool.query("UPDATE product_lab_rules SET next_at=clock_timestamp()");
  await pollLabRule(pool);assert.equal(await count(),2);
  await setLabRule(pool,actor,'a','atelier','structure','interval',5);
  await pollLabRule(pool);assert.equal(await count(),3);
  await transaction(pool,quarantineProductLab);
  const state=await listLab(pool,actor,'a');
  assert.equal(state.rules[0].enabled,false);
  assert.equal(state.runs.filter(r=>r.trigger_kind!=='manual' && r.verdict==='NOT QUALIFIED').length,3);
  assert.equal(await runProductLabTick(pool),false);
  git(['update-ref','refs/heads/atelier',second]);
});

test('Quality Lab · quotas, passage interrompu et paramètres du contrat HTTP',async()=>{
  const queued=[];
  for(let i=0;i<4;i++)queued.push(await queueLab(pool,actor,'a','atelier','structure',randomUUID()));
  await assert.rejects(queueLab(pool,actor,'a','atelier','structure',randomUUID()),{status:409,code:'lab_quota'});
  await pool.query("UPDATE product_lab_runs SET state='running',started_at=clock_timestamp()-interval '2 minutes' WHERE id=$1",[queued[0].id]);
  assert.ok(await runProductLabTick(pool));
  assert.equal((await detailLab(pool,actor,'a',queued[0].id)).verdict,'NOT QUALIFIED');
  const req={method:'POST'} as IncomingMessage;
  const res={} as ServerResponse;
  const url=new URL('http://127.0.0.1/api/projects/a/quality');
  const replies:unknown[]=[];
  const tools={body:async()=>({commandKey:randomUUID(),source:'atelier',profile:'structure',port:3030}),
    json:(_res:ServerResponse,_status:number,data:unknown)=>{replies.push(data);},html:()=>{},redirect:()=>{}};
  await assert.rejects(productLabRoute(pool,req,res,url,actor,true,tools),{status:400});
  await assert.rejects(productLabRoute(pool,req,res,url,peer,true,tools),{status:404});
  assert.deepEqual(replies,[]);
});
