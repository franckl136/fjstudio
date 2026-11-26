import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Core } from './core.ts';
import { DomainError, isProjectId, type JsonObject, type Operator } from './contracts.ts';
import type { Repositories } from './repositories.ts';
import { date, e, layout } from './views.ts';

type State = Awaited<ReturnType<Repositories['state']>>;
type Projects = Awaited<ReturnType<Core['listProjects']>>;

function repositoryPage(projects: Projects, project: string, state: State) {
  const path='/projects/'+project+'/repository';
  const target=state.target;
  const rows=state.observations.map(o=>{
    const remote=o.remote_state;
    let comparison='Observation locale';
    if (remote?.state==='unavailable') comparison='Fetch indisponible · état distant inconnu';
    if (remote?.state==='observed') {
      const c=remote.comparison;
      comparison=c ? `${c.branch} · ${c.ahead} commit(s) d’avance, ${c.behind} de retard, ${c.changedFiles} fichier(s) différents`
        : remote.requestedBranch ? 'Branche demandée absente des références observées' : 'HEAD détachée · choisir une branche de comparaison';
    }
    const branches=remote?.state==='observed' ? `<details><summary>Branches distantes observées</summary><p>Fetch terminé ${date(remote.fetchedAt)}</p>
      <ul>${remote.branches.map(b=>`<li>${e(b.name)} · <code>${e(b.commit)}</code></li>`).join('')}</ul></details>` : '';
    return `<li><div><strong>${e(o.branch??'HEAD détachée')}</strong> · ${date(o.observed_at)}
      <p class="digest"><code>${e(o.local_commit)}</code></p>
      <p>${o.worktree.staged} indexé(s) · ${o.worktree.unstaged} modifié(s) · ${o.worktree.untracked} entrée(s) non suivie(s)</p>
      <p>${e(comparison)}</p>${branches}<p>Enregistré par ${e(o.observed_by)} · ${date(o.recorded_at)}</p></div></li>`;
  }).join('');
  const directory=state.available.find(p=>p.key===target?.repository_key)?.directory;
  const registry=target ? `<p>${e(target.remote_url || 'Lecture locale uniquement')}${directory?' · <code>'+e(directory)+'</code>':''}</p>
    <div class="actions"><form method="post" action="${path}/observe"><button>Observer le checkout</button></form>
    ${target.remote_url?`<form method="post" action="${path}/fetch"><label>Branche distante à comparer (facultatif)
    <input name="reference" maxlength="200" placeholder="Branche locale par défaut"></label>
    <button>Récupérer les branches GitHub</button></form>`:''}</div>` :
    state.available.length ? `<form action="${path}/register" method="post"><label>Dépôt autorisé
    <select name="key">${state.available.map(p=>`<option value="${e(p.key)}">${e(p.remote || p.directory)}</option>`).join('')}</select>
    </label><button>Enregistrer le dépôt</button></form>` : '<p>Aucun dépôt autorisé pour ce projet.</p>';
  return layout('Dépôt Git',`<a class="back" href="/projects/${project}">← Projet ${e(project.toUpperCase())}</a>
    <div class="heading"><div><h1>Dépôt Git</h1><p>Version de code associée aux missions</p></div></div>
    <section class="panel"><h2>Source du projet</h2>${registry}</section>
    <section class="panel"><h2>Observations enregistrées</h2>
    <p>Chaque nouvelle mission référence la dernière observation locale enregistrée. Les fichiers de travail modifiés ne sont pas inclus dans le commit.</p>
    ${rows?`<ul class="mission-list">${rows}</ul>`:'<p>Aucune observation enregistrée.</p>'}</section>`,projects,project,true);
}

export async function repositoryRoute(
  core: Pick<Core,'listProjects'> & {repositories:Repositories}, req: IncomingMessage, res: ServerResponse,
  url: URL, actor: Operator, api: boolean,
  body: (req: IncomingMessage, kind:'json'|'form')=>Promise<JsonObject>,
): Promise<boolean> {
  const route=/^\/projects\/([^/]+)\/repository(?:\/(register|observe|fetch))?$/.exec(api?url.pathname.slice(4):url.pathname);
  if (!route) return false;
  const [,project,action]=route;
  if (!isProjectId(project)) throw new DomainError(404,'not_found','Projet introuvable.');
  const invalid=()=>new DomainError(400,'repository_input','Paramètres de dépôt inattendus.');
  if (req.method==='GET' && !action) {
    const state=await core.repositories.state(actor,project);
    res.setHeader('Content-Type',api?'application/json; charset=utf-8':'text/html; charset=utf-8');
    res.end(api?JSON.stringify(state):repositoryPage(await core.listProjects(actor),project,state));
    return true;
  }
  if (req.method!=='POST' || !action) throw new DomainError(405,'method','Méthode indisponible.');
  const input=await body(req,api?'json':'form');
  let value;
  if (action==='register') {
    if (Object.keys(input).length!==1 || typeof input.key!=='string') throw invalid();
    value=await core.repositories.register(actor,project,input.key);
  } else {
    if (Object.keys(input).some(k=>action!=='fetch' || k!=='reference') ||
        (input.reference!==undefined && typeof input.reference!=='string')) throw invalid();
    value=await core.repositories.observe(actor,project,action==='fetch'?'fetch':'local',input.reference||undefined);
  }
  if (api) {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify(value));
  } else {
    res.writeHead(303,{Location:'/projects/'+project+'/repository'});
    res.end();
  }
  return true;
}
