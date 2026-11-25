import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { DomainError, isProjectId, type JsonObject, type Operator, type ProjectId } from './contracts.ts';
import { assertProject, notFound } from './database.ts';
import { date, e, layout } from './views.ts';
import { compareLab, detailLab, evidencePng, labProfiles, listLab, queueLab, setLabRule } from './product-lab.ts';

type LabState = Awaited<ReturnType<typeof listLab>>;
type LabRun = Awaited<ReturnType<typeof detailLab>>;
interface HttpTools {
  body(req: IncomingMessage, kind: 'json'|'form'): Promise<JsonObject>;
  json(res: ServerResponse, status: number, value: unknown): void;
  html(res: ServerResponse, status: number, value: string): void;
  redirect(res: ServerResponse, path: string): void;
}
const states = { queued: 'En file', running: 'Exécution', finished: 'Terminé' };
const checkStates = {passed:'Réussi',failed:'Échec',warning:'Réserve',not_run:'Non exécuté'};
const triggers = {manual:'Opérateur',interval:'Échéance','on-change':'Changement Git'};
const compareStates: Record<string,string> = checkStates;
function exact(input: JsonObject, keys: string[]) {
  if (Object.keys(input).length !== keys.length || keys.some(k=>!Object.hasOwn(input,k)))
    throw new DomainError(400,'lab_parameters','Champs du formulaire invalides.');
}
function textValue(value:unknown) {
  if (typeof value !== 'string' || value.length > 160)
    throw new DomainError(400,'lab_parameters','Valeur du formulaire invalide.');
  return value;
}
function readSelection(input:JsonObject, api:boolean, other:string[]) {
  exact(input, [...(api ? ['source','profile'] : ['selection']), ...other]);
  if (api) return [textValue(input.source),textValue(input.profile)] as const;
  const pair = textValue(input.selection).split(':');
  if (pair.length !== 2) throw new DomainError(400,'lab_parameters','Sélection de source invalide.');
  return [pair[0],pair[1]] as const;
}
function option(value: string, text: string, selected = false) {
  return `<option value="${e(value)}"${selected?' selected':''}>${e(text)}</option>`;
}
function showOverview(project:ProjectId, page:'lab'|'quality', data:LabState, writable:boolean) {
  const base = '/projects/'+project+'/'+page;
  const isLab = page === 'lab';
  const heading = isLab ? 'App Lab' : 'Quality Lab';
  const selections = data.sources.map(source => {
    const compatible = source.entry.endsWith('.ts') ? ['typescript'] as const : ['structure','visual'] as const;
    const options = compatible.filter(profile => !isLab || profile === 'visual').map(profile =>
      option(source.key + ':' + profile, source.entry + ' · ' + labProfiles[profile].title));
    return options.length ? '<optgroup label="' + e(source.key) + '">' + options.join('') + '</optgroup>' : '';
  }).join('');
  const visible = data.runs.filter(r=>!isLab || r.profile==='visual');
  const history = visible.map(r=>`<li><a href="${base}/${e(r.id)}"><strong>${e(labProfiles[r.profile].title)} · ${e(r.source_key)}</strong>
    <span>${date(r.created_at)} · ${e(r.commit_sha.slice(0,12))} · ${e(triggers[r.trigger_kind])}</span></a>
    <span class="badge">${e(r.verdict ?? states[r.state])}</span></li>`).join('');
  const rules = data.rules.filter(r=>!isLab || r.profile==='visual').map(r=>`<li><strong>${e(r.source_key)} · ${e(labProfiles[r.profile].title)}</strong>
    <span>${r.enabled?(r.mode==='interval'?'Périodique':'Sur changement Git'):'Suspendue'} · ${r.interval_minutes} min · ${e(r.last_status??'En attente du premier contrôle')}</span></li>`).join('');
  const groups = new Map<string,LabState['runs']>();
  for (const run of visible.filter(r=>r.state==='finished')) {
    const key = JSON.stringify([run.source_key,run.entry_path,run.profile_version]);
    const group = groups.get(key) ?? [];
    group.push(run); groups.set(key,group);
  }
  const comparisons = [...groups.values()].filter(group=>group.length>1).map(group=>{
    const results = (selected:number) => group.map((r,index)=>
      option(r.id,r.commit_sha.slice(0,12)+' · '+date(r.created_at),index===selected)).join('');
    return '<form method="get" action="'+base+'/compare"><fieldset><legend>'+e(group[0].source_key)+' · '+e(labProfiles[group[0].profile].title)+'</legend>' +
      '<label>Premier passage<select name="before">'+results(1)+'</select></label><label>Second passage<select name="after">'+results(0)+
      '</select></label><button>Comparer</button></fieldset></form>';
  }).join('');
  const content = `<header class="heading"><div><h1>${heading}</h1><p>${isLab?'Prévisualiser un document HTML versionné dans Chromium isolé.':'Exécuter un profil, examiner son verdict et comparer deux révisions.'}</p></div></header>
    ${writable?`<section class="panel"><h2>${isLab?'Nouvelle preview':'Nouvelle qualification'}</h2>
    <form method="post" action="${base}"><input type="hidden" name="commandKey" value="${randomUUID()}">
    <label>Source et profil<select name="selection" required>${selections}</select></label>
    <label>Commit Git facultatif<input type="text" name="commit" maxlength="40" pattern="[a-f0-9]{40}" placeholder="Révision actuelle de la référence autorisée"></label>
    <button>${isLab?'Préparer la preview':'Lancer la qualification'}</button></form></section>`:''}
    <section class="panel"><h2>Passages du projet</h2>${history?'<ul class="mission-list">'+history+'</ul>':'<p>Aucun passage enregistré pour ce profil.</p>'}</section>
    ${comparisons?'<section class="panel"><h2>Comparer deux passages</h2>'+comparisons+'</section>':''}
    <section class="panel"><h2>Déclenchement automatique</h2>
    ${rules?'<ul class="history">'+rules+'</ul>':'<p>Aucune règle active pour ce projet.</p>'}
    ${writable?`<details><summary>Configurer une règle</summary><form method="post" action="${base}/rules">
    <label>Source et profil<select name="selection" required>${selections}</select></label>
    <label>Déclenchement<select name="mode">${option('on-change','Quand le commit local change')}${option('interval','À intervalles réguliers')}${option('off','Suspendre la règle')}</select></label>
    <label>Intervalle en minutes<input type="number" min="5" max="10080" name="minutes" value="30" required></label>
    <button>Enregistrer la règle</button></form></details>`:''}</section>`;
  return layout(heading,content,data.projects,project,true,isLab?'lab':'quality');
}
function showResult(base: string, project: ProjectId, row: LabRun, data: LabState) {
  const result = row.result;
  const items = result?.checks.map(c=>`<li><strong>${e(c.title)} · ${e(checkStates[c.status])}</strong><p>${e(c.observed)}</p></li>`).join('') ?? '';
  return layout('Qualification', `<a class="back" href="${base}">← Passages du projet</a>
    <header class="heading"><div><h1>${e(labProfiles[row.profile].title)}</h1><p>${e(row.source_key)} · ${e(row.entry_path)}</p></div>
    <span class="badge">${e(row.verdict??states[row.state])}</span></header>
    <section class="panel"><h2>Exécution</h2><p>Demandée par ${e(row.actor_id)} · ${date(row.created_at)} · ${e(triggers[row.trigger_kind])}</p>
    <p>Manifestes détectés · ${e(row.inventory.manifests.join(', ') || 'aucun des formats reconnus')}. Dépendances déclarées · ${row.inventory.dependencies ?? 'indéterminées'} (développement · ${row.inventory.devDependencies ?? 'indéterminées'}).</p>
    <p>Commit <code>${e(row.commit_sha)}</code> · profil ${e(row.profile_version)}</p>
    ${row.started_at?'<p>Début '+date(row.started_at)+' · runner '+e(row.worker)+'</p>':''}
    ${row.finished_at?'<p>Fin '+date(row.finished_at)+'</p>':'<p>Le service local traite les travaux de la file. <a href="'+base+'/'+e(row.id)+'">Actualiser</a></p>'}
    ${result?'<p>Rapport SHA-256 <code class="digest">'+e(row.result_sha)+'</code></p>':''}</section>
    ${row.screenshot_sha?`<section class="panel"><h2>Capture du document</h2><a href="${base}/${e(row.id)}/capture"><img class="lab-capture" width="480" height="300" alt="Aperçu du document HTML à la révision ${e(row.commit_sha.slice(0,12))}" src="${base}/${e(row.id)}/capture"></a>
    <p><a href="${base}/${e(row.id)}/capture">Ouvrir la capture 960 × 600</a> · ${e(result?.browser)}</p></section>`:''}
    ${items?'<section class="panel"><h2>Contrôles mesurés</h2><ul class="quality-results">'+items+'</ul></section>':''}`,
    data.projects,project,true,base.endsWith('/lab')?'lab':'quality');
}

