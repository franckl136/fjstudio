import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Core } from './core.ts';
import type { Credential, JsonObject, Operator, ProjectId } from './contracts.ts';
import { DomainError, isFixtureId, isObject, isProjectId } from './contracts.ts';
import { loginPage, projectPage, missionPage, errorPage } from './views.ts';

import { visibleAgents } from './agents.ts';
import { repositoryRoute } from './repository-routes.ts';
import { handleAppLabRoute } from './app-lab-routes.ts';
import { agentPage, commandPage, knowledgePage, knowledgeDetail } from './studio-views.ts';
import { missionQuality } from './quality.ts';

const css = readFileSync(new URL('./style.css', import.meta.url));
const cookieName = 'a1_operator';
const sessionTtlMs = 8 * 60 * 60 * 1000;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

function fail(status: number, code: string, message: string): never {
  throw new DomainError(status, code, message);
}

function send(res: ServerResponse, status: number, contentType?: string, body?: string | Buffer) {
  if (contentType) res.setHeader('Content-Type', contentType);
  res.writeHead(status);
  res.end(body);
}

function json(res: ServerResponse, status: number, value: unknown) {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));
}

function html(res: ServerResponse, status: number, value: string) {
  send(res, status, 'text/html; charset=utf-8', value);
}

function redirect(res: ServerResponse, location: string) {
  res.setHeader('Location', location);
  send(res, 303);
}

