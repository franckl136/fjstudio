import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { DomainError, isProjectId, type JsonObject, type Operator } from './contracts.ts';
import { assertProject, notFound } from './database.ts';
import { changeProfile, createWorkspaceProject, listWorkspaceProjects, profileDetail, requireProjectAdministrator } from './product-workspace-projects.ts';
import { activityWeek, readWorkspace, type DeskIdentity } from './product-workspace.ts';
import type { Repositories } from './repositories.ts';
import { officePage, profilePage, workspacePage } from './product-workspace-views.ts';
import { readActivity,activityPage,activityFilter } from './activity.ts';

interface WorkspaceTools {
  body(req: IncomingMessage, kind:'json'|'form'): Promise<JsonObject>;
  json(res: ServerResponse, status:number, value:unknown): void;
  html(res: ServerResponse, status:number, value:string): void;
  redirect(res: ServerResponse, path:string): void;
  runners?: readonly DeskIdentity[];
  repositories?: Pick<Repositories,'observe'>;
  hasArchives?:boolean;
}
export async function workspaceRoute(pool: Pool, req: IncomingMessage, res: ServerResponse, url: URL,
  actor: Operator, api: boolean, io: WorkspaceTools): Promise<boolean> {
  const path = api ? url.pathname.slice(4) : url.pathname;
  const get = req.method === 'GET';
  if(path==='/activity' && get) {
    const project=url.searchParams.get('project')||undefined;
    if(project) assertProject(actor,project);
    const data=await readActivity(pool,actor,project,activityFilter(url.searchParams));
    if(api) io.json(res,200,data);
    else io.html(res,200,activityPage(data,await listWorkspaceProjects(pool,actor),project,url.searchParams));
    return true;
  }
  if (path === '/workspace/observe' && !api) {
    if(req.method!=='POST') throw new DomainError(405,'method','Méthode indisponible.');
    if(actor.accountRole==='viewer' || !io.repositories) throw new DomainError(403,'read_only','Accès opérateur requis.');
    const fields=await io.body(req,'form');
    const project=fields.project || undefined;
    if(Object.keys(fields).some(k=>k!=='project') || (project!==undefined && !isProjectId(project))) throw notFound();
    if(project) assertProject(actor,project);
    const targets=(await pool.query<{project_id:string}>(`SELECT project_id FROM project_repositories
      WHERE remote_url='' AND project_id=ANY($1::text[]) ORDER BY project_id`,[project?[project]:actor.projectIds])).rows;
    let failures=0;
    for(const target of targets) {
      try { await io.repositories.observe(actor,target.project_id,'local'); }
      catch(error) { if(!(error instanceof DomainError)) throw error; failures++; }
    }
    const params=new URLSearchParams({updated:String(targets.length-failures),unavailable:String(failures)});
    if(project) params.set('project',project);
    io.redirect(res,'/workspace?'+params+'#portefeuille');
    return true;
  }
  if (path === '/workspace' || path === '/office') {
    if (!get) throw new DomainError(405,'method','Méthode indisponible.');
    const project = url.searchParams.get('project') || undefined;
    if (project !== undefined && !isProjectId(project)) throw notFound();
    const data = await readWorkspace(pool,actor,io.runners ?? [],project);
    if (api) {
      io.json(res,200,path === '/office' ? {capturedAt:data.capturedAt,agents:data.agents,cursorSessions:data.cursorSessions} : data);
    } else if (path === '/office') {
      io.html(res,200,officePage(data,url.searchParams,project));
    } else io.html(res,200,workspacePage(data,actor,project,await activityWeek(pool,actor,project),url.searchParams,io.hasArchives));
    return true;
  }
  const match = /^\/projects\/([^/]+)\/settings$/.exec(path);
  if (!match && path !== '/projects/new') return false;
  const id = match?.[1];
  if (id !== undefined && !isProjectId(id)) throw notFound();
  if (id) assertProject(actor,id); else requireProjectAdministrator(actor);
  const canEdit = !('accountRole' in actor) || actor.accountRole !== 'viewer';
  if (get) {
    const data = id ? await profileDetail(pool,actor,id) : undefined;
    if (api) io.json(res,200,data ?? {canCreate:true});
    else io.html(res,200,profilePage(await listWorkspaceProjects(pool,actor),data,canEdit));
  } else if (req.method === 'POST') {
    if (!canEdit) throw new DomainError(403,'project_readonly','Ce compte dispose d’un accès en lecture.');
    const input = await io.body(req,api ? 'json' : 'form');
    const profile = id ? await changeProfile(pool,actor,id,input) : await createWorkspaceProject(pool,actor,input);
    if (api) io.json(res,id ? 200 : 201,{profile});
    else io.redirect(res,'/projects/'+encodeURIComponent(profile.id)+'/settings');
  } else throw new DomainError(405,'method','Méthode indisponible.');
  return true;
}
