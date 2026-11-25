import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DomainError, isProjectId, type JsonObject, type Operator, type ProjectId } from './contracts.ts';
import type { Core } from './core.ts';
import type { AppLab, LabSession, SessionState } from './app-lab.ts';
import { date, e, layout } from './views.ts';

type Controller = Pick<Core, 'listProjects'> & {appLab: AppLab};
type Projects = Awaited<ReturnType<Core['listProjects']>>;

interface HttpTools {
  body(req: IncomingMessage, kind: 'json' | 'form'): Promise<JsonObject>;
  json(res: ServerResponse, status: number, value: unknown): void;
  html(res: ServerResponse, status: number, value: string): void;
  redirect(res: ServerResponse, path: string): void;
}

const stateLabel: Record<SessionState,string> = {
  created: 'Réservée', simulated: 'Simulation démarrée',
  stopped: 'Arrêtée', revoked: 'Révoquée', expired: 'Expirée',
};

function basePath(project: ProjectId) {
  return '/projects/' + project + '/app-lab';
}

function listPage(projects: Projects, project: ProjectId, sessions: LabSession[]) {
  const path = basePath(project);
  const occupied = sessions.find(s => s.state === 'created' || s.state === 'simulated');
  const rows = sessions.map(s => `<li>
    <a href="${path}/${e(s.id)}"><strong>Fixture de registre</strong><span>${date(s.created_at)} · ${e(s.created_by)}</span></a>
    <span class="badge">${e(stateLabel[s.state])}</span></li>`).join('');
  return layout('App Lab', `<a class="back" href="/projects/${project}">← Projet ${project.toUpperCase()}</a>
    <div class="heading"><div><h1>App Lab</h1><p>Sessions de qualification du projet ${project.toUpperCase()}</p></div>
    <a class="button" href="${path}">Actualiser</a></div>
    <section class="panel"><h2>Fixture de registre</h2>
    <p>Le Core simule le cycle de vie de la session. Une place est disponible par projet pendant quinze minutes. La preview Expo attend la qualification de son runner.</p>
    ${occupied ? `<a class="button" href="${path}/${e(occupied.id)}">Consulter la place réservée</a>` : `
      <form method="post" action="${path}"><input type="hidden" name="commandKey" value="${randomUUID()}">
      <button>Créer une session de qualification</button></form>`}</section>
    <section class="panel"><h2>Historique des sessions</h2>${rows ? `<ul class="mission-list">${rows}</ul>` : '<p>Aucune session enregistrée.</p>'}</section>`,
    projects,project,true);
}

function sessionPage(projects: Projects, {session,events}: Awaited<ReturnType<AppLab['detail']>>) {
  const project = session.project_id;
  const base = basePath(project);
  const path = base + '/' + e(session.id);
  const open = session.state === 'created' || session.state === 'simulated';
  const history = events.map(event => `<li>${date(event.at)}
    <span>${e(stateLabel[event.state])} · ${e(event.actor)}${event.reason === 'restored' ? ' · Restauration' : ''}</span></li>`).join('');
  return layout('Session App Lab', `<a class="back" href="${base}">← Sessions du projet</a>
    <div class="heading"><div><h1>Session App Lab</h1><p>Fixture de registre · Projet ${project.toUpperCase()}</p></div>
    <span class="badge">${e(stateLabel[session.state])}</span></div>
    <section class="panel"><h2>Exécution simulée</h2>
    <p>Application ${e(session.application)} · source ${e(session.source_version)} · profil ${e(session.profile)}</p>
    <p>Créée par ${e(session.created_by)} · ${date(session.created_at)}</p><p>Échéance ${date(session.expires_at)}</p>
    <p>Ressource réservée dans le registre. Processus et ports alloués par ce profil&nbsp;: 0.</p>
    <div class="actions"><a class="button" href="${path}">Actualiser</a>
    ${session.state === 'created' ? `<form method="post" action="${path}/start"><button>Démarrer la simulation</button></form>` : ''}
    ${open ? `<details><summary>Clôturer la session</summary>
      <form method="post" action="${path}/stop"><label><input type="checkbox" name="confirm" value="yes" required> Confirmer l’arrêt</label><button>Arrêter</button></form>
      <form method="post" action="${path}/revoke"><label><input type="checkbox" name="confirm" value="yes" required> Confirmer la révocation définitive</label><button>Révoquer</button></form>
      </details>` : '<span>Session clôturée. La place du projet est libérée.</span>'}</div></section>
    <section class="panel"><h2>Journal de la session</h2><ol class="history">${history}</ol></section>`,projects,project,true);
}

export async function handleAppLabRoute(
  core: Controller, req: IncomingMessage, res: ServerResponse, url: URL,
  actor: Operator, api: boolean, io: HttpTools,
): Promise<boolean> {
  const path = api ? url.pathname.slice(4) : url.pathname;
  const matched = /^\/projects\/([^/]+)\/app-lab(?:\/([^/]+)(?:\/(start|stop|revoke))?)?$/.exec(path);
  if (!matched) return false;
  const [,project,id,action] = matched;
  if (!isProjectId(project)) throw new DomainError(404,'not_found','Projet introuvable.');
  if (req.method === 'GET' && !action) {
    if (id) {
      const result = await core.appLab.detail(actor,project,id);
      if (api) io.json(res,200,result);
      else io.html(res,200,sessionPage(await core.listProjects(actor),result));
    } else {
      const sessions = await core.appLab.list(actor,project);
      if (api) io.json(res,200,{sessions});
      else io.html(res,200,listPage(await core.listProjects(actor),project,sessions));
    }
    return true;
  }
  if (req.method === 'POST') {
    const input = await io.body(req,api ? 'json' : 'form');
    const fields = Object.keys(input);
    let session: LabSession;
    if (!id && fields.length === 1 && typeof input.commandKey === 'string') {
      session = await core.appLab.create(actor,project,input.commandKey);
    } else if (id && action === 'start' && fields.length === 0) {
      session = await core.appLab.act(actor,project,id,action);
    } else if (id && (action === 'stop' || action === 'revoke') && fields.length === 1 && input.confirm === 'yes') {
      session = await core.appLab.act(actor,project,id,action);
    } else {
      throw new DomainError(400,'app_lab_command','Vérifiez la commande de session et sa confirmation.');
    }
    if (api) io.json(res,id ? 200 : 201,{session});
    else io.redirect(res,basePath(project)+'/'+session.id);
    return true;
  }
  throw new DomainError(405,'method','Méthode indisponible sur cette ressource.');
}
