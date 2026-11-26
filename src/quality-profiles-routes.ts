import type {IncomingMessage,ServerResponse} from 'node:http';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {DomainError,isProjectId,type JsonObject,type Operator} from './contracts.ts';
import {assertProject,notFound} from './database.ts';
import {listWorkspaceProjects} from './product-workspace-projects.ts';
import {date,e,layout} from './views.ts';
import {controls,presets,profileCatalogue,profileReview,recordProfile,saveProfile,type CheckId} from './quality-profiles.ts';

type IO={body(req:IncomingMessage,kind:'json'|'form'):Promise<JsonObject>;html(res:ServerResponse,status:number,value:string):void;json(res:ServerResponse,status:number,value:unknown):void;redirect(res:ServerResponse,path:string):void};
const status={measured:'Mesuré',failed:'Échec',warning:'Réserve',not_run:'Non exécuté'};
type Data=Awaited<ReturnType<typeof profileCatalogue>>;
type Review=Awaited<ReturnType<typeof profileReview>>;
const option=(value:string,title:string)=>'<option value="'+e(value)+'">'+e(title)+'</option>';
function availability(key:CheckId,d:Data,project:string){
  if(['lint','performance','build'].includes(key))return 'Exécuteur indisponible';
  const html=d.permitted.some(s=>s.entry.endsWith('.html')),ts=d.permitted.some(s=>s.entry.endsWith('.ts'));
  const storedLab=d.lab.length>0;
  if(key==='tests')return project==='a'?'Campagne locale du Studio':'Exécuteur de suite indisponible';
  if(key==='typecheck')return project==='a'||ts||d.lab.some(r=>r.profile==='typescript')?'Compilateur ou campagne disponible':'Source TypeScript autorisée requise';
  if(key==='security')return html||d.schemas.length||d.lab.some(r=>r.profile==='structure'||r.profile==='visual')?'Audit statique disponible':'Source HTML ou schéma requis';
  if(key==='rls'||key==='database')return d.schemas.length?'Photographie disponible':'Photographie du projet requise';
  return d.permitted.length||storedLab?'Inventaire de passage Lab':'Source versionnée du projet requise';
}
function form(base:string,d:Data,project:string,writable:boolean){
  const key=d.chosen.profile,revision=d.chosen.revision;
  const ids=Object.keys(controls) as CheckId[];
  const selection=ids.map(id=>`<li><label>${writable?`<input type="checkbox" name="check-${id}" value="on" ${d.chosen.checks.includes(id)?'checked':''}>`:d.chosen.checks.includes(id)?'✓ ':''}
    ${e(controls[id][0])}</label><small>${e(availability(id,d,project))} · ${e(controls[id][1])}</small></li>`).join('');
  const inputs='<input type="hidden" name="profile" value="'+e(key)+'"><input type="hidden" name="revision" value="'+revision+'">';
  const selected=(id:string,title:string,options:string)=>`<label>${title}<select name="${id}"><option value="">Aucune preuve sélectionnée</option>${options}</select></label>`;
  return `<header class="heading"><h1>Profils de qualification</h1><a href="${base.replace(/\/profiles$/,'')}">Quality Lab</a></header>
    <nav class="actions panel" aria-label="Choisir un profil">${Object.entries(presets).map(([k,p])=>`<a class="button" ${key===k?'aria-current="page"':''} href="${base}?profile=${k}">${e(p.name)}</a>`).join('')}</nav>
    <section class="panel"><h2>${e(presets[key].name)} · catalogue</h2><p>${d.chosen.checks.length} contrôles retenus pour ce projet · ${revision?'version '+revision:'sélection initiale'}.</p>
    ${writable?`<form method="post" action="${base}/save">${inputs}<ul class="work-feed">${selection}</ul><button>Enregistrer la sélection</button></form>`:'<ul class="work-feed">'+selection+'</ul>'}</section>
    ${writable?`<section class="panel"><h2>Établir un bilan à partir de preuves</h2>
    <p>Sélectionnez les passages terminés et la photographie à examiner. Le bilan conserve les références de cette sélection. Un contrôle sans preuve porte une raison de non-exécution.</p>
    <p><a href="${base.replace(/\/profiles$/,'')}">Lancer un passage dans Quality Lab</a> · <a href="/projects/${e(project)}/database">Retrouver les schémas du projet</a></p>
    <form action="${base}/review" method="post">${inputs}<input type="hidden" name="commandKey" value="${randomUUID()}">
    ${selected('lab','Passage Lab du projet',d.lab.map(r=>option(r.id,r.source_key+' · '+r.profile+' · '+r.commit_sha.slice(0,10)+' · '+r.finished_at.toISOString())).join(''))}
    ${project==='a'?selected('campaign','Campagne du Studio',d.campaigns.map(r=>option(r.id,r.commit_sha.slice(0,10)+' · '+r.verdict+' · '+r.finished_at.toISOString())).join('')):''}
    ${selected('schema','Photographie de base de données',d.schemas.map(r=>option(r.id,r.label+' · '+r.environment+' · '+r.captured_at.toISOString())).join(''))}
    <button>Consigner le bilan</button></form></section>`:''}
    <section class="panel"><h2>Bilans du projet</h2>${d.history.length?'<ul class="work-feed">'+d.history.map(r=>'<li><a href="'+base+'/'+r.id+'">'+e(presets[r.profile].name)+' · '+date(r.created_at)+'</a><small>'+e(r.actor)+' · version '+r.revision+'</small></li>').join('')+'</ul>':'<p>Aucun bilan consigné.</p>'}</section>`;
}
function reviewView(base:string,r:Review){
  return `<header class="heading"><h1>Bilan · ${e(presets[r.profile].name)}</h1><a href="${base}?profile=${e(r.profile)}">Profils de qualification</a></header>
    <section class="panel"><h2>Couverture des preuves</h2><p>${r.coverage} contrôles documentés sur ${r.total} retenus · version ${r.revision} · ${e(r.actor)} · ${date(r.created_at)}.</p>
    <ul class="quality-results">${r.observations.map(o=>`<li><strong>${e(controls[o.control][0])} · ${status[o.status]}</strong><p>${e(o.method)} · ${e(o.detail)}</p>
    ${o.proof?`<a href="${e(o.proof)}">Lire la preuve</a> ${o.commit?' · commit <code>'+e(o.commit.slice(0,12))+'</code>':''}
    <small>SHA-256 de la source · <code class="digest">${e(o.digest)}</code></small>`:''}</li>`).join('')}</ul></section>`;
}
export async function qualityProfilesRoute(pool:Pool,req:IncomingMessage,res:ServerResponse,url:URL,actor:Operator,api:boolean,io:IO){
  const path=url.pathname.replace(/^\/api\//,'/'),match=/^\/projects\/([^/]+)\/quality\/profiles(?:\/([^/]+))?$/.exec(path);
  if(!match)return false;const [,project,action]=match;
  if(!isProjectId(project))throw notFound();assertProject(actor,project);
  const base='/projects/'+project+'/quality/profiles';
  if(req.method==='GET'){
    if(action){
      const r=await profileReview(pool,actor,project,action);
      if(api)io.json(res,200,r);else io.html(res,200,layout('Bilan de qualification',reviewView(base,r),await listWorkspaceProjects(pool,actor),project,true,'quality'));
    }else{
      const d=await profileCatalogue(pool,actor,project,url.searchParams.get('profile')??'quick');
      if(api)io.json(res,200,d);else io.html(res,200,layout('Profils de qualification',form(base,d,project,actor.accountRole!=='viewer'),await listWorkspaceProjects(pool,actor),project,true,'quality'));
    }return true;
  }
  if(req.method!=='POST'||!['save','review'].includes(action))throw new DomainError(405,'method','Méthode indisponible.');
  const value=await io.body(req,api?'json':'form'),key=String(value.profile??'');
  const allowed=action==='review'?['profile','revision','commandKey','lab','campaign','schema']:
    ['profile','revision',...(api?['checks']:Object.keys(controls).map(c=>'check-'+c))];
  if(Object.keys(value).some(k=>!allowed.includes(k)))throw new DomainError(400,'quality_field','Champ de profil inconnu.');
  if(action==='save'){
    const selected=api?value.checks:Object.keys(value).filter(k=>k.startsWith('check-')&&value[k]==='on').map(k=>k.slice(6));
    const chosen=await saveProfile(pool,actor,project,key,selected,value.revision);
    if(api)io.json(res,200,chosen);else io.redirect(res,base+'?profile='+key);
  }else{
    const id=await recordProfile(pool,actor,project,key,value);
    if(api)io.json(res,201,{id});else io.redirect(res,base+'/'+id);
  }return true;
}
