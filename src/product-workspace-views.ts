import type { Operator, ProjectId } from './contracts.ts';
import type { Desk, MissionDigest, Workspace } from './product-workspace.ts';
import { agentPresence } from './product-workspace.ts';
import type { ProjectProfile, profileDetail } from './product-workspace-projects.ts';
import { date, e, eventLabels, layout, orderedProjects } from './views.ts';
import { deskName,officeScene } from './office-scene.ts';
import { cursorDirectory } from './cursor-views.ts';

const labels: Record<string,string> = {
  ...eventLabels, draft:'Brouillon',needs_approval:'À approuver',ready:'Prête',running:'En cours',paused:'Suspendue',
  blocked:'Bloquée',completed:'Terminée',failed:'Échec',cancelled:'Annulée',waiting:'En attente',approved:'Approuvée',
  unseen:'Sans contact',offline:'Hors ligne',available:'Disponible',working:'En exécution',verifying:'En vérification',
  git_observed:'Relevé Git',project_edited:'Profil mis à jour',knowledge_proposed:'Connaissance proposée',knowledge_validated:'Connaissance validée',
  knowledge_rejected:'Connaissance rejetée',knowledge_revoked:'Connaissance révoquée',knowledge_obsolete:'Connaissance remplacée',
  lab_queued:'Qualification en file',lab_running:'Qualification en cours',lab_finished:'Qualification terminée',
  structure:'Analyse de structure',visual:'Rendu isolé',coverage:'Couverture des critères',synthesis:'Synthèse des résultats',
  preparer:'Préparation',verifier:'Vérification',active:'En cours',expired:'Bail expiré',interrupted:'Interrompue',
  succeeded:'Réussie',queued:'En file',finished:'Terminée',needs_review:'En revue',mission_approved:'Mission approuvée',
  mission_blocked:'Mission bloquée',task_claimed:'Tâche attribuée',task_completed:'Tâche terminée',
  task_failed:'Tâche en échec',mission_completed:'Mission terminée',mission_planned:'Mission planifiée',
};
function label(key: string) { return e(labels[key] ?? key.replaceAll('_',' ')); }
function badge(key: string) { return `<span class="status-pill status-${e(key)}">${label(key)}</span>`; }
function href(m: Pick<MissionDigest,'engine'|'project_id'|'id'>) {
  return '/projects/' + encodeURIComponent(m.project_id) + (m.engine === 'control' ? '/control/' : '/missions/') + encodeURIComponent(m.id);
}
function projectName(data: Workspace, id: string) { return data.projects.find(p => p.id === id)?.name ?? id; }
function scoped(data: Workspace, filter?: ProjectId) { return data.projects.filter(p => !filter || p.id === filter); }
function projectFilter(path: string, data: Workspace, filter?: ProjectId, query?:URLSearchParams) {
  if (!data.projects.length) return '';
  return `<form class="scope-filter" action="${path}" method="get"><label for="scope-project">Projet</label>
    ${(path==='/office'?['salle','follow','liste']:['git']).map(key=>query?.has(key)?`<input type="hidden" name="${key}" value="${e(query.get(key)??'')}">`:'').join('')}
    <select id="scope-project" name="project"><option value="">Tous les projets autorisés</option>
    ${orderedProjects(data.projects).map(p => `<option value="${e(p.id)}" ${filter === p.id ? 'selected' : ''}>${e(p.name)}</option>`).join('')}</select>
    <button>Afficher</button></form>`;
}
function missionCount(data: Workspace, ...keys: string[]) {
  return data.counts.reduce((sum,row) => sum + (keys.includes(row.state) ? row.total : 0),0);
}

