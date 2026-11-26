import { projectDestination } from './project-navigation.ts';
import {followLabels,type Follow} from './project-follow.ts';
import type {Stack} from './project-stack.ts';
import { randomUUID } from 'node:crypto';
import type { CursorPull } from './cursor-sessions.ts';
import { academyGuide } from './academy-catalog.ts';
import type { Core } from './core.ts';
import { origins } from './knowledge.ts';
import { missionQuality, checkLabels } from './quality.ts';

type Projects = Awaited<ReturnType<Core['listProjects']>>;
type Project = Awaited<ReturnType<Core['getProject']>>;
type Mission = Awaited<ReturnType<Core['getMission']>>;

const labels: Record<string, string> = {
  paused: 'Suspendue',
  ready: 'Prête',
  waiting: 'En attente',
  running: 'En cours',
  active: 'Attribuée',
  completed: 'Terminée',
  succeeded: 'Réussie',
  failed: 'Échec',
  cancelled: 'Annulée',
  expired: 'Bail expiré',
  nominal: 'Cas nominal',
  incorrect: 'Cas incorrect',
  preparer: 'Préparateur',
  verifier: 'Vérificateur',
};
export const eventLabels: Record<string, string> = {
  mission_paused: 'Mission suspendue', mission_resumed: 'Mission reprise',
  mission_created: 'Mission créée',
  attempt_claimed: 'Tentative attribuée',
  attempt_expired: 'Bail expiré',
  checkpoint_saved: 'Checkpoint enregistré',
  step_ready: 'Étape prête',
  mission_succeeded: 'Mission réussie',
  mission_failed: 'Mission en échec',
  attempt_cancelled: 'Tentative annulée',
  mission_cancelled: 'Mission annulée',
};

const reasons: Record<string, string> = {
  quality_rejected: 'Le vérificateur a rejeté le livrable. Consultez les contrôles ci-dessous.',
  operator_cancelled: 'L’opérateur a annulé la mission.',
  deadline_exceeded: 'L’échéance de la mission est dépassée.',
  attempt_limit_reached: 'La limite de tentatives est atteinte.',
};

export function e(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

const studioTime = new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'short',year:'numeric',
  hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'});
export function date(value: unknown): string {
  if (!value) return '—';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return e(value);
  return `<time datetime="${parsed.toISOString()}">${e(studioTime.format(parsed))}</time>`;
}

function label(value: string): string {
  return e(labels[value] ?? value);
}

export function state(value: string): string {
  return `<span class="badge state-${e(value)}">${label(value)}</span>`;
}

function pretty(value: unknown): string {
  return `<pre>${e(JSON.stringify(value, null, 2))}</pre>`;
}

const frenchProjectNames=new Intl.Collator('fr',{sensitivity:'base',numeric:true});
export function orderedProjects<T extends {id:string;name:string}>(projects:readonly T[]) {
  return [...projects].sort((a,b)=>frenchProjectNames.compare(a.name,b.name) || (a.id<b.id?-1:a.id>b.id?1:0));
}

export function layout(
  title: string,
  content: string,
  projects: Pick<Projects[number], 'id' | 'name'>[] = [],
  selected = '',
  authenticated = false,
  activeModule = '',
): string {
  const menu = orderedProjects(projects);
  const current = menu.find(project => project.id === selected) ?? menu[0];
  const navigation: [string,string,string,string][] = [
    ['workspace','Command Center','/workspace','▦'],
    ['office','Agent Office','/office','▧'],
  ];
  if (current) {
    const prefix = '/projects/' + encodeURIComponent(current.id);
    navigation.push(
      ['control','Agent Control Room',prefix + '/control','⇄'],
      ['knowledge','Project Intelligence',prefix + '/knowledge','≡'],
      ['quality','Quality Lab',prefix + '/quality','✓'],
      ['lab','App Lab',prefix + '/lab','▣'],
    );
  }
  navigation.push(['database','Database Explorer',selected?'/projects/'+encodeURIComponent(selected)+'/database':'/database','▤'],
    ['academy','Studio Academy','/academy','◇']);
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)} · Folk &amp; Joy Studio</title>
  <link rel="stylesheet" href="/style.css">
  ${activeModule==='academy'?'<link rel="stylesheet" href="/academy.css">':''}
