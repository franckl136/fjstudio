import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { type Operator } from './contracts.ts';
import { notFound } from './database.ts';
import { campaignScope, listCampaigns, readCampaign, type Stage } from './product-campaign.ts';
import { date, e, layout } from './views.ts';

interface Tools {
  json(res:ServerResponse,status:number,data:unknown):void;
  html(res:ServerResponse,status:number,page:string):void;
}
const base='/projects/a/quality/campaigns';
const title='Campagnes de tests du Studio';
const treeLabels={clean:'Propre',changed:'Modifié',unknown:'Indéterminé'};
function stageRow(name:string,stage:Stage) {
  return `<tr><th scope="row">${e(name)}</th><td>${stage.exitCode===null?'Interrompu':String(stage.exitCode)}</td>
    <td>${(stage.elapsedMs/1000).toLocaleString('fr-FR')} s</td><td><code class="digest">${e(stage.stdoutSha256)}</code></td>
    <td><code class="digest">${e(stage.stderrSha256)}</code></td></tr>`;
}
export async function productCampaignRoute(pool:Pool,req:IncomingMessage,res:ServerResponse,url:URL,actor:Operator,api:boolean,io:Tools) {
  const path=api?url.pathname.slice(4):url.pathname;
  const matched=/^\/projects\/([^/]+)\/quality\/campaigns(?:\/([^/]+))?$/.exec(path);
  if (!matched) return false;
  const [,project,id]=matched;
  campaignScope(actor,project);
  if (req.method!=='GET') throw notFound();
  const data=id?await readCampaign(pool,actor,project,id):await listCampaigns(pool,actor,project);
  if (api) {io.json(res,200,data);return true;}
  const projects=(await pool.query<{id:string;name:string}>('SELECT id,name FROM projects WHERE id=ANY($1::text[]) ORDER BY name',[actor.projectIds])).rows;
  let content:string;
  if (Array.isArray(data)) {
    const rows=data.map(r=>`<li><a href="${base}/${e(r.id)}"><strong>${e(r.commit_sha.slice(0,12))}</strong>
      <span>${date(r.finished_at)}</span></a><span class="badge">${e(r.verdict)}</span></li>`).join('');
    content=`<a class="back" href="/projects/a/quality">← Quality Lab</a><header class="heading"><div><h1>${title}</h1>
      <p>Résultats du typage et de la suite npm sur le checkout local du Studio.</p></div></header>
      <section class="panel"><h2>Historique</h2>${rows?'<ul class="mission-list">'+rows+'</ul>':'<p>Aucune campagne enregistrée.</p>'}</section>`;
  } else {
    const r=data.report;
    const counts=r.counts;
    const totals=counts?`<dl><dt>Réussis</dt><dd>${counts.pass}</dd><dt>Échoués</dt><dd>${counts.fail}</dd>
      <dt>Ignorés</dt><dd>${counts.skipped}</dd><dt>Annulés</dt><dd>${counts.cancelled}</dd><dt>À faire</dt><dd>${counts.todo}</dd>
      <dt>Total des tests</dt><dd>${counts.tests}</dd></dl>`:'<p>Le bilan complet du runner de tests est indisponible.</p>';
    content=`<a class="back" href="${base}">← Campagnes de tests</a><header class="heading"><div><h1>Campagne du Studio</h1>
      <p>${date(r.startedAt)} → ${date(r.finishedAt)}</p></div><span class="badge">${e(data.verdict)}</span></header>
      <section class="panel"><h2>Révision vérifiée</h2>
      <p>Départ · ${treeLabels[r.treeBefore]} · <code class="digest">${e(r.commitBefore)}</code></p>
      <p>Arrivée · ${treeLabels[r.treeAfter]} · <code class="digest">${e(r.commitAfter??'indéterminée')}</code></p>
      <p>Node.js ${e(r.versions.node)} · npm ${e(r.versions.npm)} · TypeScript ${e(r.versions.typescript)} · Git ${e(r.versions.git)}</p>
      <p>Rapport SHA-256 <code class="digest">${e(data.report_sha)}</code></p></section>
      <section class="panel"><h2>Résultats des tests</h2>${totals}</section>
      <section class="panel"><h2>Commandes mesurées</h2><div class="table-wrap"><table><thead><tr><th>Commande</th><th>Code de sortie</th>
      <th>Durée</th><th>SHA-256 sortie standard</th><th>SHA-256 sortie d’erreur</th></tr></thead><tbody>
      ${stageRow('npm run typecheck',r.typecheck)}${stageRow('npm test',r.tests)}</tbody></table></div></section>`;
  }
  io.html(res,200,layout(title,content,projects,project,true,'quality'));return true;
}