async function body(req: IncomingMessage, kind: 'json' | 'form'): Promise<JsonObject> {
  const contentType = req.headers['content-type']?.split(';')[0];
  const expected = kind === 'json' ? 'application/json' : 'application/x-www-form-urlencoded';
  if (contentType !== expected) fail(415, 'content_type', 'Type de requête non accepté.');
  const limit = 32 * 1024;
  if (Number(req.headers['content-length']) > limit) fail(413, 'size', 'Requête trop volumineuse.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const bytes of req) {
    const chunk = Buffer.from(bytes);
    size += chunk.length;
    if (size > limit) fail(413, 'size', 'Requête trop volumineuse.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (kind === 'form') return Object.fromEntries(new URLSearchParams(text));
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail(400, 'json', 'JSON invalide.');
  }
  if (!isObject(value)) fail(400, 'json', 'La requête doit être un objet.');
  return value;
}

function exactKeys(value: JsonObject, ...allowed: string[]) {
  if (Object.keys(value).length !== allowed.length ||
      allowed.some(key => !Object.hasOwn(value, key))) {
    fail(400, 'parameters', 'Paramètres inattendus ou manquants.');
  }
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
}

function projectId(value: unknown): ProjectId {
  if (!isProjectId(value)) fail(404, 'not_found', 'Projet ou mission introuvable.');
  return value;
}

function localAuthority(req: IncomingMessage): string {
  const { host } = req.headers;
  if (!host || !/^(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?$/.test(host)) {
    fail(403, 'local_only', 'Accès local uniquement.');
  }
  const { origin } = req.headers;
  if (origin && origin !== 'http://' + host) {
    fail(403, 'origin', 'Origine de la requête non autorisée.');
  }
  return host;
}

export function createServer(core: Core, credentials: readonly Credential[]): Server {
  const identities = new Map(credentials.map(value => [hash(value.token), value]));
  const sessions = new Map<string, { actor: Operator; expiresAt: number }>();

  function browserSession(req: IncomingMessage) {
    const value = req.headers.cookie?.split(';').map(part => part.trim())
      .find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    const key = value ? hash(value) : '';
    const session = sessions.get(key);
    if (session && session.expiresAt > Date.now()) return { key, actor: session.actor };
    if (session) sessions.delete(key);
    return null;
  }

  function bearer(req: IncomingMessage): Credential | undefined {
    const match = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(req.headers.authorization ?? '');
    return match ? identities.get(hash(match[1])) : undefined;
  }

  async function studioRoute(req: IncomingMessage, res: ServerResponse, url: URL, actor: Operator, api: boolean) {
    if (await repositoryRoute(core,req,res,url,actor,api,body)) return true;
    if (await handleAppLabRoute(core,req,res,url,actor,api,{body,json,html,redirect})) return true;
    const path = api ? url.pathname.slice(4) : url.pathname;
    if (path === '/agents' && req.method === 'GET') {
      const activity = await core.agentActivity(actor);
      const agents = visibleAgents(credentials,actor).map(agent => ({
        ...agent, activity: activity.find(r=>r.runner_id===agent.id && r.project_id===agent.project && r.role===agent.role) ?? null,
      }));
      if (api) json(res,200,{agents});
      else html(res,200,agentPage(await core.listProjects(actor),agents));
      return true;
    }
    const get = req.method === 'GET';
    const post = req.method === 'POST';
    if ((path==='/' || path==='/command') && get) {
      const data = await core.overview(actor);
      if (api) json(res,200,data);
      else html(res,200,commandPage(data));
      return true;
    }
    const memory = /^\/projects\/([^/]+)\/knowledge(?:\/([^/]+))?$/.exec(path);
    if (memory) {
      const project = projectId(memory[1]);
      const id = memory[2];
      if (get && !id) {
        const filters = url.searchParams;
        const items = await core.knowledge.list(actor,project,filters.get('q')??'',filters.get('kind')??'',filters.get('status')??'',filters.get('origin')??'',filters.get('relatedTo')??'');
        if (api) json(res,200,{items});
        else html(res,200,knowledgePage(await core.listProjects(actor),project,items,filters));
      } else if (get && uuid(id)) {
        const data = await core.knowledge.detail(actor,project,id);
        if (api) json(res,200,data);
        else html(res,200,knowledgeDetail(await core.listProjects(actor),data));
      } else if (post) {
        const input = await body(req,api?'json':'form');
        let result: {id:string};
        if (id==='import') {
          exactKeys(input);
          result=await core.knowledge.importDocument(actor,project);
        } else if (!id) {
          const fields=['kind','origin','title','content','scope','reference','relatedId','confidence','validity','claimKey','claimValue'];
          if (Object.keys(input).some(k=>!fields.includes(k))) fail(400,'parameters','Champ de proposition inattendu.');
          result=await core.knowledge.propose(actor,project,input);
        } else if (uuid(id)) {
          if (input.action==='edit') {
            const optional = ['confidence','validity','claimKey','claimValue'].filter(k=>Object.hasOwn(input,k));
            exactKeys(input,'version','action','title','content','scope',...optional);
          }
          else {
            exactKeys(input,'version','action','confirm');
            if (input.confirm!=='yes') fail(400,'confirmation','Confirmez la décision sur la révision affichée.');
          }
          result=await core.knowledge.revise(actor,project,id,input);
        } else fail(404,'not_found','Fiche introuvable.');
        if (api) json(res,id && id!=='import'?200:201,result);
        else redirect(res,'/projects/'+project+'/knowledge/'+result.id);
      } else fail(404,'not_found','Opération indisponible.');
      return true;
    }
    const inspection = /^\/projects\/([^/]+)\/missions\/([^/]+)\/(report|pause|resume|relaunch)$/.exec(path);
    if (inspection && uuid(inspection[2])) {
      const project=projectId(inspection[1]), id=inspection[2], action=inspection[3];
      if (get && action==='report') {
        const mission=await core.getMission(actor,project,id);
        res.setHeader('Content-Disposition','attachment; filename="studio-'+id+'.json"');
        json(res,200,{format:'fjstudio-mission-v1',mission,quality:missionQuality(mission)});
      } else if (post && action==='relaunch') {
        const input=await body(req,api?'json':'form');
        exactKeys(input,'confirm','commandKey');
        if (input.confirm!=='yes' || !uuid(input.commandKey)) fail(400,'confirmation','Confirmez la nouvelle exécution.');
        const source=await core.getMission(actor,project,id);
        const result=await core.createMission(actor,project,source.fixtureId,input.commandKey,id);
        if (api) json(res,201,result);
        else redirect(res,'/projects/'+project+'/missions/'+result.id);
      } else if (post && (action==='pause' || action==='resume')) {
        exactKeys(await body(req,api?'json':'form'));
        await core.setPaused(actor,project,id,action==='pause');
        if (api) send(res,204);
        else redirect(res,'/projects/'+project+'/missions/'+id);
      } else fail(404,'not_found','Opération indisponible.');
      return true;
    }
    return false;
  }

  return createHttpServer({ requestTimeout: 10_000 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const isApi = req.url?.startsWith('/api/') ?? false;
    try {
      const host = localAuthority(req);
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) fail(400, 'url', 'Adresse invalide.');
      const url = new URL(req.url, 'http://' + host);
      const path = url.pathname;
      const method = req.method;
      if (path === '/style.css' && method === 'GET') {
        send(res, 200, 'text/css; charset=utf-8', css);
        return;
      }

      if (isApi) {
        const auth = bearer(req);
        if (!auth) fail(401, 'authentication', 'Identité locale requise.');
        if (path.startsWith('/api/runner/')) {
          if (auth.kind !== 'runner') fail(403, 'scope', 'Accès réservé au runner de confiance.');
          if (method === 'POST' && path === '/api/runner/claim') {
            exactKeys(await body(req, 'json'));
            json(res, 200, { assignment: await core.claim(auth) });
            return;
          }
          const completion = /^\/api\/runner\/attempts\/([^/]+)\/complete$/.exec(path);
          if (method === 'POST' && completion && uuid(completion[1])) {
            const value = await body(req, 'json');
            exactKeys(value, 'generation', 'result');
            if (typeof value.generation !== 'number' || !Number.isSafeInteger(value.generation) ||
                value.generation < 1 || !isObject(value.result)) {
              fail(400, 'parameters', 'Remise invalide.');
            }
            await core.complete(auth, completion[1], value.generation, value.result);
            send(res, 204);
            return;
          }
          fail(404, 'not_found', 'Opération runner indisponible.');
        }
        if (auth.kind !== 'operator') fail(403, 'scope', 'Identité opérateur requise.');
        if (await studioRoute(req,res,url,auth,true)) return;
        if (method === 'GET' && path === '/api/projects') {
          json(res, 200, { projects: await core.listProjects(auth) });
          return;
        }
        const route = /^\/api\/projects\/([^/]+)(?:\/missions(?:\/([^/]+)(\/cancel)?)?)?$/.exec(path);
        if (route) {
          const project = projectId(route[1]);
          const mission = route[2];
          if (method === 'GET' && path === '/api/projects/' + project) {
            json(res, 200, { project: await core.getProject(auth, project) });
            return;
          }
          if (method === 'POST' && path === '/api/projects/' + project + '/missions') {
            const value = await body(req, 'json');
            exactKeys(value, 'fixtureId', 'commandKey');
            if (!isFixtureId(value.fixtureId) || typeof value.commandKey !== 'string' ||
                !/^[A-Za-z0-9_-]{1,80}$/.test(value.commandKey)) {
              fail(400, 'parameters', 'Sélectionnez un jeu de données et une clé de commande valides.');
            }
            json(res, 201, await core.createMission(auth, project, value.fixtureId, value.commandKey));
            return;
          }
          if (method === 'GET' && uuid(mission) && !route[3]) {
            json(res, 200, { mission: await core.getMission(auth, project, mission) });
            return;
          }
          if (method === 'POST' && uuid(mission) && route[3]) {
            await core.cancelMission(auth, project, mission);
            send(res, 204);
            return;
          }
        }
        fail(404, 'not_found', 'Opération indisponible dans la tranche A1.');
      }

      if (method === 'POST' && req.headers.origin !== 'http://' + host) {
        fail(403, 'origin', 'Origine de la requête non autorisée.');
      }
      const session = browserSession(req);
      if (path === '/login' && method === 'POST') {
        const value = await body(req, 'form');
        exactKeys(value, 'token');
        const auth = typeof value.token === 'string' && value.token.length <= 128
          ? identities.get(hash(value.token.trim())) : undefined;
        if (auth?.kind !== 'operator') {
          html(res, 401, loginPage('Clé opérateur invalide.'));
          return;
        }
        const now = Date.now();
        for (const [key, entry] of sessions) if (entry.expiresAt <= now) sessions.delete(key);
        if (session) sessions.delete(session.key);
        const token = randomBytes(32).toString('base64url');
        sessions.set(hash(token), {
          actor: { id: auth.id, projectIds: auth.projectIds },
          expiresAt: now + sessionTtlMs,
        });
        res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionTtlMs / 1000}`);
        redirect(res, '/');
        return;
      }
      if (!session) {
        if (method === 'GET') {
          html(res, 200, loginPage());
          return;
        }
        fail(401, 'authentication', 'Identité locale requise.');
      }
      const { actor } = session;
      if (path === '/logout' && method === 'POST') {
        sessions.delete(session.key);
        res.setHeader('Set-Cookie', cookieName + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
        redirect(res, '/');
        return;
      }
      if (await studioRoute(req,res,url,actor,false)) return;
      if (path === '/login' && method === 'GET') {
        const [first] = await core.listProjects(actor);
        if (!first) fail(404, 'not_found', 'Aucun projet accessible.');
        redirect(res, '/projects/' + first.id);
        return;
      }
      const route = /^\/projects\/([^/]+)(?:\/missions(?:\/([^/]+)(\/cancel)?)?)?$/.exec(path);
      if (route) {
        const project = projectId(route[1]);
        const mission = route[2];
        if (method === 'GET' && path === '/projects/' + project) {
          const projects = await core.listProjects(actor);
          const selected = await core.getProject(actor, project);
          html(res, 200, projectPage(projects, selected, randomUUID()));
          return;
        }
        if (method === 'POST' && path === '/projects/' + project + '/missions') {
          const value = await body(req, 'form');
          exactKeys(value, 'fixtureId', 'commandKey');
          if (!isFixtureId(value.fixtureId) || !uuid(value.commandKey)) {
            fail(400, 'parameters', 'Sélectionnez un jeu de données valide.');
          }
          const result = await core.createMission(actor, project, value.fixtureId, value.commandKey);
          redirect(res, '/projects/' + project + '/missions/' + result.id);
          return;
        }
        if (method === 'GET' && uuid(mission) && !route[3]) {
          const projects = await core.listProjects(actor);
          const detail = await core.getMission(actor, project, mission);
          html(res, 200, missionPage(projects, detail));
          return;
        }
        if (method === 'POST' && uuid(mission) && route[3]) {
          const confirmation = await body(req,'form');
          if (confirmation.confirm !== 'yes') fail(400,'confirmation','Confirmez l’annulation de la mission.');
          await core.cancelMission(actor, project, mission);
          redirect(res, '/projects/' + project + '/missions/' + mission);
          return;
        }
      }
      fail(404, 'not_found', 'Page introuvable.');
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      const problem = error instanceof DomainError ? error :
        new DomainError(503, 'unavailable', 'Service local indisponible. Vérifiez le Core et PostgreSQL.');
      if (!(error instanceof DomainError)) console.error('La demande A1 a échoué.', (error as { code?: string }).code ?? 'internal');
      if (isApi) json(res, problem.status, { error: { code: problem.code, message: problem.message } });
      else html(res, problem.status, errorPage(problem.message));
    }
  });
}
