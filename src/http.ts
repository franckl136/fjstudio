import { navigationRequest } from './project-navigation.ts';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { productReviewRoute } from './product-review-routes.ts';
import { academyRoute } from './academy-routes.ts';
import { databaseRoute } from './explorer-routes.ts';
import { attachEvidence } from './knowledge-evidence.ts';
import { cursorPulls } from './cursor-sessions.ts';
import { productCampaignRoute } from './product-campaign-routes.ts';
import { productHandoffRoute } from './product-handoff-routes.ts';
import { documentPlan, controlAdapters } from './control-room-adapters.ts';
import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Core } from './core.ts';
import type { Credential, JsonObject, Operator, ProjectId } from './contracts.ts';
import { DomainError, isFixtureId, isObject, isProjectId } from './contracts.ts';
import { projectStack } from './project-stack.ts';
import { projectFollow } from './project-follow.ts';
import { loginPage, projectPage, missionPage, errorPage,layout,e,orderedProjects } from './views.ts';

import { HumanAccess, identityKey } from './product-auth.ts';
import { cookie, humanCookie, humanLogin, humanRoute } from './product-auth-routes.ts';
import { workspaceRoute } from './product-workspace-routes.ts';
import { projectTeamBrief } from './project-team-brief.ts';
import { controlRoomRoute,controlRunnerRoute } from './control-room-routes.ts';
import { productLabRoute } from './product-lab-routes.ts';
import { visibleAgents } from './agents.ts';
import { qualityProfilesRoute } from './quality-profiles-routes.ts';
import { projectOperationsRoute } from './project-operations-routes.ts';
import { repositoryRoute } from './repository-routes.ts';
import { handleAppLabRoute } from './app-lab-routes.ts';
import { agentPage, commandPage, knowledgePage, knowledgeDetail } from './studio-views.ts';
import { missionQuality } from './quality.ts';

const css = readFileSync(new URL('./style.css', import.meta.url));
const officeAssets = new Map(['work-room.png','review-room.png','maker.png','reviewer.png','live.js'].map(name =>
  ['/office-assets/'+name, { type:name.endsWith('.webp')?'image/webp':name.endsWith('.png')?'image/png':'text/javascript; charset=utf-8',
    bytes:readFileSync(new URL('./office/'+name,import.meta.url)) }]));
const cookieName = 'a1_operator';
const moduleFiles:Record<string,[string,string]>={
  '/control-assets/brief.js':['control-brief.js','text/javascript; charset=utf-8'],
  '/database-assets/erd.js':['explorer/erd.js','text/javascript; charset=utf-8'],
  '/database-assets/explorer.css':['explorer/explorer.css','text/css; charset=utf-8'],
  '/office-assets/pixel-office.js':['office/pixel-office.js','text/javascript; charset=utf-8'],
  '/office-assets/pixel-office.css':['office/pixel-office.css','text/css; charset=utf-8'],
  '/office-assets/loft-walls.webp':['office/loft-walls.webp','image/webp'],
  '/office-assets/pixel-atlas.webp':['office/pixel-atlas.webp','image/webp'],
  '/academy.css':['academy.css','text/css; charset=utf-8'],
};
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