function weekChart(days: {day:string;total:number}[]) {
  const max=Math.max(1,...days.map(d=>d.total));
  const formatter=new Intl.DateTimeFormat('fr-FR',{weekday:'short',timeZone:'UTC'});
  const bars=days.map((d,i)=>{
    const x=25+i*45, height=Math.round(54*d.total/max);
    const day=formatter.format(new Date(d.day+'T12:00:00Z')).replace('.','');
    return `<g><title>${e(d.day)} · ${d.total}</title><rect class="chart-bar" x="${x-8}" y="${75-height}" width="16" height="${height}" rx="3"/>
      <text x="${x}" y="${68-height}">${d.total}</text><text x="${x}" y="92">${e(day)}</text></g>`;
  }).join('');
  return `<section class="panel week-card"><h2>Activité sur 7 jours</h2>
    <figure><svg role="img" aria-label="${e(days.map(d=>d.day+' : '+d.total).join(', '))}" viewBox="0 0 320 98">
    <path class="chart-grid" d="M8 75H312 M8 48H312 M8 21H312"/>${bars}</svg>
    <figcaption>Événements de mission et relevés Git · heure de Paris</figcaption></figure></section>`;
}

function changed(repo:Workspace['repositories'][number]) {
  return !!repo.worktree && (repo.worktree.unstaged>0 || repo.worktree.staged>0 || repo.worktree.untracked>0);
}

