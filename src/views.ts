import type { Core } from './core.ts';

type Projects = Awaited<ReturnType<Core['listProjects']>>;
type Project = Awaited<ReturnType<Core['getProject']>>;
type Mission = Awaited<ReturnType<Core['getMission']>>;

const labels: Record<string, string> = {
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
const eventLabels: Record<string, string> = {
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

function e(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

function date(value: unknown): string {
  if (!value) return '—';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return e(value);
  return `<time datetime="${parsed.toISOString()}">${e(parsed.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'))}</time>`;
}

function label(value: string): string {
  return e(labels[value] ?? value);
}

function state(value: string): string {
  return `<span class="badge state-${e(value)}">${label(value)}</span>`;
}

function pretty(value: unknown): string {
  return `<pre>${e(JSON.stringify(value, null, 2))}</pre>`;
}

function layout(
  title: string,
  content: string,
  projects: Projects = [],
  selected = '',
  authenticated = false,
): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)} · Folk &amp; Joy Studio</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
<a href="#contenu" class="skip">Aller au contenu</a>
<header class="topbar">
  <a class="brand" href="/"><span class="mark" aria-hidden="true">FJ</span> Folk &amp; Joy Studio</a>
  <div class="header-actions">
    <span class="local"><span aria-hidden="true"></span> Espace local</span>
    ${authenticated ? '<form action="/logout" method="post"><button class="quiet">Déconnexion</button></form>' : ''}
  </div>
</header>
<div class="frame ${projects.length ? '' : 'without-sidebar'}">
  ${projects.length ? `<nav aria-label="Projets" class="sidebar">
    <h2>Projets</h2>
    ${projects.map(project => `<a href="/projects/${e(project.id)}"${selected === project.id ? ' aria-current="page"' : ''}>
      <span class="project-mark" aria-hidden="true">${e(project.id.toUpperCase())}</span>${e(project.name)}
    </a>`).join('')}
  </nav>` : ''}
  <main id="contenu" class="content">${content}</main>
</div>
</body>
</html>`;
}

export function loginPage(error?: string): string {
  return layout('Connexion', `<section class="panel login">
    <h1>Connexion au Studio</h1>
    <p>Utilisez votre clé opérateur locale.</p>
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

export function projectPage(projects: Projects, project: Project, commandKey: string): string {
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
  <div class="heading"><div><h1>${e(project.name)}</h1><p>Contexte et missions déterministes</p></div></div>
  <div class="overview">
    <section class="panel"><h2>Contexte du projet</h2>
      <p>${e(project.context.description)}</p><span class="badge">Données synthétiques</span>
    </section>
    <section class="panel"><h2>Lancer une mission A1</h2>
      <form action="/projects/${e(project.id)}/missions" method="post">
        <input type="hidden" name="commandKey" value="${e(commandKey)}">
        <label for="fixtureId">Jeu de données synthétique</label>
        <select name="fixtureId" id="fixtureId">
          <option value="nominal">Cas nominal</option>
          <option value="incorrect">Cas incorrect · contrôle négatif</option>
        </select>
        <button class="primary">Lancer la mission</button>
      </form>
    </section>
  </div>
  <section class="panel"><h2>Missions</h2>${missionList}</section>`, projects, project.id, true);
}

export function missionPage(projects: Projects, mission: Mission): string {
  const address = `/projects/${e(mission.projectId)}/missions/${e(mission.id)}`;
  const live = mission.status === 'ready' || mission.status === 'running';
  const verdict = mission.steps.find(step => step.role === 'verifier')?.checkpoint?.artifact;
  const steps = mission.steps.map((step, i) => `
    <li class="panel step">
      <header><h3><span class="step-index" aria-hidden="true">${i + 1}</span> ${label(step.role)}</h3>${state(step.status)}</header>
      <p>${step.role === 'preparer' ? 'Transforme la source synthétique en livrable.' : 'Contrôle le livrable avec le référentiel qualité indépendant.'}</p>
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
      <div><h2>État et reprise</h2><p>${e(mission.reason ? (reasons[mission.reason] ?? mission.reason) : (live ? 'Le worker local reprend les étapes admissibles.' : 'Mission terminée. Les preuves restent consultables.'))}</p>
      <p>Échéance ${date(mission.deadlineAt)} · Budget IA 0 €</p></div>
      <div class="actions">
        <a class="button" href="${address}">Actualiser</a>
        ${live ? `<form action="${address}/cancel" method="post"><button class="quiet">Annuler la mission</button></form>` : ''}
      </div>
    </section>
    ${verdict ? `<section class="panel verdict">
      <h2>Verdict indépendant</h2><p><strong>${verdict.passed === true ? 'Contrôles réussis' : 'Contrôle négatif'}</strong>
      · Référentiel ${e(verdict.rubricVersion)}</p>
      ${Array.isArray(verdict.checks) ? `<ul>${verdict.checks.map(check => {
        if (!check || typeof check !== 'object') return '';
        return `<li>${check.passed === true ? 'Réussi' : 'Échec'} · ${e(check.label)} ${check.detail ? `<span>· ${e(check.detail)}</span>` : ''}</li>`;
      }).join('')}</ul>` : ''}
    </section>` : ''}
    <section><h2>Étapes et preuves</h2><ol class="steps">${steps}</ol></section>
    <section class="panel"><h2>Historique</h2>
      ${mission.events.length ? `<ol class="history">${mission.events.map(event =>
        `<li>${date(event.at)}<span>${e(eventLabels[event.type] ?? event.type)}${event.role ? ' · ' + label(event.role) : ''}</span></li>`
      ).join('')}</ol>` : '<p class="empty">Aucun événement enregistré.</p>'}
      <details><summary>Plan versionné</summary>${pretty(mission.plan)}</details>
    </section>`, projects, mission.projectId, true);
}