export function createServer(core: Core, credentials: readonly Credential[], humanKey: Buffer | undefined = process.env.STUDIO_HUMAN_AUTH === '1' ? identityKey() : undefined, localAdminPasswordOnly=process.env.STUDIO_LOCAL_ADMIN_PASSWORD_ONLY==='1',archives:readonly string[]=[]): Server {
  const human = humanKey ? new HumanAccess(core.pool,humanKey,localAdminPasswordOnly) : null;
  const identities = new Map(credentials.map(value => [hash(value.token), value]));
  const teamProjects=new Set(credentials.flatMap(c=>c.kind==='runner' && c.engine==='control'?[c.projectId]:[]));
  const sessions = new Map<string, { actor: Operator; expiresAt: number }>();
  function visibleScope<T extends Operator>(actor:T,path:string):T {
    if(!archives.length || path.replace(/^\/api/,'')==='/workspace/archives') return actor;
    const direct=/^(?:\/api)?\/projects\/([^/]+)/.exec(path)?.[1];
    return {...actor,projectIds:actor.projectIds.filter(id=>!archives.includes(id)||id===direct)};
  }

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

  async function studioRoute(req: IncomingMessage, res: ServerResponse, url: URL, actor: Operator, api: boolean,hasArchives:boolean) {
    if (actor.accountRole === 'viewer' && req.method !== 'GET') fail(403,'read_only','Ce compte dispose d’un accès en lecture.');
    const io = {body,json,html,redirect,hasArchives,repositories:core.repositories,runners:credentials.flatMap(c=>c.kind==='runner'?[{id:c.id,projectId:c.projectId,role:c.role,engine:c.engine}]:[])};
    if(url.pathname.replace(/^\/api/,'')==='/workspace/archives' && req.method==='GET') {
      const allowed=await core.listProjects(actor), archived=allowed.filter(p=>archives.includes(p.id));
      if(api) json(res,200,{projects:archived});
      else html(res,200,layout('Démonstrations archivées',`<header class="heading"><h1>Démonstrations archivées</h1></header>
        <section class="panel"><p>Ces projets conservent les missions et les preuves de recette.</p><ul>${archived.map(p=>`<li><a href="/projects/${e(p.id)}">${e(p.name)}</a></li>`).join('')}</ul>
        <a href="/workspace">Retour au portefeuille</a></section>`,allowed.filter(p=>!archives.includes(p.id)),'',true));
      return true;
    }
    if (!api && url.pathname==='/' && req.method==='GET') { redirect(res,'/workspace'); return true; }
    const teamPath=!api && /^\/projects\/([a-z][a-z0-9-]*)\/team-brief$/.exec(url.pathname);
    if(teamPath && req.method==='POST') {
      const project=teamPath[1];
      if(!teamProjects.has(project)) fail(404,'project','Équipe introuvable.');
      const input=await body(req,'form');
      exactKeys(input,'commandKey','observation','kind');
      const result=await projectTeamBrief(core.pool,actor,project,String(input.observation),String(input.kind),String(input.commandKey));
      redirect(res,'/projects/'+project+'/control/'+result.id);return true;
    }
    if (await workspaceRoute(core.pool,req,res,url,actor,api,io)) return true;
    if (await academyRoute(core.pool,req,res,url,actor,api,io)) return true;
    if (await databaseRoute(core.pool,req,res,url,actor,api,io)) return true;
    if (await projectOperationsRoute(core.pool,req,res,url,actor,api,io)) return true;
    if (await productReviewRoute(core.pool,req,res,url,actor,api,io)) return true;
    if (await productHandoffRoute(core.pool,req,res,url,actor,api,io)) return true;
    if (await controlRoomRoute(core.pool,req,res,url,actor,api,io)) return true;
    if (await productCampaignRoute(core.pool,req,res,url,actor,api,io)) return true;
    if (await qualityProfilesRoute(core.pool,req,res,url,actor,api,io)) return true;
    if (await productLabRoute(core.pool,req,res,url,actor,api,io)) return true;
    if (await repositoryRoute(core,req,res,url,actor,api,body)) return true;
    if (await handleAppLabRoute(core,req,res,url,actor,api,{body,json,html,redirect})) return true;
    const path = api ? url.pathname.slice(4) : url.pathname;
    const evidence=/^\/projects\/([a-z][a-z0-9-]*)\/knowledge\/([a-f0-9-]{36})\/evidence$/.exec(path);
    if(evidence && req.method==='POST') {
      const input=await body(req,api?'json':'form');
      exactKeys(input,'version','selection');
      await attachEvidence(core.pool,actor,evidence[1],evidence[2],Number(input.version),String(input.selection));
      if(api)json(res,200,{linked:true});else redirect(res,path.slice(0,-9));
      return true;
    }
    if (path === '/agents' && req.method === 'GET') {
      const activity = await core.agentActivity(actor);
      const agents = visibleAgents(credentials,actor).map(agent => ({
        ...agent, activity: activity.find(r=>r.runner_id===agent.id && r.project_id===agent.project && r.role===agent.role) ?? null,
      }));
      if (api) json(res,200,{agents,adapters:documentPlan.map(task=>({
        id:controlAdapters[task.key].id,capability:task.capability,role:task.role,dependencies:task.dependencies,
        runtime:'local',externalCostCents:0
      }))});
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
        else html(res,200,knowledgePage(await core.listProjects(actor),project,items,filters,actor.accountRole!=='viewer'));
      } else if (get && uuid(id)) {
        const data = await core.knowledge.detail(actor,project,id);
        if (api) json(res,200,data);
        else html(res,200,knowledgeDetail(await core.listProjects(actor),data,actor.accountRole!=='viewer'));
      } else if (post) {
        const input = await body(req,api?'json':'form');
        let result: {id:string};
        if (id==='import') {
          exactKeys(input,...(Object.hasOwn(input,'document')?['document']:[]));
          result=await core.knowledge.importDocument(actor,project,input.document);
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

  return createHttpServer({ requestTimeout: 10_000 }, (req, res) => navigationRequest.run(req.url ?? '/', async () => {
    const correlation = randomUUID();
    res.setHeader('X-Request-Id', correlation);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const isApi = req.url?.startsWith('/api/') ?? false;
    try {
      const host = localAuthority(req);
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) fail(400, 'url', 'Adresse invalide.');
      const url = new URL(req.url, 'http://' + host);
      const path = url.pathname;
      const method = req.method;
      const officeAsset=officeAssets.get(path);
      if (officeAsset && method==='GET') { send(res,200,officeAsset.type,officeAsset.bytes);return; }
      if(method==='GET' && Object.hasOwn(moduleFiles,path)) {
        const [file,mime]=moduleFiles[path];
        send(res,200,mime,readFileSync(new URL('./'+file,import.meta.url)));return;
      }
      if(method==='GET' && /^(?:\/database|\/projects\/[a-z0-9-]+\/(?:database|control))$/.test(path)) {
        res.setHeader('Content-Security-Policy',res.getHeader('Content-Security-Policy')+"; script-src 'self'");
      }
      if (path==='/office' && method==='GET') {
        res.setHeader('Content-Security-Policy',res.getHeader('Content-Security-Policy')+"; script-src 'self'; connect-src 'self'");
      }
      if (path === '/style.css' && method === 'GET') {
        send(res, 200, 'text/css; charset=utf-8', css);
        return;
      }

      if (isApi) {
        let auth = bearer(req);
        if (human && auth?.kind === 'operator') auth = undefined;
        if (human && !auth && !path.startsWith('/api/runner/')) {
          const actor = await human.actor(cookie(req,humanCookie));
          if (actor) {
            if (method !== 'GET' && req.headers.origin !== 'http://'+host) fail(403,'origin','Origine non autorisée.');
            auth = {...actor,token:'',kind:'operator'};
          }
        }
        if (!auth) fail(401, 'authentication', 'Identité locale requise.');
        if (path.startsWith('/api/runner/')) {
          if (auth.kind !== 'runner') fail(403, 'scope', 'Accès réservé au runner de confiance.');
          if (await controlRunnerRoute(core.pool,req,res,url,auth,{body,json})) return;
          if(auth.engine==='control') fail(403,'scope','Cette équipe travaille uniquement sur les missions documentaires du projet.');
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
        const hasArchives=auth.projectIds.some(id=>archives.includes(id));
        auth=visibleScope(auth,path);
        if (await studioRoute(req,res,url,auth,true,hasArchives)) return;
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
      const humanActor = human ? await human.actor(cookie(req,humanCookie)) : null;
      if (human && await humanRoute(human,req,res,path,humanActor,credentials,{body,html,redirect})) return;
      const session = human ? (humanActor ? {actor:humanActor,key:''} : null) : browserSession(req);
      if (!human && path === '/login' && method === 'POST') {
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
          if (human?.localAdminPasswordOnly) { redirect(res,'/'); return; }
          html(res, 200, human ? humanLogin() : loginPage());
          return;
        }
        fail(401, 'authentication', 'Identité locale requise.');
      }
      const actor=visibleScope(session.actor,path);
      if (path === '/logout' && method === 'POST') {
        sessions.delete(session.key);
        res.setHeader('Set-Cookie', cookieName + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
        redirect(res, '/');
        return;
      }
      if (await studioRoute(req,res,url,actor,false,session.actor.projectIds.some(id=>archives.includes(id)))) return;
      if (path === '/login' && method === 'GET') {
        const [first] = orderedProjects(await core.listProjects(actor));
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
          html(res, 200, projectPage(projects, selected, randomUUID(),actor.accountRole!=='viewer',await core.repositories.state(actor,project),teamProjects.has(project),await cursorPulls(core.pool,actor,project),await projectStack(core.pool,actor,project),await projectFollow(core.pool,actor,project),Boolean(actor.accountRole)));
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
          html(res, 200, missionPage(projects, detail,actor.accountRole!=='viewer'));
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
      if (!(error instanceof DomainError)) {
        const code=error && typeof error==='object' && 'code' in error ? error.code : undefined;
        console.error(JSON.stringify({event:'request_failed',correlation,code:typeof code==='string' && /^[A-Z0-9]{5}$/.test(code)?code:'internal'}));
      }
      if (isApi) json(res, problem.status, { error: { code: problem.code, message: problem.message } });
      else html(res, problem.status, errorPage(problem.message));
    }
  }));
}
