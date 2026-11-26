import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { DomainError, type JsonObject, type Operator } from './contracts.ts';
import { assertProject, notFound } from './database.ts';
import { listWorkspaceProjects } from './product-workspace-projects.ts';
import { captureReview, decideReview, listReviews, reviewDetail, reviewProject } from './product-review.ts';
import { currentReviewHead,reviewBranch } from './product-review-source.ts';
import { date, e, layout } from './views.ts';

interface IO {
  body(req:IncomingMessage,kind:'json'|'form'):Promise<JsonObject>;
  json(res:ServerResponse,status:number,value:unknown):void;
  html(res:ServerResponse,status:number,value:string):void;
  redirect(res:ServerResponse,path:string):void;
}
const changeLabels:Record<string,string>={A:'Ajout',M:'Modification',D:'Suppression',T:'Changement de type'};
const decisionLabels={approved:'Approuvée',changes_requested:'Révision demandée'};
const path='/projects/'+reviewProject+'/review';
export async function productReviewRoute(pool:Pool,req:IncomingMessage,res:ServerResponse,url:URL,actor:Operator,api:boolean,io:IO) {
  const matched=/^\/projects\/([^/]+)\/review(?:\/([^/]+)(\/decision)?)?$/.exec(api?url.pathname.slice(4):url.pathname);
  if(!matched) return false;
  const [,project,id,decision]=matched;
  assertProject(actor,project);
  if(project!==reviewProject) throw notFound();
  const canWrite=actor.accountRole==='admin'||actor.accountRole==='operator';
  if(req.method==='GET' && !decision) {
    let content:string;
    if(id) {
      const data=await reviewDetail(pool,actor,project,id);
      if(api) {io.json(res,200,data);return true;}
      const r=data.review;
      const changes=r.summary.map(f=>`<li><strong>${e(changeLabels[f.change])}</strong> <code>${e(f.path)}</code>
        ${f.visibility==='preview' ? '<details><summary>Lire les changements</summary><pre>'+e(f.excerpt || 'Mode du fichier modifié.')+'</pre>'+
          (f.shortened?'<p>Extrait limité.</p>':'')+'</details>' : '<small>'+(f.visibility==='sensitive'?'Fichier sensible · contenu masqué':'Métadonnées seules')+'</small>'}</li>`).join('');
      const votes=data.decisions.map(d=>`<li>${e(decisionLabels[d.decision])} · ${e(d.actor)} · ${date(d.at)}</li>`).join('');
      const decided=data.decisions.some(d=>d.actor===actor.id);
      content=`<a class="back" href="${path}">← Revues Git</a><h1>Revue du commit</h1><section class="panel"><h2>${e(r.branch)}</h2>
      <p>Créée par ${e(r.created_by)} · ${date(r.created_at)}</p><p>Parent <code>${e(r.base_sha)}</code></p>
      <p>Commit <code>${e(r.head_sha)}</code></p><p>Empreinte du reçu <code class="digest">${e(r.digest)}</code></p></section>
      <section class="panel"><h2>Changements · ${r.summary.length}</h2><ul class="quality-results">${changes}</ul></section>
      <section class="panel"><h2>Décisions humaines</h2>${votes?'<ul class="history">'+votes+'</ul>':'<p>Aucune décision enregistrée.</p>'}
      ${canWrite&&!decided?`<form method="post" action="${path}/${e(r.id)}/decision"><label>Décision<select name="decision"><option value="changes_requested">Demander une révision</option><option value="approved">Approuver</option></select></label>
        <label><input type="checkbox" name="confirm" value="yes" required> Je confirme mon avis sur les extraits et métadonnées de ce commit.</label>
        <button>Enregistrer la décision</button></form>`:''}</section>`;
    } else {
      const rows=await listReviews(pool,actor,project);
      const captureAvailable=canWrite && await currentReviewHead().then(()=>true,()=>false);
      if(api) {io.json(res,200,{reviews:rows,captureAvailable});return true;}
      const history=rows.map(r=>`<li><a href="${path}/${e(r.id)}"><strong>${e(r.head_sha.slice(0,12))}</strong><span>${date(r.created_at)} · ${e(r.created_by)}</span></a></li>`).join('');
      content=`<a class="back" href="/projects/a">← Projet</a><h1>Revue des changements Git</h1>
        <section class="panel"><h2>Dépôt du Studio</h2><p>Examinez le dernier commit de <code>${e(reviewBranch)}</code> par rapport à son premier parent.</p>
        ${captureAvailable?`<form action="${path}" method="post"><button>Capturer les changements</button></form>`:canWrite?'<p>La capture requiert un checkout local valide sur cette branche. Les reçus existants restent consultables ci-dessous.</p>':''}</section>
        <section class="panel"><h2>Revues enregistrées</h2>${history?'<ul class="mission-list">'+history+'</ul>':'<p>Aucune revue enregistrée.</p>'}</section>`;
    }
    io.html(res,200,layout('Revue des changements Git',content,await listWorkspaceProjects(pool,actor),project,true));
  } else if(req.method==='POST' && (!id||decision)) {
    if(!canWrite) throw new DomainError(403,'git_review_actor','Un compte humain opérateur ou administrateur est requis.');
    const input=await io.body(req,api?'json':'form');
    const keys=Object.keys(input);
    if(!id && keys.length || id && (keys.length!==2 || !keys.includes('decision') || !keys.includes('confirm'))) {
      throw new DomainError(400,'git_review_fields','Paramètres de revue invalides.');
    }
    if(!id) {
      const row=await captureReview(pool,actor,project);
      if(api) io.json(res,201,row);else io.redirect(res,path+'/'+row.id);
    } else {
      const row=await decideReview(pool,actor,project,id,input.decision,input.confirm);
      if(api) io.json(res,200,row);else io.redirect(res,path+'/'+id);
    }
  } else throw notFound();
  return true;
}
