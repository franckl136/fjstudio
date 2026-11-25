import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { DomainError, isProjectId, type JsonObject, type Operator } from './contracts.ts';
import { assertId, assertProject, notFound } from './database.ts';
import { e, date, layout } from './views.ts';
import { statuses } from './knowledge.ts';
import { exportHandoff, importHandoff, handoffHistory } from './product-handoff.ts';

interface Tools{
  body(req:IncomingMessage,kind:'form'|'json'):Promise<JsonObject>;
  html(res:ServerResponse,status:number,page:string):void;
  json(res:ServerResponse,status:number,data:unknown):void;
  redirect(res:ServerResponse,path:string):void;
}
const invalid=()=>new DomainError(400,'handoff_input','Vérifiez le formulaire ou le JSON de réponse.');
function selected(v:unknown,api:boolean) {
  if (v===undefined || (api && v===false)) return false;
  if (v===(api?true:'yes')) return true;
  throw invalid();
}
function readableStatus(value:string|null) {
  return value && Object.hasOwn(statuses,value)?statuses[value as keyof typeof statuses]:'En attente de réponse';
}
export async function productHandoffRoute(pool:Pool,req:IncomingMessage,res:ServerResponse,url:URL,actor:Operator,api:boolean,io:Tools) {
  const path=api?url.pathname.slice(4):url.pathname;
  const match=/^\/projects\/([^/]+)\/control\/([^/]+)\/handoff(?:\/(export|import))?$/.exec(path);
  if (!match) return false;
  const [,project,mission,action]=match;
  if (!isProjectId(project)) throw notFound();
  assertProject(actor,project);assertId(mission);
  const missionPath='/projects/'+project+'/control/'+mission;
  const base=missionPath+'/handoff';
  if (req.method==='GET'&&!action) {
    const data=await handoffHistory(pool,actor,project,mission);
    if(api) {io.json(res,200,data);return true;}
    const canWrite=actor.accountRole==='operator'||actor.accountRole==='admin';
    const projects=(await pool.query('SELECT id,name FROM projects WHERE id=ANY($1::text[]) ORDER BY name',[actor.projectIds])).rows;
    const rows=data.items.map(h=>`<li><strong>Révision ${h.revision} · ${e(readableStatus(h.status))}</strong>
      <span>${date(h.created_at)} · ${e(h.actor)} · document ${h.include_document?'inclus':'omis'} · contexte ${h.include_context?'inclus':'omis'}</span>
      <p>Empreinte du dossier <code class="digest">${e(h.dossier_sha)}</code></p>
      ${h.proposal_id?`<p><a href="/projects/${project}/knowledge/${e(h.proposal_id)}">Examiner la proposition</a> · ${date(h.imported_at)} · ${e(h.imported_by)}</p>`:''}</li>`).join('');
    const forms=canWrite && data.eligible?`<section class="panel"><h2>Exporter un dossier</h2>
      <p>Le JSON comprend l’objectif, le périmètre, les contraintes, les critères et les empreintes de cette révision. Son modèle de réponse peut être rempli à la main ou à l’aide de votre outil.</p>
      <form method="post" action="${base}/export"><input type="hidden" name="commandKey" value="${randomUUID()}">
      <input type="hidden" name="revision" value="${data.revision}">
      <label><input type="checkbox" name="includeDocument" value="yes"> Inclure le texte du document de mission</label>
      <label><input type="checkbox" name="includeContext" value="yes"> Inclure le contenu des fiches validées retenues par le plan</label>
      <button>Télécharger le dossier JSON</button></form></section>
      <section class="panel"><h2>Importer une réponse</h2><p>Collez l’objet responseTemplate complété. Le Studio créera une proposition à examiner dans Project Intelligence.</p>
      <form method="post" action="${base}/import"><label>Réponse JSON<textarea name="response" rows="8" maxlength="12000" required></textarea></label>
      <button>Importer comme proposition</button></form></section>`:'';
    io.html(res,200,layout('Échange manuel',`<a class="back" href="${missionPath}">← Mission</a><header class="heading"><div><h1>Échange manuel</h1>
      <p>${e(data.title)} · révision ${data.revision}</p></div></header>${forms}
      ${canWrite&&!data.eligible?'<p>Les échanges sont ouverts lorsque le plan est prêt, en cours ou terminé.</p>':''}
      <section class="panel"><h2>Dossiers et propositions</h2>${rows?'<ul class="history">'+rows+'</ul>':'<p>Aucun dossier exporté.</p>'}</section>`,projects,project,true,'control'));
  } else if (req.method==='POST'&&action) {
    if (!['operator','admin'].includes(actor.accountRole??'')) throw new DomainError(403,'handoff_operator','Un compte humain opérateur ou administrateur est requis.');
    const input=await io.body(req,api?'json':'form');
    if(action==='export') {
      if(Object.keys(input).some(k=>!['commandKey','revision','includeDocument','includeContext'].includes(k)) || typeof input.commandKey!=='string' ||
        (api?typeof input.revision!=='number':typeof input.revision!=='string')) throw invalid();
      const result=await exportHandoff(pool,actor,project,mission,{commandKey:input.commandKey,revision:Number(input.revision),
        includeDocument:selected(input.includeDocument,api),includeContext:selected(input.includeContext,api)});
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('Content-Disposition','attachment; filename="studio-dossier-'+result.dossier.exportId+'.json"');
      io.json(res,200,result);
    } else {
      let response:unknown=input;
      if (!api) {
        if(Object.keys(input).length!==1 || typeof input.response!=='string'||input.response.length>12000) throw invalid();
        try {response=JSON.parse(input.response);} catch {throw invalid();}
      }
      const result=await importHandoff(pool,actor,project,mission,response);
      if(api) io.json(res,200,result);else io.redirect(res,'/projects/'+project+'/knowledge/'+result.id);
    }
  } else throw notFound();
  return true;
}
