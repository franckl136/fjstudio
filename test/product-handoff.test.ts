import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { after,before,test } from 'node:test';
import type { Pool } from 'pg';
import { composeDatabaseUrl } from '../scripts/postgres-tools.ts';
import { createPool } from '../src/config.ts';
import { migrate } from '../src/core.ts';
import { digestJson,type Operator } from '../src/contracts.ts';
import { commandMission, controlDetail, createControlMission } from '../src/control-room.ts';
import { Knowledge } from '../src/knowledge.ts';
import { exportHandoff,handoffHistory,importHandoff } from '../src/product-handoff.ts';
import { productHandoffRoute } from '../src/product-handoff-routes.ts';

const actor:Operator={id:'human-fixture',projectIds:['a'],accountRole:'operator'};
const viewer:Operator={...actor,accountRole:'viewer'};
const other:Operator={...actor,projectIds:['b']};
const brief={objective:'Examiner le planning',scope:'Atelier synthétique.',constraints:'Préserver les horaires.',
  document:'Document privé synthétique sur les horaires.',criteria:['horaires'],risk:'normal',durationMinutes:15};
let admin:Pool,pool:Pool;
let name='',mission='',fact='';
let knowledge:Knowledge;
async function prepare() {
  const {id}=await createControlMission(pool,actor,'a',randomUUID(),brief);
  await commandMission(pool,actor,'a',id,'plan',randomUUID(),1);
  return id;
}
before(async()=>{
  const url=composeDatabaseUrl();assert.equal(url.pathname,'/fjstudio_a1');admin=createPool(url.href);
  const target='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  await admin.query('CREATE DATABASE '+target+' TEMPLATE template0');name=target;
  url.pathname='/'+target;pool=createPool(url.href);await migrate(pool);
  knowledge=new Knowledge(pool);
  ({id:fact}=await knowledge.propose(actor,'a',{kind:'goal',origin:'human',scope:'control',title:'Planning',content:'Contexte synthétique confidentiel.'}));
  await knowledge.revise(actor,'a',fact,{version:1,action:'validate'});
  mission=await prepare();
});
after(async()=>{try{await pool?.end();if(name)await admin.query('DROP DATABASE '+name);}finally{await admin?.end();}});
const settings=()=>({commandKey:randomUUID(),revision:2,includeDocument:false,includeContext:false});

test('Échange · consentements distincts, export idempotent, empreinte et cloisonnement',async()=>{
  const options=settings();
  const [first,replay]=await Promise.all([1,2].map(()=>exportHandoff(pool,actor,'a',mission,options)));
  assert.deepEqual(first,replay);assert.equal(first.sha256,digestJson(first.dossier));
  assert.equal(first.dossier.document,undefined);assert.equal(first.dossier.context,undefined);
  assert.doesNotMatch(JSON.stringify(first),/Document privé|Contexte synthétique confidentiel/);
  assert.equal(first.responseTemplate.dossierSha256,first.sha256);
  await assert.rejects(exportHandoff(pool,actor,'a',mission,{...options,includeDocument:true}),{status:409});
  const withDocument=await exportHandoff(pool,actor,'a',mission,{...settings(),includeDocument:true});
  assert.equal(withDocument.dossier.document,brief.document);assert.equal(withDocument.dossier.context,undefined);
  const withContext=await exportHandoff(pool,actor,'a',mission,{...settings(),includeContext:true});
  assert.equal(withContext.dossier.context?.[0].id,fact);assert.equal(withContext.dossier.context?.[0].version,2);
  assert.equal(withContext.dossier.document,undefined);
  const draft=await createControlMission(pool,actor,'a',randomUUID(),{...brief,risk:'review'});
  await commandMission(pool,actor,'a',draft.id,'plan',randomUUID(),1);
  await assert.rejects(exportHandoff(pool,actor,'a',draft.id,settings()),{status:409});
  await assert.rejects(exportHandoff(pool,viewer,'a',mission,settings()),{status:403});
  await assert.rejects(exportHandoff(pool,{...actor,accountRole:undefined},'a',mission,settings()),{status:403});
  await assert.rejects(handoffHistory(pool,other,'a',mission),{status:404});
  await assert.rejects(handoffHistory(pool,other,'b',mission),{status:404});
  const history=await handoffHistory(pool,viewer,'a',mission);
  assert.equal(history.items.length,3);assert.doesNotMatch(JSON.stringify(history),/Document privé|Contexte synthétique confidentiel/);
});

