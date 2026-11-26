import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { DomainError, isProjectId, type Operator } from './contracts.ts';
import { assertProject, notFound } from './database.ts';
import { listWorkspaceProjects } from './product-workspace-projects.ts';
import { labProfiles } from './product-lab.ts';
import { projectArchitecture, projectAutomations } from './project-operations.ts';
import { date, e, layout } from './views.ts';

type Architecture=Awaited<ReturnType<typeof projectArchitecture>>;
type Automations=Awaited<ReturnType<typeof projectAutomations>>;
type IO={html(res:ServerResponse,status:number,value:string):void;json(res:ServerResponse,status:number,value:unknown):void};
const states={queued:'En file',running:'En cours',finished:'Terminé'};
const triggers={manual:'Demande manuelle','on-change':'Changement de commit',interval:'Échéance'};
function escapedList(rows:string[]|null) {
  if(rows===null) return 'Information absente de cette capture';
  if(!rows.length) return 'Aucun élément reconnu dans les noms recherchés';
  return rows.map(x=>'<code>'+e(x)+'</code>').join(' · ');
}
const kindName=(kind:string|undefined)=>kind==='studio-example'?'Exemple du Studio':kind==='project'?'Source du projet':'Déclaration retirée';
function architecturePage(d:Architecture) {
  const base='/projects/'+encodeURIComponent(d.project),obs=d.observation;
  const sourceRows=d.catalog.map(s=>`<tr><th scope="row">${e(s.key)}</th><td>${kindName(s.declaration?.kind)}</td>
    <td>${s.declaration?`<code>${e(s.declaration.entry)}</code><br><small>Réf. ${e(s.declaration.ref)}</small>`:'—'}</td>
    <td>${s.latest?`<a href="${base}/architecture?run=${e(s.latest.id)}#capture">${e(s.latest.commit_sha.slice(0,12))}</a><br><small>${date(s.latest.created_at)}</small>`:'Aucun passage observé'}</td></tr>`).join('');
  const snapshots=obs?`<section class="panel" id="capture"><header class="section-head"><div><h2>Capture · ${e(obs.source)}</h2>
    <p>Source figée dans App Lab le ${date(obs.capturedAt)}.</p></div>
    <a href="${base}/quality/${e(obs.id)}">Ouvrir le passage et ses preuves →</a></header>
    <nav class="summary-strip" aria-label="Suivre le flux de preuve de cette capture">
      <div><span>Entrée Git</span><a href="#entree"><code>${e(obs.commit.slice(0,12))}</code></a></div>
      <div><span>Inventaire figé</span><a href="#inventaire">${obs.manifests===null?'Couverture inconnue':obs.manifests.length+' manifeste(s)'}</a></div>
      <div><span>Traitement</span><a href="#execution">${e(labProfiles[obs.profile].title)}</a></div>
      <div><span>Preuve du passage</span><a href="${base}/quality/${e(obs.id)}">${e(obs.verdict??states[obs.state])}</a></div></nav>
    <h3 id="entree">Entrée Git au moment du passage</h3><dl class="facts"><dt>Fichier</dt><dd><code>${e(obs.entry)}</code></dd>
    <dt>Commit</dt><dd><code class="digest">${e(obs.commit)}</code></dd><dt>SHA-256 de la source</dt><dd><code class="digest">${e(obs.sourceSha256)}</code></dd></dl>
    <h3 id="inventaire">Structure observée à la racine du dépôt</h3><dl class="facts"><dt>Dossiers reconnus</dt><dd>${escapedList(obs.directories)}</dd>
    <dt>Manifestes reconnus</dt><dd>${escapedList(obs.manifests)}</dd><dt>Dépendances déclarées dans package.json</dt>
    <dd>${obs.dependencies??'Inconnu'} en exécution · ${obs.devDependencies??'Inconnu'} en développement</dd></dl>
    <p>Le relevé couvre des noms de dossiers et de manifestes prédéfinis. Les services déployés, routes API et communications entre composants restent à documenter.</p>
    <h3 id="execution">Exécution et résultat</h3><dl class="facts"><dt>Profil</dt><dd>${e(labProfiles[obs.profile].title)} · ${e(obs.profileVersion)}</dd>
      <dt>Déclencheur</dt><dd>${triggers[obs.trigger]}</dd><dt>État</dt><dd>${states[obs.state]}</dd>
      <dt>Worker observé</dt><dd>${e(obs.worker??'Aucun worker enregistré')}</dd>
      ${obs.started?'<dt>Démarrage</dt><dd>'+date(obs.started)+'</dd>':''}
      ${obs.runnerNode?'<dt>Runtime du worker</dt><dd>Node '+e(obs.runnerNode)+'</dd>':''}
      ${obs.browser?'<dt>Navigateur du runner</dt><dd>'+e(obs.browser)+'</dd>':''}
      ${obs.compiler?'<dt>Compilateur du runner</dt><dd>'+e(obs.compiler)+'</dd>':''}
      <dt>Verdict</dt><dd>${e(obs.verdict??'En attente de résultat')}</dd>
      ${obs.finished?'<dt>Fin</dt><dd>'+date(obs.finished)+'</dd>':''}
      ${obs.reportSha256?'<dt>SHA-256 du rapport vérifié</dt><dd><code class="digest">'+e(obs.reportSha256)+'</code></dd>':''}</dl></section>`:
      '<section class="panel"><h2>Première capture</h2><p>Le projet ne possède pas encore de passage App Lab. Une qualification sur une source autorisée figera son premier inventaire.</p><a href="'+base+'/quality">Ouvrir Quality Lab</a></section>';
  return `<header class="heading"><div><h1>Architecture Explorer</h1><p>Déclarations locales et preuves du projet</p></div><a href="${base}">Fiche projet</a></header>
    <section class="panel"><h2>Sources et dernières captures</h2><p>La déclaration indique l’entrée et la référence autorisées aujourd’hui. Chaque capture conserve le commit réellement lu.</p>
    <div class="table-wrap"><table><thead><tr><th>Source</th><th>Provenance</th><th>Déclaration actuelle</th><th>Dernière capture</th></tr></thead><tbody>${sourceRows}</tbody></table></div></section>
    ${snapshots}<section class="panel"><h2>Schémas associés au projet</h2>${d.schemaSources.length?'<ul>'+d.schemaSources.map(s=>'<li><a href="'+base+'/database?source='+e(s.id)+'">'+e(s.label)+'</a> · '+e(s.environment)+' · '+e(s.origin)+'</li>').join('')+'</ul>':'<p>Aucune source de schéma accessible pour ce projet.</p>'}
    <a href="${base}/database">Ouvrir Database Explorer</a></section>`;
}
function automationsPage(d:Automations,actor:Operator) {
  const base='/projects/'+encodeURIComponent(d.project);
  const configuration=actor.accountRole==='viewer'?'Consulter les règles dans Quality Lab':'Configurer les règles dans Quality Lab';
  const cards=d.rules.map(r=>{
    const history=r.recent.length?'<details><summary>Historique · '+r.totalRuns+' passage(s) automatique(s)</summary><ul>'+r.recent.map(h=>
      '<li><a href="'+base+'/quality/'+e(h.id)+'">'+date(h.created_at)+'</a> · '+triggers[h.trigger_kind]+' · '+e(h.verdict??states[h.state])+'</li>').join('')+'</ul></details>':'';
    return `<section class="panel"><header class="section-head"><div><h2>${e(r.source)} · ${e(labProfiles[r.profile].title)}</h2>
      <p>${kindName(r.declaration?.kind)} · règle ${r.enabled?'activée':'suspendue'}</p></div>
      <a href="${base}/quality#regles-lab">${configuration}</a></header><dl class="facts">
      <dt>Déclencheur</dt><dd>${r.mode==='on-change'?'Changement de commit depuis le dernier contrôle':'Échéance périodique'}</dd>
      <dt>Fréquence de vérification</dt><dd>${r.intervalMinutes} min</dd><dt>Prochain contrôle prévu</dt><dd>${r.nextPoll?date(r.nextPoll):'Suspendu'}</dd>
      <dt>Derni&egrave;re configuration</dt><dd>${date(r.modified)} · ${e(r.modifiedBy)}</dd>
      <dt>Message du planificateur</dt><dd>${e(r.lastPollMessage??'Aucun contrôle enregistré')}</dd>
      <dt>Dernier commit enregistré</dt><dd>${r.lastCommit?'<code class="digest">'+e(r.lastCommit)+'</code>':'Inconnu'}</dd>
      <dt>Dernier lancement automatique</dt><dd>${r.lastRun?`<a href="${base}/quality/${e(r.lastRun.id)}">${date(r.lastRun.created_at)}</a> · ${states[r.lastRun.state]}`:'Aucun lancement enregistré'}</dd>
      <dt>Dernier résultat automatique</dt><dd>${r.lastResult?`<a href="${base}/quality/${e(r.lastResult.id)}">${e(r.lastResult.verdict)}</a> · ${date(r.lastResult.finished_at)}`:'Aucun passage automatique terminé'}</dd></dl>${history}</section>`;
  }).join('');
  return `<header class="heading"><div><h1>Centre d’automatisation</h1><p>Règles App Lab et passages déclenchés localement.</p></div><a href="${base}">Fiche projet</a></header>
    ${cards||'<section class="panel"><h2>Aucune règle configurée</h2><p>Les demandes manuelles restent consultables dans l’historique du Lab.</p><a href="'+base+'/quality#regles-lab">'+configuration+'</a></section>'}
    ${cards?'<p>Le calendrier indique les contrôles prévus. L’historique couvre les versions successives des règles pour la même source et le même profil.</p>':''}`;
}
export async function projectOperationsRoute(pool:Pool,req:IncomingMessage,res:ServerResponse,url:URL,actor:Operator,api:boolean,io:IO) {
  const match=/^\/projects\/([^/]+)\/(architecture|automations)$/.exec(api?url.pathname.slice(4):url.pathname);
  if(!match) return false;
  const [,project,section]=match;
  if(!isProjectId(project)) throw notFound();
  assertProject(actor,project);
  if(req.method!=='GET') throw new DomainError(405,'operations_method','Consultation en lecture seule.');
  if(section==='architecture') {
    const data=await projectArchitecture(pool,actor,project,url.searchParams.get('run'));
    if(api) io.json(res,200,data);else io.html(res,200,layout('Architecture Explorer',architecturePage(data),await listWorkspaceProjects(pool,actor),project,true,'lab'));
  } else {
    const data=await projectAutomations(pool,actor,project);
    if(api) io.json(res,200,data);else io.html(res,200,layout('Centre d’automatisation',automationsPage(data,actor),await listWorkspaceProjects(pool,actor),project,true,'quality'));
  }
  return true;
}
