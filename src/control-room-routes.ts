import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import {
  DomainError,
  isObject,
  isProjectId,
  type JsonObject,
  type Operator,
  type ProjectId,
  type Runner,
} from './contracts.ts';
import { assertId, assertProject } from './database.ts';
import { date, e, layout } from './views.ts';
import {
  commandMission,
  controlDetail,
  createControlMission,
  invalid,
  listControlMissions,
  type ControlMission,
} from './control-room.ts';
import { claimControl, completeControl, heartbeatControl } from './control-room-queue.ts';
import { controlAdapters, controlLimits, documentPlan } from './control-room-adapters.ts';

type Tools = {
  body(req: IncomingMessage, kind: 'form' | 'json'): Promise<JsonObject>;
  json(res: ServerResponse, status: number, value: unknown): void;
  html(res: ServerResponse, status: number, page: string): void;
  redirect(res: ServerResponse, path: string): void;
};
const fieldNames = ['objective', 'scope', 'constraints', 'document', 'criteria', 'risk', 'durationMinutes'];
const labels: Record<string, string> = {
  draft: 'Brouillon',
  needs_approval: 'Validation attendue',
  ready: 'Prête',
  running: 'En cours',
  paused: 'Suspendue',
  blocked: 'Bloquée',
  completed: 'Terminée',
  failed: 'Échec',
  cancelled: 'Annulée',
  waiting: 'En attente',
  interrupted: 'Interrompue',
  expired: 'Bail expiré',
};
const actionWords: Record<string, string> = {
  plan: 'Valider le plan',
  approve: 'Autoriser le plan',
  reject: 'Refuser le plan',
  pause: 'Suspendre',
  resume: 'Reprendre',
  cancel: 'Annuler la mission',
  relaunch: 'Créer une nouvelle mission avec ce périmètre',
};
const actionStates: Record<string, string[]> = {
  draft: ['plan', 'cancel'],
  needs_approval: ['approve', 'reject', 'cancel'],
  running: ['pause', 'cancel'],
  ready: ['pause', 'cancel'],
  paused: ['resume', 'cancel'],
  failed: ['relaunch'],
  completed: ['relaunch'],
  cancelled: ['relaunch'],
  blocked: ['relaunch', 'cancel'],
};
function checkFields(input: JsonObject, known: string[]) {
  if (Object.keys(input).some((k) => !known.includes(k)))
    invalid('La commande contient des paramètres inconnus.');
}
function hidden(key: string, value: unknown) {
  return `<input type="hidden" name="${e(key)}" value="${e(value)}">`;
}
function briefForm(path: string, m?: ControlMission) {
  return `<form method="post" action="${e(path)}">${hidden('commandKey', randomUUID())}${m ? hidden('revision', m.revision) : ''}
    <label>Objectif<input required maxlength="240" name="objective" value="${e(m?.objective ?? '')}"></label>
    <label>Périmètre<textarea required maxlength="1200" name="scope">${e(m?.scope ?? '')}</textarea></label>
    <label>Contraintes<textarea maxlength="1200" name="constraints">${e(m?.constraints_text ?? '')}</textarea></label>
    <label>Document à examiner<textarea required rows="7" maxlength="10000" name="document">${e(m?.document ?? '')}</textarea></label>
    <label>Expressions attendues, une par ligne<textarea required maxlength="1932" name="criteria">${e(m?.criteria.join('\n') ?? '')}</textarea></label>
    <label>Décision avant exécution<select name="risk"><option value="normal">Plan standard</option>
      <option value="review"${m?.risk === 'review' ? ' selected' : ''}>Approbation opérateur requise</option></select></label>
    <label>Durée maximale en minutes<input required type="number" min="1" max="60" name="durationMinutes" value="${m?.duration_minutes ?? 15}"></label>
    <button>${m ? 'Enregistrer la révision' : 'Créer le brouillon'}</button></form>`;
}
function planTable() {
  const rows = documentPlan
    .map(
      (t) => `<tr><th>${e(t.label)}</th><td>${e(controlAdapters[t.key].id)}</td>
    <td>${e(t.capability)}</td><td>${t.dependencies.length ? 'Deux checkpoints vérifiés' : 'Dès la mise en file'}</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>Tâche</th><th>Adaptateur local</th><th>Capacité</th><th>Disponibilité</th></tr></thead><tbody>${rows}</tbody></table>`;
}
async function projects(pool: Pool, actor: Operator) {
  return (
    await pool.query<{ id: ProjectId; name: string; context: JsonObject }>(
      'SELECT id,name,context FROM projects WHERE id=ANY($1::text[]) ORDER BY id',
      [actor.projectIds],
    )
  ).rows;
}
function controls(path: string, m: ControlMission) {
  return (actionStates[m.status] ?? [])
    .map(
      (action) => `<form method="post" action="${path}/${action}">
    ${hidden('commandKey', randomUUID())}${hidden('revision', m.revision)}
    ${['reject', 'approve', 'cancel', 'relaunch'].includes(action) ? '<label><input type="checkbox" name="confirm" value="yes" required> Confirmer</label>' : ''}
    <button>${e(actionWords[action])}</button></form>`,
    )
    .join('');
}
function detailView(root: string, detail: Awaited<ReturnType<typeof controlDetail>>, canOperate: boolean) {
  const m = detail.mission,
    path = root + '/' + m.id;
  const tasks = detail.tasks
    .map(
      (
        t,
      ) => `<li><strong>${e(documentPlan.find((p) => p.key === t.task_key)?.label)}</strong> · ${e(labels[t.state] ?? t.state)}
    ${t.sha256 ? `<details><summary>Checkpoint et SHA-256</summary><code>${e(t.sha256)}</code><pre>${e(JSON.stringify(t.result, null, 2))}</pre></details>` : ''}</li>`,
    )
    .join('');
  const events = detail.events
    .map(
      (v) =>
        `<li>${date(v.at)} · ${e(v.actor)} · ${e(v.event_type)}<span>${e(JSON.stringify(v.details))}</span></li>`,
    )
    .join('');
  const attempts = detail.attempts
    .map(
      (
        a,
      ) => `<li>${e(a.task_key)} · ${e(a.runner_id)} · tentative ${e(a.generation)} · ${e(labels[a.state] ?? a.state)}
    <span>${date(a.started_at)} · dernière présence ${date(a.heartbeat_at)}</span></li>`,
    )
    .join('');
  const ctx = m.context
    .map(
      (
        k,
      ) => `<li><a href="/projects/${e(m.project_id)}/knowledge/${e(k.id)}">${e(k.title)}</a> · v${e(k.version)}
    <details><summary>Contenu retenu au démarrage</summary><pre>${e(k.content)}</pre><code>${e(k.digest)}</code></details></li>`,
    )
    .join('');
  return `<a class="back" href="${e(root)}">← Missions du projet</a><div class="heading"><h1>${e(m.objective)}</h1><span class="badge">${e(labels[m.status])}</span></div>
    <section class="panel"><h2>Contrat de mission</h2><p>${e(m.scope)}</p><p>${e(m.constraints_text)}</p>
    <p>Créée par ${e(m.created_by)} · révision ${m.revision} · budget 0 € · ${m.duration_minutes} min${m.deadline_at ? ' · échéance ' + date(m.deadline_at) : ''}</p>
    ${m.parent_id ? `<p><a href="${root}/${e(m.parent_id)}">Mission d’origine</a></p>` : ''}
    ${m.reason ? `<p>Motif · ${e(m.reason)}</p>` : ''}<h3>Critères</h3><ul>${m.criteria.map((c) => '<li>' + e(c) + '</li>').join('')}</ul>
    <details><summary>Document fourni</summary><pre>${e(m.document)}</pre><code>${e(m.source_sha256)}</code></details>
    ${ctx ? `<h3>Révisions validées retenues</h3><ul>${ctx}</ul>` : ''}
    <div class="actions"><a href="${path}/report">Télécharger le rapport JSON</a>
    <a href="${path}/handoff">Échange manuel et propositions</a></div></section>
    <section class="panel"><h2>Plan et contrôles</h2>${planTable()}${canOperate ? '<div class="actions">' + controls(path, m) + '</div>' : ''}</section>
    ${canOperate && ['draft', 'needs_approval'].includes(m.status) ? `<details class="panel"><summary>Modifier le périmètre</summary>${briefForm(path + '/edit', m)}</details>` : ''}
    ${tasks ? `<section class="panel"><h2>Travaux et livrables</h2><ul>${tasks}</ul></section>` : ''}
    ${attempts ? `<section class="panel"><h2>Tentatives</h2><ul class="history">${attempts}</ul></section>` : ''}
    <section class="panel"><h2>Historique</h2><ul class="history">${events}</ul></section>`;
}
export async function controlRoomRoute(
  pool: Pool,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  actor: Operator,
  api: boolean,
  io: Tools,
) {
  const match = /^\/projects\/([^/]+)\/control(?:\/([^/]+)(?:\/([^/]+))?)?$/.exec(
    api ? url.pathname.slice(4) : url.pathname,
  );
  if (!match) return false;
  const [, project, id, action] = match;
  if (!isProjectId(project)) throw new DomainError(404, 'not_found', 'Projet introuvable.');
  assertProject(actor, project);
  if (id) assertId(id);
  const root = '/projects/' + project + '/control';
  if (req.method === 'GET' && (!action || action === 'report')) {
    if (id) {
      const detail = await controlDetail(pool, actor, project, id);
      if (action === 'report')
        res.setHeader('Content-Disposition', `attachment; filename="control-${id}.json"`);
      if (api || action === 'report') io.json(res, 200, detail);
      else
        io.html(
          res,
          200,
          layout(
            detail.mission.objective,
            detailView(root, detail, actor.accountRole !== 'viewer'),
            await projects(pool, actor),
            project,
            true,
          ),
        );
    } else {
      const missions = await listControlMissions(pool, actor, project);
      if (api)
        io.json(res, 200, { missions, adapters: controlAdapters, plan: documentPlan, limits: controlLimits });
      else {
        const items = missions
          .map(
            (
              m,
            ) => `<li><a href="${root}/${e(m.id)}"><strong>${e(m.objective)}</strong><span>${date(m.updated_at)}</span></a>
          <span class="badge">${e(labels[m.status])}</span></li>`,
          )
          .join('');
        const panel = `<div class="heading"><h1>Agent Control Room</h1></div>
          <section class="panel"><h2>Missions de revue documentaire</h2>${items ? '<ul class="mission-list">' + items + '</ul>' : '<p>Aucune mission de revue pour ce projet.</p>'}</section>
          ${actor.accountRole === 'viewer' ? '' : `<section class="panel"><h2>Créer une mission</h2><p>Les agents indexent la structure du document soumis et localisent les expressions demandées. Un vérificateur recalcule les preuves.</p>${briefForm(root)}</section>`}
          <details class="panel"><summary>Adaptateurs et limites</summary>${planTable()}<p>Deux travaux peuvent progresser en parallèle dans le projet. Chaque lecteur travaille sur le texte du contrat, en mémoire. Budget des moteurs externes&nbsp;: 0 €.</p></details>`;
        io.html(res, 200, layout('Agent Control Room', panel, await projects(pool, actor), project, true));
      }
    }
    return true;
  }
  if (req.method !== 'POST') throw new DomainError(405, 'method', 'Méthode indisponible.');
  const input = await io.body(req, api ? 'json' : 'form');
  if (typeof input.commandKey !== 'string') invalid('Clé de commande requise.');
  let result: { id: string };
  if (!id) {
    checkFields(input, ['commandKey', ...fieldNames]);
    result = await createControlMission(pool, actor, project, input.commandKey, input);
  } else if (action) {
    checkFields(input, [
      'commandKey',
      'revision',
      ...(action === 'edit' ? fieldNames : []),
      ...(['approve', 'reject', 'cancel', 'relaunch'].includes(action) ? ['confirm'] : []),
    ]);
    if (['approve', 'reject', 'cancel', 'relaunch'].includes(action) && input.confirm !== 'yes')
      invalid('Confirmez cette décision.');
    const { commandKey, revision, confirm, ...fields } = input;
    result = await commandMission(
      pool,
      actor,
      project,
      id,
      action,
      commandKey as string,
      Number(revision),
      fields,
    );
  } else invalid('Action de mission absente.');
  if (api) io.json(res, id && action !== 'relaunch' ? 200 : 201, result);
  else io.redirect(res, root + '/' + result.id);
  return true;
}
export async function controlRunnerRoute(
  pool: Pool,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  runner: Runner,
  io: Pick<Tools, 'body' | 'json'>,
) {
  const path = url.pathname.match(/^\/api\/runner\/control\/(claim|heartbeat|complete)$/);
  if (!path) return false;
  if (req.method !== 'POST') throw new DomainError(405, 'method', 'Méthode indisponible.');
  const input = await io.body(req, 'json');
  if (path[1] === 'claim') {
    checkFields(input, []);
    io.json(res, 200, { assignment: await claimControl(pool, runner) });
  } else {
    checkFields(
      input,
      path[1] === 'complete' ? ['attemptId', 'generation', 'result'] : ['attemptId', 'generation'],
    );
    if (
      typeof input.attemptId !== 'string' ||
      typeof input.generation !== 'number' ||
      !Number.isSafeInteger(input.generation) ||
      input.generation < 1
    )
      invalid('Attribution invalide.');
    if (path[1] === 'heartbeat')
      io.json(res, 200, {
        leaseUntil: await heartbeatControl(pool, runner, input.attemptId, input.generation),
      });
    else {
      if (!isObject(input.result)) invalid('Livrable attendu.');
      const accepted = await completeControl(pool, runner, input.attemptId, input.generation, input.result);
      io.json(res, accepted ? 200 : 422, { accepted });
    }
  }
  return true;
}