test('Échange · réponse inertée, import atomique, arbitrage et intégrité des checkpoints',async()=>{
  const dossier=await exportHandoff(pool,actor,'a',mission,settings());
  const previous=await controlDetail(pool,actor,'a',mission);
  const response={...dossier.responseTemplate,title:'Horaires à vérifier',content:'La rencontre pourrait commencer à onze heures.'};
  await assert.rejects(importHandoff(pool,actor,'a',mission,{...response,verdict:'PASS'}),{status:400});
  await assert.rejects(importHandoff(pool,actor,'a',mission,{...response,content:'x'.repeat(2401)}),{status:400});
  await assert.rejects(importHandoff(pool,viewer,'a',mission,response),{status:403});
  await assert.rejects(importHandoff(pool,actor,'a',mission,{...response,dossierSha256:'0'.repeat(64)}),{status:409});
  await assert.rejects(importHandoff(pool,actor,'a',await prepare(),response),{status:404});
  const [one,two]=await Promise.all([importHandoff(pool,actor,'a',mission,response),importHandoff(pool,actor,'a',mission,response)]);
  assert.deepEqual(one,two);assert.equal(one.responseSha256,digestJson(response));
  await assert.rejects(importHandoff(pool,actor,'a',mission,{...response,title:'Autre réponse'}),{status:409});
  const added=(await knowledge.detail(actor,'a',one.id)).item;
  assert.equal(added.status,'proposed');assert.equal(added.scope,'reference');assert.equal(added.origin,'agent');
  await knowledge.revise(actor,'a',one.id,{version:1,action:'reject'});
  const current=await controlDetail(pool,actor,'a',mission);
  assert.equal(current.mission.status,previous.mission.status);assert.equal(current.mission.revision,previous.mission.revision);
  assert.deepEqual(current.tasks,previous.tasks);assert.deepEqual(current.attempts,previous.attempts);
  assert.equal(current.events.filter(e=>e.event_type==='handoff.proposed').length,1);
  const audit=(await handoffHistory(pool,viewer,'a',mission)).items.find(k=>k.proposal_id===one.id);
  assert.equal(audit?.status,'rejected');assert.equal(audit?.imported_by,actor.id);
});

test('Échange · téléchargement local par formulaire, dépôt de proposition et contexte devenu obsolète',async()=>{
  const req={method:'POST'} as IncomingMessage;
  const headers:Record<string,string>={};
  const res={setHeader:(k:string,v:string)=>{headers[k]=v;}} as ServerResponse;
  const base='http://127.0.0.1/projects/a/control/'+mission+'/handoff';
  let payload:Record<string,unknown>={commandKey:randomUUID(),revision:'2'},value:unknown,path='';
  const io={body:async()=>payload,json:(_r:ServerResponse,_status:number,data:unknown)=>{value=data;},html:()=>{},redirect:(_r:ServerResponse,url:string)=>{path=url;}};
  assert.equal(await productHandoffRoute(pool,req,res,new URL(base+'/export'),actor,false,io),true);
  assert.match(headers['Content-Disposition'],/^attachment; filename="studio-dossier-/);
  const file=value as Awaited<ReturnType<typeof exportHandoff>>;
  assert.equal(file.dossier.document,undefined);assert.equal(file.dossier.context,undefined);
  payload={response:JSON.stringify({...file.responseTemplate,title:'Proposition à relire',content:'Texte synthétique.'})};
  await productHandoffRoute(pool,req,res,new URL(base+'/import'),actor,false,io);
  assert.match(path,/^\/projects\/a\/knowledge\/[a-f0-9-]{36}$/);
  const id=path.split('/').at(-1)!;
  await knowledge.revise(actor,'a',id,{action:'validate',version:1});
  assert.equal((await knowledge.detail(actor,'a',id)).item.status,'validated');
  const previous=await exportHandoff(pool,actor,'a',mission,{...settings(),includeContext:true});
  await knowledge.revise(actor,'a',fact,{version:2,action:'revoke'});
  await assert.rejects(exportHandoff(pool,actor,'a',mission,{...settings(),includeContext:true}),{status:409});
  assert.equal(previous.dossier.context?.length,1);
  assert.equal((await exportHandoff(pool,actor,'a',mission,settings())).dossier.context,undefined);
});