export async function productLabRoute(pool:Pool, req:IncomingMessage, res:ServerResponse, url:URL, actor:Operator, api:boolean, io:HttpTools): Promise<boolean> {
  const path = api ? url.pathname.slice(4) : url.pathname;
  const matched = /^\/projects\/([^/]+)\/(lab|quality)(?:\/([^/]+)(?:\/(capture))?)?$/.exec(path);
  if (!matched) return false;
  const [,project,module,action,capture] = matched;
  if (!isProjectId(project)) throw notFound();
  assertProject(actor,project);
  const page = module==='lab'?'lab':'quality';
  const base = '/projects/'+project+'/'+page;
  if (req.method==='GET' && !action) {
    const data = await listLab(pool,actor,project);
    if (api) io.json(res,200,data); else io.html(res,200,showOverview(project,page,data,actor.accountRole !== 'viewer'));
  } else if (req.method==='GET' && action==='compare' && !capture) {
    const diff=await compareLab(pool,actor,project,url.searchParams.get('before')??'',url.searchParams.get('after')??'');
    if (api) io.json(res,200,diff);
    else {
      const data=await listLab(pool,actor,project);
      const rows=diff.rows.map(c=>`<tr><th scope="row">${e(c.title)}</th><td>${e(compareStates[c.before])}</td><td>${e(compareStates[c.after])}</td><td>${e(c.observed)}</td></tr>`).join('');
      io.html(res,200,layout('Comparaison',`<a class="back" href="${base}">← Passages du projet</a><header class="heading"><h1>Comparaison des passages</h1></header>
      <section class="panel"><p>${e(diff.before.commit_sha.slice(0,12))} → ${e(diff.after.commit_sha.slice(0,12))} · ${e(diff.after.profile_version)}</p>
      <div class="table-wrap"><table><thead><tr><th>Contrôle</th><th>Avant</th><th>Après</th><th>Observation récente</th></tr></thead><tbody>${rows}</tbody></table></div></section>`,
      data.projects,project,true,page==='lab'?'lab':'quality'));
    }
  } else if (req.method==='GET' && action && capture) {
    const png = await evidencePng(pool,actor,project,action);
    res.setHeader('Content-Type','image/png'); res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','private, no-store'); res.writeHead(200); res.end(png);
  } else if (req.method==='GET' && action) {
    const row = await detailLab(pool,actor,project,action);
    if (api) io.json(res,200,row);
    else io.html(res,200,showResult(base,project,row,await listLab(pool,actor,project)));
  } else if (req.method==='POST' && !action) {
    const input=await io.body(req,api?'json':'form');
    const [source,profile] = readSelection(input,api,['commandKey',...(Object.hasOwn(input,'commit')?['commit']:[])]);
    const row=await queueLab(pool,actor,project,source,profile,textValue(input.commandKey),textValue(input.commit??''));
    if (api) io.json(res,202,{id:row.id,state:row.state}); else io.redirect(res,base+'/'+row.id);
  } else if (req.method==='POST' && action==='rules' && !capture) {
    const input=await io.body(req,api?'json':'form');
    const [source,profile] = readSelection(input,api,['mode','minutes']);
    await setLabRule(pool,actor,project,source,profile,textValue(input.mode),Number(input.minutes));
    if (api) io.json(res,200,{recorded:true}); else io.redirect(res,base);
  } else throw notFound();
  return true;
}
