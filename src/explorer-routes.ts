import type { IncomingMessage,ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { DomainError,isProjectId,type JsonObject,type Operator } from './contracts.ts';
import { assertProject,notFound } from './database.ts';
import { listWorkspaceProjects } from './product-workspace-projects.ts';
import { layout,e } from './views.ts';
import { sources,readSource,versions,snapshot,importSource,revokeSource } from './explorer-store.ts';
import { connectionChoices,refreshConnection } from './explorer-connections.ts';
import { lastCodeScan,syncLinkedCode,syncProjectCode } from './explorer-code.ts';
import { configure,overview,renderSnapshot } from './explorer-views.ts';
import { differences,schemaSignals } from './explorer-model.ts';

type IO={
  body(req:IncomingMessage,kind:'json'|'form'):Promise<JsonObject>;
  html(res:ServerResponse,status:number,value:string):void; json(res:ServerResponse,status:number,value:unknown):void;
  redirect(res:ServerResponse,path:string):void;
};
export async function databaseRoute(pool:Pool,req:IncomingMessage,res:ServerResponse,url:URL,actor:Operator,api:boolean,io:IO) {
  const path=url.pathname.replace(/^\/api\//,'/'),route=/^(?:\/projects\/([^/]+))?\/database(?:\/(import|capture|revoke|sync))?$/.exec(path);
  if(!route)return false;
  const project=route[1]??null,action=route[2],base=project?'/projects/'+project+'/database':'/database';
  if(project){if(!isProjectId(project))throw notFound();assertProject(actor,project);}
  if(req.method==='POST' && action==='sync'){
    await io.body(req,api?'json':'form');
    const scans=project?[await syncProjectCode(pool,actor,project)]:await syncLinkedCode(pool,actor);
    if(api)io.json(res,200,{scans});else io.redirect(res,base+'#depots');
    return true;
  }
  if(req.method==='POST'&&action&&project){
    const values=await io.body(req,api?'json':'form');
    if(action==='revoke'){
      if(values.confirm!=='revoke')throw new DomainError(400,'schema_confirm','Confirmez la révocation.');
      await revokeSource(pool,actor,project,String(values.source));if(api)io.json(res,200,{revoked:true});else io.redirect(res,base);return true;
    }
    const result=action==='import'?await importSource(pool,actor,project,values):await refreshConnection(pool,actor,project,String(values.environment),String(values.label));
    if(api)io.json(res,201,result);else io.redirect(res,base+'?source='+result.source+'&snapshot='+result.id);
    return true;
  }
  if(req.method!=='GET'||action)throw new DomainError(405,'schema_method','Méthode indisponible.');
  const q=url.searchParams,id=q.get('source');
  // The global landing page remains useful for restricted accounts with project-only access.
  const canSeeInternal=actor.accountRole==='admin',list=project!==null||canSeeInternal?await sources(pool,actor,project):[];
  if(id) {
    const s=await readSource(pool,actor,project,id),h=await snapshot(pool,actor,project,id,q.get('snapshot')??undefined);
    const history=await versions(pool,actor,project,id);
    const prior=q.get('from')?await snapshot(pool,actor,project,id,q.get('from')!):undefined;
    if(api)io.json(res,200,{source:s,snapshot:h,signals:schemaSignals(h.structure),versions:history,changes:prior?differences(prior.structure,h.structure):undefined});
    else {
      const revoke=project&&actor.accountRole==='admin'?`<details class="panel"><summary>Accès à cette source</summary><form method="post" action="${base}/revoke">
        <input type="hidden" name="source" value="${s.id}"><label><input type="checkbox" name="confirm" value="revoke" required> Révoquer les captures et masquer les versions de cette source</label><button>Révoquer la source</button></form></details>`:'';
      io.html(res,200,layout('Database Explorer',`<link rel="stylesheet" href="/database-assets/explorer.css"><header class="heading"><h1>Database Explorer</h1><a href="${base}">Sources</a></header>`+renderSnapshot(base,s,h,history,q,prior)+revoke,await listWorkspaceProjects(pool,actor),project??'',true,'database'));
    }
    return true;
  }
  if(api){io.json(res,200,{sources:list});return true;}
  const projects=await listWorkspaceProjects(pool,actor);
  const area=project?projects.find(p=>p.id===project)?.name:'Studio interne';
  const code=(await pool.query<{project_id:string;id:string;label:string}>(`SELECT project_id,id,label FROM explorer_sources
    WHERE project_id=ANY($1::text[]) AND created_by='studio-code' AND revoked_at IS NULL ORDER BY label`,[project?[project]:actor.projectIds])).rows;
  const rows=projects.filter(p=>!project||p.id===project).map(p=>{
    const scan=lastCodeScan(pool,p.id);
    const links=code.filter(s=>s.project_id===p.id).map(s=>`<a href="/projects/${e(p.id)}/database?source=${s.id}">${e(s.label.replace(/^Code local · /,''))}</a>${scan&&!scan.sources.some(source=>source.id===s.id)?' (version antérieure)':''}`);
    return `<tr><th><a href="/projects/${e(p.id)}/database">${e(p.name)}</a></th><td>${e(scan?.status??(links.length?'Structure disponible':'En attente du relevé'))}</td><td>${links.join(' · ')||'—'}</td></tr>`;
  }).join('');
  const discovery=`<section class="panel" id="depots"><header class="section-head"><h2>Structures du code local</h2>
    ${actor.accountRole==='viewer'?'':'<form method="post" action="'+base+'/sync"><button>Actualiser depuis le code</button></form>'}</header>
    <p>Le Studio relit les schémas SQL et Prisma des dossiers reliés toutes les cinq minutes, y compris les modifications locales. Chaque version conserve l’empreinte de ses fichiers.</p>
    <div class="table-wrap"><table><thead><tr><th>Projet</th><th>Dernier relevé</th><th>Ouvrir la structure</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  const form=project&&actor.accountRole!=='viewer'?configure(base,connectionChoices(actor,project)):'';
  io.html(res,200,layout('Database Explorer',`<header class="heading"><div><h1>Database Explorer</h1><p>${e(area)}</p></div></header>`+
    discovery+(canSeeInternal||project?overview(base,list):'')+form,projects,project??'',true,'database'));
  return true;
}