export function workspacePage(data: Workspace, actor: Operator, filter: ProjectId|undefined, week: {day:string;total:number}[], query:URLSearchParams,hasArchives=false) {
  const localRepos=data.repositories.filter(r=>r.local_only);
  const connected=new Set(localRepos.map(r=>r.project_id));
  const projects = orderedProjects(scoped(data,filter));
  const changedRepos=localRepos.filter(changed);
  const topRepos=changedRepos.slice().sort((a,b)=>b.worktree!.unstaged-a.worktree!.unstaged || a.project_id.localeCompare(b.project_id)).slice(0,4);
  const changedOnly=query.get('git')==='changed';
  const interest=new Map(data.follows.map(item=>[item.project_id,item]));
  const focusOptions=[['active','En activité'],['priority','Prioritaires'],['standby','En veille'],['all','Tous']] as const;
  const focus=focusOptions.find(([key])=>key===query.get('focus'))?.[0]??(filter?'all':'active');
  const matches=(id:string,key:string)=>{
    const attention=interest.get(id)?.attention??'normal';
    return key==='all'||(key==='active'?attention!=='standby':attention===key);
  };
  const listQuery=new URLSearchParams(filter?{project:filter}:{});
  listQuery.set('focus',focus);
  const focusLinks=focusOptions.map(([key,label])=>{
    const params=new URLSearchParams(listQuery);params.set('focus',key);
    if(changedOnly)params.set('git','changed');
    return `<a href="/workspace?${e(params.toString())}#portefeuille"${focus===key?' aria-current="true"':''}>${label} <b>${projects.filter(p=>matches(p.id,key)).length}</b></a>`;
  }).join('');
  const priorities=projects.filter(p=>matches(p.id,'priority'));
  const priorityCards=priorities.map(p=>{
    const note=interest.get(p.id)?.note;
    const mission=data.missions.find(m=>m.project_id===p.id && ['ready','running','needs_approval','blocked'].includes(m.status));
    const repo=localRepos.find(r=>r.project_id===p.id);
    return `<article><h3><a href="/projects/${e(p.id)}#reprise">${e(p.name)}</a></h3>${note?'<p>'+e(note)+'</p>':''}
      ${mission?`<a href="${e(href(mission))}">${e(mission.objective)}</a>`:repo?.observed_at?`<small>${e(repo.branch??'HEAD détachée')} · ${changed(repo)?'Changements locaux':'Arbre propre'}</small>`:'<small>Aucun relevé Git</small>'}</article>`;
  }).join('');
  const failedNames=projects.filter(p=>query.getAll('failedProject').includes(p.id)).map(p=>e(p.name)).join(', ');
  if(!changedOnly) listQuery.set('git','changed');
  const updated=query.get('updated'), unavailable=query.get('unavailable');
  const refreshNote=updated!==null && unavailable!==null && /^\d{1,5}$/.test(updated) && /^\d{1,5}$/.test(unavailable)
    ? `<p role="status">${updated} relevé(s) actualisé(s)${unavailable!=='0'?' · '+unavailable+' indisponible(s)'+(failedNames?' · '+failedNames:''):''}.</p>`:'';
  const queuedTasks = data.tasks.filter(row => row.state === 'waiting' || row.state === 'ready').reduce((n,row) => n + row.total,0);
  const activeTasks = data.tasks.filter(row => row.state === 'running').reduce((n,row) => n + row.total,0);
  const presence=agentPresence(data.agents);
  const approvals = missionCount(data,'needs_approval');
  const activeProjects = new Set(data.counts.filter(row => ['ready','running','needs_approval','blocked'].includes(row.state)).map(row => row.project_id));
  const lastFailures = data.agents.filter(a => !a.running && a.records[0]?.state==='failed');
  const alerts = data.alerts
    .map(m => `<li><span>${label(m.status)}</span><a href="${e(href(m))}">${e(m.objective)}</a></li>`);
  for (const p of data.proposals) alerts.push(`<li><span>À valider</span><a href="/projects/${e(p.project_id)}/knowledge?status=proposed">${p.total} fiche(s) · ${e(projectName(data,p.project_id))}</a></li>`);
  for (const d of data.agents.filter(a=>a.configured && (a.state==='offline'||a.records[0]?.state==='failed')).slice(0,6)) {
    alerts.push(`<li><span>${d.state==='offline'?'Hors ligne':'Dernière tentative en échec'}</span><a href="${e(stationUrl(d,true,filter))}">${e(deskName(d))} · ${e(projectName(data,d.projectId))}</a></li>`);
  }
  if(data.backup?.outcome==='failed') alerts.push('<li><span>Sauvegarde en échec</span><a href="/activity?type=backup">Examiner le journal de maintenance</a></li>');
  for (const lab of data.labs.filter(l => l.verdict === 'FAIL' || l.verdict === 'NOT QUALIFIED')) {
    alerts.push(`<li><span>${e(lab.verdict)}</span><a href="/projects/${e(lab.project_id)}/quality/${e(lab.id)}">${label(lab.profile)} · ${e(projectName(data,lab.project_id))}</a></li>`);
  }
  const now = data.capturedAt;
  const shown=projects.filter(p=>matches(p.id,focus) && (!changedOnly || changedRepos.some(r=>r.project_id===p.id)));
  const projectRows = shown.map(p => {
    const lab = data.labs.find(item => item.project_id === p.id);
    const repo = data.repositories.find(item => item.project_id === p.id);
    const active = data.counts.filter(row => row.project_id === p.id && ['ready','running','needs_approval','blocked'].includes(row.state)).reduce((n,row) => n+row.total,0);
    const last=data.lastActivity.find(item=>item.project_id===p.id);
    const blocked=data.counts.filter(r=>r.project_id===p.id && ['blocked','failed','needs_approval'].includes(r.state)).reduce((n,r)=>n+r.total,0);
    const failedCheck=lab?.verdict==='FAIL'||lab?.verdict==='NOT QUALIFIED';
    const health=blocked ? blocked+' mission(s) à examiner' : failedCheck ? 'Dernier contrôle à examiner' : lab?.verdict==='PASS' ? 'Dernier contrôle réussi' : 'Santé non qualifiée';
    return `<tr><th scope="row"><a href="/projects/${e(p.id)}">${e(p.name)}</a>${p.description?`<small>${e(p.description.slice(0,142))}</small>`:''}</th>
      <td class="repo-summary">${repo?`<a href="/projects/${e(p.id)}/repository">${e(repo.branch ?? (repo.local_commit?'HEAD détachée':'Consulter le dépôt'))}</a>
        ${repo.local_commit?`<small><code>${e(repo.local_commit.slice(0,8))}</code> · ${changed(repo)?'Changements locaux':'Arbre propre'}</small>
        <small>Relevé ${date(repo.observed_at)}</small>`:''}`:'—'}</td>
      <td>${active}<small>${e(health)}</small></td><td>${lab ? `<a href="/projects/${e(p.id)}/quality/${e(lab.id)}">${lab.verdict ? e(lab.verdict) : label(lab.state)}</a>` : 'Aucun passage'}</td>
      <td><a href="/activity?project=${e(p.id)}">Journal</a>${last?`<small>${date(last.at)}</small>`:''} · <a href="/projects/${e(p.id)}/settings">Profil</a></td></tr>`;
  }).join('');
  const maximum=Math.max(1,...topRepos.map(r=>r.worktree!.unstaged));
  return layout('Command Center',`<header class="product-heading cockpit-heading"><div><h1>Command Center</h1><p>${filter?e(projectName(data,filter)):'Vue du portefeuille'} · ${date(now)}</p></div>
    ${projectFilter('/workspace',data,filter,query)}</header>
    <div class="summary-strip">
      <div><span>Dossiers reliés en local</span><strong>${connected.size}</strong><a href="#portefeuille">${projects.length} ${projects.length>1?'projets suivis':'projet suivi'}</a></div>
      <div><span>Missions en cours</span><strong>${missionCount(data,'running')}</strong><a href="#missions">Voir les missions</a></div>
      <div><span>À approuver</span><strong>${approvals}</strong><a href="#attention">Voir les décisions</a></div>
      <div><span>Agents connectés</span><strong>${presence.connected}</strong><a href="/office${filter?'?project='+e(filter):''}">${presence.available} disponibles · ${presence.busy} occupés →</a></div>
    </div>
    ${priorityCards?`<section class="panel priority-section"><h2>Mes projets prioritaires</h2><div class="priority-projects">${priorityCards}</div></section>`:''}
    <section id="portefeuille" class="panel"><header class="section-head"><h2>Portefeuille de projets</h2>
      ${'accountRole' in actor && actor.accountRole === 'admin' ? '<a class="button" href="/projects/new">Créer un projet</a>' : ''}</header>
      <nav class="follow-filters" aria-label="Suivi des projets">${focusLinks}</nav><div class="actions portfolio-actions"><a href="/workspace?${e(listQuery.toString())}#portefeuille">${changedOnly?'Afficher tous les projets':'Afficher les dépôts modifiés'}</a>
      ${hasArchives?'<a href="/workspace/archives">Démonstrations archivées</a>':''}
      ${actor.accountRole!=='viewer' && data.repositories.some(r=>r.local_only)?`<form method="post" action="/workspace/observe">${filter?`<input type="hidden" name="project" value="${e(filter)}">`:''}<button>Actualiser les relevés Git</button></form>`:''}</div>${refreshNote}
      ${shown.length ? `<div class="table-wrap"><table><thead><tr><th>Projet</th><th>État Git local</th><th>Missions ouvertes¹</th><th>Dernier contrôle</th><th>Ouvrir</th></tr></thead><tbody>${projectRows}</tbody></table></div><p class="field-help">¹ Prêtes, en cours, bloquées ou à approuver.</p>` : `<p>${changedOnly?'Aucun dépôt modifié dans ce périmètre.':'Aucun projet dans cette sélection.'}</p>`}</section>
    <div class="workspace-grid insight-grid"><section class="panel git-card"><header class="section-head"><h2>Changements locaux</h2><span>${changedRepos.length} / ${connected.size} dépôts</span></header>
      ${topRepos.length?`<ul class="git-bars">${topRepos.map(r=>`<li><a href="/projects/${e(r.project_id)}/repository">${e(projectName(data,r.project_id))}</a><progress aria-label="Fichiers modifiés hors index" value="${r.worktree!.unstaged}" max="${maximum}"></progress><strong>${r.worktree!.unstaged}</strong></li>`).join('')}</ul>
        <p class="field-help">Fichiers suivis modifiés hors index${changedRepos.length>topRepos.length?' · quatre premiers dépôts':''}</p>`:`<p>${localRepos.some(r=>r.observed_at)?'Les relevés ne signalent aucun changement local.':connected.size?'Premier relevé à effectuer.':'Aucun dossier relié en lecture locale dans ce périmètre.'}</p>`}
      </section>${weekChart(week)}</div>
    <div class="workspace-grid">
    <section id="attention" class="panel attention"><h2>À examiner</h2>
      ${alerts.length ? `<ul class="alert-feed">${alerts.join('')}</ul>` : '<p>Aucune validation ni alerte dans ce périmètre.</p>'}
      ${!alerts.length && topRepos.length?`<a href="/projects/${e(topRepos[0].project_id)}/repository">Consulter les changements de ${e(projectName(data,topRepos[0].project_id))} →</a>`:''}</section>
    <section class="panel operational"><div class="office-preview"><div><h2>Agent Office</h2><p>${presence.registered} postes connus · ${presence.connected} connectés · ${presence.busy} occupés</p>
      <a href="/office${filter?'?project='+e(filter):''}">Voir les postes →</a>
      ${data.cursorSessions.length?`<a class="cursor-shortcut" href="/office${filter?'?project='+e(filter):''}#cursor">Retrouver les sessions Cursor · ${new Set(data.cursorSessions.map(r=>r.agent_id)).size}</a>`:''}</div></div><details><summary>Exécution locale</summary>
      <dl class="facts"><dt>Core · PostgreSQL</dt><dd>Disponibles</dd>
      <dt>Projets avec missions ouvertes</dt><dd>${activeProjects.size}</dd>
      <dt>Tâches attribuées / en attente</dt><dd>${activeTasks} / ${queuedTasks}</dd>
      <dt>Missions terminées / bloquées</dt><dd>${missionCount(data,'completed')} / ${missionCount(data,'blocked')}</dd>
      <dt>Agents disponibles</dt><dd>${presence.available}</dd>
      <dt>Hors ligne / jamais vus</dt><dd>${presence.offline} / ${presence.unseen}</dd>
      <dt>Dernière tentative en échec</dt><dd>${lastFailures.length} poste${lastFailures.length>1?'s':''}</dd>
      ${data.backup === undefined ? '' : `<dt>Dernier contrôle de sauvegarde</dt><dd>${data.backup ? (data.backup.outcome === 'verified' ? 'Vérifié' : 'Échec')+' · '+date(data.backup.performed_at) : 'Aucun contrôle enregistré'}</dd>`}</dl>
      <div class="actions"><a href="/office${filter ? '?project='+e(filter) : ''}">Ouvrir Agent Office</a>
      <a href="/agents">Catalogue des adaptateurs</a>${actor.accountRole === 'admin' ? '<a href="/people">Comptes locaux</a>' : ''}</div></details></section></div>
    <div class="workspace-grid"><section class="panel" id="missions"><h2>Missions</h2>
      ${data.missions.length ? `<ul class="work-feed">${data.missions.map(m => `<li><div><a href="${e(href(m))}">${e(m.objective)}</a><small>${e(projectName(data,m.project_id))} · ${date(m.at)}</small></div>${badge(m.status)}</li>`).join('')}</ul>` : '<p>Aucune mission enregistrée.</p>'}</section>
    <section class="panel"><header class="section-head"><h2>Journal d’activité</h2><a href="/activity${filter?'?project='+e(filter):''}">Filtrer le journal →</a></header>
      ${data.events.length ? `<ol class="event-feed">${data.events.map(ev => `<li><a href="${e(ev.href)}">${label(ev.kind)} · ${e(ev.subject)}</a><small>${e(ev.project_id?projectName(data,ev.project_id):'Studio')} · ${e(ev.source)} · ${date(ev.at)}${ev.actor ? ' · '+e(ev.actor) : ''}</small></li>`).join('')}</ol>` : '<p>Aucun événement enregistré.</p>'}</section></div>`,
    data.projects,filter,true,'workspace');
}