</head>
<body>
<a href="#contenu" class="skip">Aller au contenu</a>
<header class="topbar">
  <a class="brand" href="${authenticated ? '/workspace' : '/'}"><span class="mark" aria-hidden="true">FJ</span><span>Folk &amp; Joy <b>Studio</b></span></a>
  <div class="header-actions">
    <span class="local"><span aria-hidden="true"></span> Espace local</span>
    ${authenticated && activeModule!=='academy'?`<a class="context-guide" href="${e(academyGuide(activeModule,title))}${selected?'?project='+encodeURIComponent(selected):''}">Guide de cet espace</a>`:''}
    ${authenticated ? '<form action="/logout" method="post"><button class="quiet">Déconnexion</button></form>' : ''}
  </div>
</header>
<div class="frame ${authenticated ? '' : 'without-sidebar'}">
  ${authenticated ? `<nav aria-label="Navigation du Studio" class="sidebar">
    <h2>Espaces</h2>
    ${navigation.map(([key,name,path,symbol]) => `<a class="workspace-link" href="${e(path)}"${activeModule === key || (!activeModule && title === name) ? ' aria-current="page"' : ''}><span class="nav-symbol" aria-hidden="true">${symbol}</span>${name}</a>`).join('')}
    ${projects.length ? '<h2 class="project-label">Projets</h2>' : ''}
    ${menu.map(project => `<a data-project-id="${e(project.id)}" href="${e(projectDestination(project.id))}"${selected === project.id ? ' class="selected-project"' : ''}>
      <span class="project-mark" aria-hidden="true">${e(project.id.slice(0,2).toUpperCase())}</span>${e(project.name)}
    </a>`).join('')}
    ${menu.some(p=>p.id===selected)?`<a class="project-home" href="/projects/${e(selected)}">Fiche du projet <span aria-hidden="true">↗</span></a>`:''}
  </nav>` : ''}
  <main id="contenu" class="content">${content}</main>
