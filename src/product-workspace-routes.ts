import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { DomainError, isProjectId, type JsonObject, type Operator } from './contracts.ts';
import { assertProject, notFound } from './database.ts';
import { changeProfile, createWorkspaceProject, listWorkspaceProjects, profileDetail, requireProjectAdministrator } from './product-workspace-projects.ts';
import { readWorkspace, type DeskIdentity } from './product-workspace.ts';
import { officePage, profilePage, workspacePage } from './product-workspace-views.ts';

interface WorkspaceTools {
  body(req: IncomingMessage, kind:'json'|'form'): Promise<JsonObject>;
  json(res: ServerResponse, status:number, value:unknown): void;
  html(res: ServerResponse, status:number, value:string): void;
  redirect(res: ServerResponse, path:string): void;
  runners?: readonly DeskIdentity[];
}
export async function workspaceRoute(pool: Pool, req: IncomingMessage, res: ServerResponse, url: URL,
  actor: Operator, api: boolean, io: WorkspaceTools): Promise<boolean> {
  const path = api ? url.pathname.slice(4) : url.pathname;
  const get = req.method === 'GET';
  if (path === '/workspace' || path === '/office') {
    if (!get) throw new DomainError(405,'method','Méthode indisponible.');
    const project = url.searchParams.get('project') || undefined;
    if (project !== undefined && !isProjectId(project)) throw notFound();
    const data = await readWorkspace(pool,actor,io.runners ?? [],project);
    if (api) {
      io.json(res,200,path === '/office' ? {capturedAt:data.capturedAt,agents:data.agents} : data);
    } else if (path === '/office') {
      if (url.searchParams.get('follow') === '1' && data.agents.some(a => a.running > 0)) res.setHeader('Refresh','12');
      io.html(res,200,officePage(data,url.searchParams,project));
    } else io.html(res,200,workspacePage(data,actor,project));
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