export function stationUrl(desk: Desk, following:boolean, filter?: ProjectId) {
  const params = new URLSearchParams({station:desk.id,stationProject:desk.projectId,role:desk.role});
  if (filter) params.set('project',filter);
  if (!following) params.set('follow','0');
  return '/office?'+params.toString()+'#poste';
}
function station(desk: Desk, data: Workspace, following:boolean, filter?: ProjectId) {
  const occupied = desk.state === 'working' || desk.state === 'verifying';
  const task = desk.records.find(r=>r.live);
  return `<a class="office-station ${occupied ? 'occupied' : ''}" data-state="${e(desk.state)}" href="${e(stationUrl(desk,following,filter))}">
    <span class="room-scene" aria-hidden="true"><i class="agent-position"><i class="agent-sprite"></i></i></span>
    <span class="station-text"><strong>${e(deskName(desk))}</strong><small>${label(desk.role)} · ${e(projectName(data,desk.projectId))}</small>${badge(desk.state)}
    ${task?'<span class="station-task">'+label(task.task)+'</span>':''}</span></a>`;
}
export function officePage(data: Workspace, query: URLSearchParams, filter?: ProjectId) {
  const presence=agentPresence(data.agents);
  const selected = data.agents.find(a => query.get('station') === a.id && query.get('stationProject') === a.projectId && query.get('role') === a.role);
  const following = query.get('follow') !== '0';
  const url = new URLSearchParams(query);
  if (following) url.set('follow','0'); else url.delete('follow');
  const stations = (role: 'preparer'|'verifier') => {
    const members = data.agents.filter(d => d.role === role);
    return `<section class="office-zone" data-room="${role}"><h2>${role === 'preparer' ? 'Atelier de préparation' : 'Salle de vérification'}</h2>
      ${members.length ? `<div class="station-group">${members.map(d => station(d,data,following,filter)).join('')}</div>` : '<div class="room-scene" aria-hidden="true"></div><p class="vacant">Aucun poste enregistré.</p>'}</section>`;
  };
  const reviews=data.alerts.filter(m=>m.status==='needs_approval'||m.status==='blocked').slice(0,4);
  return layout('Agent Office',`<header class="product-heading"><div><h1>Agent Office</h1><p id="office-reading">${presence.connected} connectés · ${presence.available} disponibles · ${presence.busy} occupés · relevé ${date(data.capturedAt)}</p></div>
    ${projectFilter('/office',data,filter,query)}</header>
    <div class="office-controls"><a class="button" href="/office?${e(url.toString())}">${following ? 'Mettre en pause' : 'Reprendre le direct'}</a>
    <span id="office-live" role="status">${following ? 'Dernier relevé' : 'Suivi en pause'}</span>
    <a href="/office?${e(query.toString())}">Actualiser</a>
    ${data.cursorSessions.length?'<a class="jump-cursor" href="#cursor">Sessions Cursor ↓</a>':''}</div>
    ${officeScene(data,d=>stationUrl(d,following,filter),query)}
    ${cursorDirectory(data.cursorSessions,data.projects)}
    <details id="postes-locaux" class="desk-directory" ${selected || query.get('liste')==='1' || data.agents.length<=4?'open':''}><summary>Postes locaux et affectations · ${data.agents.length}</summary>
    <div class="office-plan" data-follow="${following?'on':'off'}" aria-label="Plan de travail des agents">${stations('preparer')}${stations('verifier')}
    <section class="office-supervision"><h2>Espace de validation</h2>${reviews.length ? '<ul class="work-feed">'+reviews.map(m=>'<li><a href="'+e(href(m))+'">'+e(m.objective)+'</a>'+badge(m.status)+'</li>').join('')+'</ul>' : '<p>Aucune mission bloquée ou en attente d’approbation.</p>'}</section></div>
    </details><section id="poste" class="panel station-info"><h2>${selected ? 'Poste · '+e(selected.id) : 'Affectations et preuves'}</h2>
      ${selected ? `<dl class="facts"><dt>Projet</dt><dd>${e(projectName(data,selected.projectId))}</dd>
        <dt>Fonction</dt><dd>${e(deskName(selected))} · ${label(selected.role)}</dd><dt>Dernier contact</dt><dd>${date(selected.lastSeen)}</dd>
        <dt>Fournisseur et modèle</dt><dd>${selected.engine==='control'?'Studio · adaptateur documentaire déterministe, sans modèle IA':'Runner de confiance · fournisseur et modèle non déclarés'}</dd>
        <dt>Périmètre autorisé</dt><dd>${e(projectName(data,selected.projectId))} · ${label(selected.role)}</dd>
        <dt>Tâches avec résultat observé</dt><dd>${e([...new Set(selected.records.filter(r=>r.state==='completed'||r.state==='succeeded').map(r=>r.task))].join(', ')||'Aucun résultat dans les dernières attributions')}</dd>
        <dt>État observé</dt><dd>${badge(selected.state)}</dd></dl>
        <p><a href="/projects/${e(selected.projectId)}">Ouvrir le projet et son équipe</a></p>
        ${selected.records.length ? `<ul class="work-feed">${selected.records.map(record => `<li><div><a href="${e(href({engine:record.engine,project_id:record.project_id,id:record.mission_id}))}">${e(record.objective)}</a>
        <small>${label(record.task)} · ${date(record.began)}</small></div>${badge(record.state)}</li>`).join('')}</ul>` : '<p>Aucune tentative attribuée à ce poste.</p>'}`
        : '<p>Sélectionnez un poste pour consulter son dernier contact, ses missions et ses résultats.</p>'}</section>
    <script src="/office-assets/live.js" defer></script>`,data.projects,filter,true,'office');
}