</div>
</body>
</html>`;
}

export function loginPage(error?: string): string {
  return layout('Connexion', `<section class="panel login">
    <h1>Connexion au Studio</h1>
    <p>Ouvrez votre espace avec votre clé opérateur locale.</p>
    ${error ? `<p class="error" role="alert">${e(error)}</p>` : ''}
    <form action="/login" method="post">
      <label for="token">Clé opérateur</label>
      <input id="token" name="token" type="password" required maxlength="128" autocomplete="current-password">
      <button class="primary">Se connecter</button>
    </form>
  </section>`);
}

export function errorPage(message: string): string {
  return layout('Demande refusée', `<section class="panel login"><h1>Demande impossible</h1>
    <p role="alert">${e(message)}</p><a href="/">Retour au Studio</a></section>`);
}

function resumeSection(project:Project, stack:Stack, follow:Follow|undefined, writable:boolean, personal:boolean){
  const base='/projects/'+e(project.id),attention=follow?.attention??'normal';
  const conditions=stack.status==='unavailable'?'Le dossier ne peut pas être lu actuellement.':stack.status==='unlinked'?'Aucun dossier local relié.':stack.status==='partial'?'Un manifeste est illisible. Le relevé est partiel.':'';
  const checks=stack.checks.filter((v,i,all)=>all.findIndex(x=>x.name===v.name)===i);
  return `<section class="panel resume-panel" id="reprise"><header class="section-head"><h2>Reprendre ce projet</h2>
    ${personal?'<span class="focus-label '+attention+'">'+followLabels[attention]+'</span>':''}</header>
    ${follow?.note?'<p class="resume-note">'+e(follow.note)+'</p>':''}
    ${conditions?'<p>'+conditions+'</p>':''}
    ${stack.tools.length?'<ul class="stack-tags" aria-label="Technologies déclarées">'+stack.tools.map(t=>'<li>'+e(t)+'</li>').join('')+'</ul>':''}
    ${stack.storage.length?'<p>'+stack.storage.map(e).join(' · ')+'</p>':''}
    ${stack.files.length?`<details><summary>Manifestes et contrôles déclarés</summary><p>${stack.files.map(f=>'<code>'+e(f)+'</code>').join(' · ')}</p>
    ${checks.length?'<ul>'+checks.map(c=>'<li><code>'+e(c.name)+'</code> · '+e(c.file)+'</li>').join('')+'</ul>':''}</details>`:''}
    <div class="actions">${writable&&stack.files.length?`<a class="button primary" href="${base}/control?modele=reprise#brief">Préparer une recette</a>`:''}
    <a href="${base}/database">Sources de données</a><a href="/activity?project=${e(project.id)}">Journal du projet</a></div>
    ${personal&&writable?`<details class="follow-edit"><summary>Modifier mon suivi</summary><form method="post" action="${base}/follow">
    <input type="hidden" name="revision" value="${follow?.revision??0}">
    <label>Place dans mon portefeuille<select name="attention">${Object.entries(followLabels).map(([key,title])=>'<option value="'+key+'"'+(key===attention?' selected':'')+'>'+title+'</option>').join('')}</select></label>
    <label>Ma prochaine action<input name="note" maxlength="280" value="${e(follow?.note??'')}"></label>
    <button>Enregistrer mon suivi</button></form></details>`:''}</section>`;
}
export function projectPage(projects: Projects, project: Project, commandKey: string, canOperate = true,
  git?: Awaited<ReturnType<Core['repositories']['state']>>,team=false,cursor:CursorPull[]=[],stack?:Stack,follow?:Follow,personal=false): string {
  const missionList = project.missions.length > 0
    ? `<ul class="mission-list">${project.missions.map(mission => `<li>
        <a href="/projects/${e(project.id)}/missions/${e(mission.id)}">
          <strong>Mission A1 · ${label(mission.fixtureId)}</strong>
          <span>${date(mission.createdAt)} · ${e(mission.planVersion)}</span>
        </a>
        ${state(mission.status)}
      </li>`).join('')}</ul>`
    : '<p class="empty">Aucune mission pour ce projet. Lancez un premier cas pour consulter ses preuves.</p>';
  return layout(project.name, `
  <div class="heading"><div><h1>${e(project.name)}</h1></div>
    <a class="button" href="/projects/${e(project.id)}/settings">Profil du projet</a></div>
  ${stack?resumeSection(project,stack,follow,canOperate,personal):''}
  ${git?.target?`<section class="panel project-signal"><div><h2>Dernier relevé Git</h2>
    ${git.observations[0]?`<strong class="branch-name">${e(git.observations[0].branch??'HEAD détachée')}</strong>
    <p><code>${e(git.observations[0].local_commit.slice(0,8))}</code> · ${date(git.observations[0].observed_at)}</p>
    <div class="git-counts"><span><b>${git.observations[0].worktree.staged}</b> indexé(s)</span><span><b>${git.observations[0].worktree.unstaged}</b> modifié(s)</span><span><b>${git.observations[0].worktree.untracked}</b> non suivi(s)</span></div>`:'<p>Aucun relevé enregistré.</p>'}</div>
    <div class="actions"><a class="button" href="/projects/${e(project.id)}/repository">Ouvrir le relevé</a>
    <a class="button" href="/workspace?project=${e(project.id)}">Tableau de bord du projet</a></div></section>`:''}
  <nav class="actions project-tools" aria-label="Outils du projet">
    <a class="button" href="/projects/${e(project.id)}/knowledge">Project Intelligence · Connaissances</a>
    <a class="button" href="/projects/${e(project.id)}/repository">Dépôt et versions</a>
    ${project.id === 'a' ? '<a class="button" href="/projects/a/review">Revue des changements Git</a>' : ''}
    <a class="button" href="/projects/${e(project.id)}/control">Missions et agents</a>
    <a class="button" href="/projects/${e(project.id)}/quality">Quality Lab</a>
    <a class="button" href="/projects/${e(project.id)}/lab">App Lab</a>
    <a class="button" href="/projects/${e(project.id)}/database">Schémas de données</a>
    <a class="button" href="/projects/${e(project.id)}/architecture">Architecture du projet</a>
    <a class="button" href="/projects/${e(project.id)}/automations">Automatisations</a>
    <a class="button" href="/activity?project=${e(project.id)}">Chronologie du projet</a></nav>
  ${cursor.length?`<section class="panel cursor-project"><h2>Sessions Cursor du projet</h2>
    <p>${new Set(cursor.map(r=>r.agent_id)).size} sessions reliées par les pull requests GitHub.</p>
    <a class="button" href="/office?project=${e(project.id)}#cursor">Retrouver les sessions et les PR →</a></section>`:''}
  ${team?`<section class="panel team-brief"><h2>Le binôme local du Studio</h2>
    <p>Le documentaliste indexe les sections. Le vérificateur retrouve tes critères dans le document, puis contrôle les deux preuves.</p>
    <div class="actions"><a href="/office?project=${e(project.id)}">Voir le binôme au bureau</a>
    <a href="/projects/${e(project.id)}/control">Confier ton propre document</a></div>
    ${canOperate && git?.observations[0]?`<form method="post" action="/projects/${e(project.id)}/team-brief">
      <input type="hidden" name="commandKey" value="${e(commandKey)}"><input type="hidden" name="observation" value="${e(git.observations[0].id)}">
      <label>Mission sur le relevé du ${date(git.observations[0].observed_at)}<select name="kind"><option value="handoff">Préparer la passation Git</option><option value="clean">Vérifier la propreté du dépôt</option></select></label>
      <button class="primary">Préparer le brouillon</button></form>`:''}</section>`:''}
  <div class="overview">
    <section class="panel"><h2>Contexte du projet</h2>
      <p>${e(project.context.description)}</p>${project.context.classification === 'synthetic' ? '<span class="badge">Données synthétiques</span>' : ''}
    </section>
    ${canOperate && !team ? `<section class="panel"><h2>Lancer une mission A1</h2>
      <form action="/projects/${e(project.id)}/missions" method="post">
        <input type="hidden" name="commandKey" value="${e(commandKey)}">
        <label for="fixtureId">Jeu de données synthétique</label>
        <select name="fixtureId" id="fixtureId">
          <option value="nominal">Cas nominal</option>
          <option value="incorrect">Cas incorrect · contrôle négatif</option>
        </select>
        <button class="primary">Lancer la mission</button>
      </form>
    </section>` : ''}
  </div>
  ${team && !project.missions.length?'':`<section class="panel" id="missions"><h2>Missions A1</h2>${missionList}</section>`}`, projects, project.id, true);
}

export function missionPage(projects: Projects, mission: Mission, canOperate = true): string {
  const address = `/projects/${e(mission.projectId)}/missions/${e(mission.id)}`;
  const live = mission.status === 'ready' || mission.status === 'running';
  const verdict = mission.steps.find(step => step.role === 'verifier')?.checkpoint?.artifact;
  const review = missionQuality(mission);
  const steps = mission.steps.map((step, i) => `
    <li class="panel step">
      <header><h3><span class="step-index" aria-hidden="true">${i + 1}</span> ${label(step.role)}</h3>${state(step.status)}</header>
      <p>${step.role === 'preparer' ? 'Transforme la source synthétique en livrable.' : 'Dépend du checkpoint du préparateur. Contrôle le livrable selon le référentiel indépendant.'}</p>
      ${step.attempts.length ? `<ul class="attempts">${step.attempts.map(attempt => `<li>
        <div><strong>Tentative ${e(attempt.generation)}</strong><span>${e(attempt.runnerId)} · Bail jusqu’au ${date(attempt.leaseUntil)}</span></div>
        ${state(attempt.status)}
      </li>`).join('')}</ul>` : '<p class="empty">Aucune tentative enregistrée.</p>'}
      ${step.checkpoint ? `<details><summary>Checkpoint et preuve</summary>
        <p class="digest">SHA-256 <code>${e(step.checkpoint.digest)}</code></p>
        ${pretty(step.checkpoint.artifact)}
      </details>` : ''}
    </li>`).join('');
  return layout('Mission A1', `
    <a class="back" href="/projects/${e(mission.projectId)}">← Toutes les missions du projet</a>
    <div class="heading">
      <div><h1>Mission A1</h1><p>${label(mission.fixtureId)} · ${e(mission.planVersion)}</p></div>
      ${state(mission.status)}
    </div>
    <section class="panel meta" aria-label="État de la mission">
      <div><h2>État et reprise</h2><p>${e(mission.reason ? (reasons[mission.reason] ?? mission.reason) : (live ? 'Le worker local reprend les étapes admissibles.' : mission.status === 'paused' ? 'La suspension bloque les attributions et fige le temps restant.' : 'Mission terminée. Les preuves restent consultables.'))}</p>
      <p>${mission.status === 'paused' ? 'Horizon à recalculer à la reprise' : 'Échéance ' + date(mission.deadlineAt)} · Budget IA 0 €</p></div>
      <div class="actions">
        <a class="button" href="${address}">Actualiser</a>
        <a class="button" href="${address}/report">Exporter le rapport JSON</a>
        ${canOperate && ['failed','cancelled'].includes(mission.status) ? `<details><summary>Relancer</summary><form action="${address}/relaunch" method="post">
        <input type="hidden" name="commandKey" value="${randomUUID()}"><label><input type="checkbox" required name="confirm" value="yes"> Créer une nouvelle mission avec la même fixture et le contexte validé actuel</label><button>Relancer la mission</button></form></details>` : ''}
        ${canOperate && live && !mission.steps.some(s=>s.attempts.some(a=>a.status==='active')) ? `<form action="${address}/pause" method="post"><button>Suspendre</button></form>` : ''}
        ${canOperate && mission.status === 'paused' ? `<form action="${address}/resume" method="post"><button>Reprendre</button></form>` : ''}
        ${canOperate && (live || mission.status === 'paused') ? `<details><summary>Annuler la mission</summary><form action="${address}/cancel" method="post">
          <label><input type="checkbox" name="confirm" value="yes" required> Confirmer l’annulation et invalider les tentatives en cours</label><button>Confirmer l’annulation</button></form></details>` : ''}
      </div>
    </section>
    ${canOperate && live && mission.steps.some(s=>s.attempts.some(a=>a.status==='active')) ? '<p>La suspension devient disponible à la fin de la tentative active.</p>' : ''}
    ${mission.status==='succeeded' ? '<p>Cette mission est clôturée. Les preuves et le rapport restent consultables.</p>' : ''}
    ${mission.repository ? `<section class="panel"><h2>Version du dépôt associée</h2>
    <p>${e(mission.repository.repository_key)} · ${e(mission.repository.branch ?? 'HEAD détachée')} · observée le ${date(mission.repository.observed_at)}</p>
    <code class="digest">${e(mission.repository.local_commit)}</code><p>Observation du code. Le runner A1 exécute la fixture synthétique.</p></section>` : ''}
    <section class="panel"><h2>Contexte utilisé</h2><p>Préparer les exigences synthétiques du projet ${e(mission.projectId.toUpperCase())}, puis contrôler le livrable.</p>
    ${mission.context.length ? `<ul>${mission.context.map(c=>{
      const trace=mission.contextSources.find(s=>s.id===c.id);
      return `<li><a href="/projects/${e(mission.projectId)}/knowledge/${e(c.id)}#v${e(c.version)}">${e(c.title)} · v${e(c.version)}</a>
        ${trace?`<p>${e(origins[trace.origin])} · validée par ${e(trace.actor)} le ${date(trace.validated_at)} ·
        ${trace.selected_at ? 'sélectionnée le '+date(trace.selected_at) : 'heure de sélection non enregistrée en G3'}</p>`:''}</li>`;
    }).join('')}</ul>` : '<p>Aucune connaissance référencée pour cette mission.</p>'}</section>
    ${verdict ? `<section class="panel verdict">
      <h2>Verdict indépendant</h2><p><strong>${review.outcome === 'passed' ? 'Contrôles réussis' : review.outcome === 'failed' ? 'Contrôle négatif' : 'Verdict incertain'}</strong>
      · Référentiel ${e(verdict.rubricVersion)}</p>
      <p>${e(review.runnerId)} · ${date(review.recordedAt)} · Preuve SHA-256 <code class="digest">${e(review.evidence?.sha256)}</code></p>
      <ul class="quality-results">${review.checks.map(c=>`<li><strong>${e(checkLabels[c.state])} · ${e(c.label)}</strong><p>Attendu · ${e(c.expected)}</p><p>Rapport du vérificateur · ${e(c.detail)}</p></li>`).join('')}</ul>
    </section>` : `<section class="panel"><h2>Quality Lab</h2><p>Le vérificateur n’a remis aucun rapport.</p>
    <ul>${review.checks.map(c=>`<li>${e(c.label)} · ${e(checkLabels[c.state])}</li>`).join('')}</ul></section>`}
    <section><h2>Étapes et preuves</h2><ol class="steps">${steps}</ol></section>
    <section class="panel"><h2>Historique</h2>
      ${mission.events.length ? `<ol class="history">${mission.events.map(event =>
        `<li>${date(event.at)}<span>${e(eventLabels[event.type] ?? event.type)}${event.role ? ' · ' + label(event.role) : ''}${event.details?.operatorId ? ' · '+e(event.details.operatorId) : ''}${event.details?.runnerId ? ' · '+e(event.details.runnerId) : ''}</span></li>`
      ).join('')}</ol>` : '<p class="empty">Aucun événement enregistré.</p>'}
      <details><summary>Plan versionné</summary>${pretty(mission.plan)}</details>
    </section>`, projects, mission.projectId, true);
}
