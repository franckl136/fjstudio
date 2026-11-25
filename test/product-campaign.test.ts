import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { composeDatabaseUrl } from '../scripts/postgres-tools.ts';
import { createPool } from '../src/config.ts';
import { migrate } from '../src/core.ts';
import { digestJson, type Operator } from '../src/contracts.ts';
import { CampaignCounters, campaignVerdict, listCampaigns, parseTestCounts, readCampaign, saveCampaign, type Campaign } from '../src/product-campaign.ts';
import { productCampaignRoute } from '../src/product-campaign-routes.ts';

const summary = ['ℹ tests 10','ℹ suites 2','ℹ pass 7','ℹ fail 1','ℹ cancelled 0','ℹ skipped 1','ℹ todo 1','ℹ duration_ms 23.96'].join('\n');
const digest='3'.repeat(64);
const viewer:Operator={id:'reader',accountRole:'viewer',projectIds:['a']};
let db:Pool;
let admin:Pool;
let dbName='';
before(async()=>{
  const url=composeDatabaseUrl(); assert.equal(url.pathname,'/fjstudio_a1');
  admin=createPool(url.href);
  const name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  await admin.query('CREATE DATABASE '+name+' TEMPLATE template0');
  dbName=name; url.pathname='/'+name;db=createPool(url.href);await migrate(db);
});
after(async()=>{
  try {await db?.end();if(dbName)await admin.query('DROP DATABASE '+dbName);} finally {await admin?.end();}
});

function example():Campaign {
  return {profile:'studio-npm-v1',startedAt:'2026-11-25T20:00:00.000Z',finishedAt:'2026-11-25T20:00:01.000Z',commitBefore:'a'.repeat(40),
    commitAfter:'a'.repeat(40),treeBefore:'clean',treeAfter:'clean',versions:{node:'24.12.0',npm:'11.4.1',git:'2.51.0.windows.1',typescript:'5.9.3'},
    typecheck:{exitCode:0,elapsedMs:100,stdoutSha256:digest,stderrSha256:digest},tests:{exitCode:0,elapsedMs:600,stdoutSha256:digest,stderrSha256:digest},
    counts:{tests:2,suites:0,pass:2,fail:0,cancelled:0,skipped:0,todo:0}};
}

test('Campagnes · compteurs TAP/spec délimités, flux fragmenté et bilan ambigu',()=>{
  const expected={tests:10,suites:2,pass:7,fail:1,cancelled:0,skipped:1,todo:1};
  assert.deepEqual(parseTestCounts(summary),expected);
  assert.deepEqual(parseTestCounts(summary.replaceAll('ℹ','#').replaceAll('\n','\r\n')),expected);
  assert.equal(parseTestCounts(summary.replace('pass 7','pass 6')),null);
  const stream=new CampaignCounters();
  const bytes=Buffer.from('private '+('x'.repeat(1000))+'\n'+summary+'\n✖ failing tests:\nprivate diagnostic\n');
  for(let n=0;n<bytes.length;n+=2)stream.feed(bytes.subarray(n,n+2));
  stream.finish();assert.deepEqual(stream.value,expected);
  stream.feed(Buffer.from(summary+'\n'));stream.finish();assert.equal(stream.value,null);
});

test('Campagnes · verdict incomplet, arbre divergent, réserves et échecs',()=>{
  const stable=example();
  assert.equal(campaignVerdict(stable),'PASS');
  assert.equal(campaignVerdict({...stable,counts:null}),'NOT QUALIFIED');
  assert.equal(campaignVerdict({...stable,treeAfter:'changed'}),'NOT QUALIFIED');
  assert.equal(campaignVerdict({...stable,commitAfter:'b'.repeat(40)}),'NOT QUALIFIED');
  assert.equal(campaignVerdict({...stable,counts:{...stable.counts!,pass:1,skipped:1}}),'PASS WITH RESERVATIONS');
  assert.equal(campaignVerdict({...stable,typecheck:{...stable.typecheck,exitCode:2}}),'FAIL');
  assert.equal(campaignVerdict({...stable,tests:{...stable.tests,exitCode:null}}),'NOT QUALIFIED');
});

test('Campagnes · empreinte PostgreSQL, consultation lecteur et isolement du projet Studio',async()=>{
  const campaign=example();
  const receipt=await saveCampaign(db,campaign);
  assert.equal(receipt.digest,digestJson(campaign));
  assert.equal((await readCampaign(db,viewer,'a',receipt.id)).verdict,'PASS');
  assert.equal((await listCampaigns(db,viewer,'a')).length,1);
  const peer={...viewer,projectIds:['b']};
  await assert.rejects(readCampaign(db,peer,'a',receipt.id),{status:404});
  await assert.rejects(listCampaigns(db,peer,'b'),{status:404});
  await assert.rejects(saveCampaign(db,{...campaign,versions:{...campaign.versions,git:'unrestricted data'}}),{code:'campaign_evidence'});
  await assert.rejects(saveCampaign(db,{...campaign,log:'unrestricted data'} as Campaign),{code:'campaign_evidence'});
  const rowUrl=new URL('http://127.0.0.1/projects/a/quality/campaigns/'+receipt.id);
  let html='';
  const io={json:()=>{},html:(_res:ServerResponse,status:number,content:string)=>{assert.equal(status,200);html=content;}};
  const req={method:'GET'} as IncomingMessage,res={} as ServerResponse;
  assert.equal(await productCampaignRoute(db,req,res,rowUrl,viewer,false,io),true);
  assert.match(html,/npm run typecheck/);assert.match(html,/SHA-256/);assert.doesNotMatch(html,/unrestricted data/);
  await assert.rejects(productCampaignRoute(db,{method:'POST'} as IncomingMessage,res,rowUrl,viewer,false,io),{status:404});
  await db.query('UPDATE product_campaigns SET report_sha=$2 WHERE id=$1',[receipt.id,'0'.repeat(64)]);
  await assert.rejects(readCampaign(db,viewer,'a',receipt.id),{code:'campaign_integrity'});
});