type ProfileData = Awaited<ReturnType<typeof profileDetail>>;
function fields(p?: ProjectProfile) {
  return `<label>Nom du projet<input name="name" maxlength="120" value="${e(p?.name)}" required></label>
    <label>Description<textarea name="description" maxlength="1800" rows="2">${e(p?.description)}</textarea></label>
    <label>Dépôt GitHub déclaré<input type="url" name="repository" maxlength="240" value="${e(p?.repository)}"></label>
    <p class="field-help">Cette référence documente le projet. Les droits Git sont configurés séparément sur le poste.</p>
    <label>Branche principale<input name="mainBranch" maxlength="128" value="${e(p?.mainBranch)}"></label>
    <label>Branches de travail · une par ligne<textarea name="workBranches" rows="2">${e(p?.workBranches.join('\n'))}</textarea></label>
    <label>Règles et critères d’acceptation<textarea name="acceptance" maxlength="1600" rows="3">${e(p?.acceptance)}</textarea></label>`;
}
export function profilePage(projects: ProjectProfile[], data?: ProfileData, canEdit = true) {
  const p = data?.profile;
  const heading = p ? 'Profil du projet' : 'Créer un projet';
  const path = p ? '/projects/'+encodeURIComponent(p.id)+'/settings' : '/projects/new';
  return layout(heading,`<a class="back" href="/workspace">← Command Center</a>
    <div class="heading"><div><h1>${heading}</h1>${p ? `<p>${e(p.name)} · Révision ${p.revision}</p>` : ''}</div></div>
    <div class="workspace-grid"><section class="panel"><h2>${p ? 'Paramètres' : 'Identité et branches'}</h2>
      ${canEdit ? `<form class="stack" method="post" action="${e(path)}">
        ${p ? `<input type="hidden" name="revision" value="${p.revision}">` : '<label>Identifiant du projet<input name="id" maxlength="40" pattern="[a-z][a-z0-9-]{0,39}" required></label>'}
        ${fields(p)}<button class="primary">${p ? 'Enregistrer' : 'Créer le projet'}</button></form>`
        : `<dl class="facts">${Object.entries({'Description':p?.description,'Dépôt déclaré':p?.repository,'Branche principale':p?.mainBranch,'Branches de travail':p?.workBranches.join(', '),'Règles':p?.acceptance}).map(([key,value])=>`<dt>${e(key)}</dt><dd>${e(value || '—')}</dd>`).join('')}</dl>`}</section>
    ${data ? `<section class="panel"><h2>Révisions du profil</h2>${data.revisions.length ? `<ol class="event-feed">${data.revisions.map(row => `<li><details><summary>Révision ${row.revision} · ${e(row.actor)}</summary>
      <p>${date(row.at)}</p><pre>${e(JSON.stringify(row.profile,null,2))}</pre></details></li>`).join('')}</ol>` : '<p>Profil initial. Aucune révision enregistrée.</p>'}</section>` : ''}</div>`,projects,p?.id,true);
}
