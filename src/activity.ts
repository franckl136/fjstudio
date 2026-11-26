import type { Pool, PoolClient } from 'pg';
import { DomainError, type Operator } from './contracts.ts';
import { assertProject } from './database.ts';
import { date,e,layout,orderedProjects } from './views.ts';

const families={mission:'Missions',decision:'Décisions Git',knowledge:'Connaissances',quality:'Qualifications',
  git:'Observations Git',settings:'Profils et règles',schema:'Schémas',backup:'Sauvegardes'};
type Family=keyof typeof families;
type Activity={project_id:string|null; at:Date; subject:string; kind:string; family:Family; href:string; actor:string|null; source:string};
export function activityFilter(params:URLSearchParams) {
  const family=params.get('type')||'',days=params.get('days')||'30',page=params.get('page')||'1';
  if((family&&!Object.hasOwn(families,family))||!['1','7','30','90'].includes(days)||!/^([1-9]\d{0,2})$/.test(page))
    throw new DomainError(400,'activity_filter','Filtre de journal invalide.');
  return {family,days:Number(days),page:Number(page)};
}
const journal = `WITH journal AS (
    SELECT e.project_id,e.at,m.objective AS subject,e.event_type AS kind,'mission' AS family,
      '/projects/'||e.project_id||'/control/'||m.id AS href,e.actor,'Control Room' AS source,'c'||e.id AS key
      FROM control_events e JOIN control_missions m ON (m.project_id,m.id)=(e.project_id,e.mission_id) WHERE e.project_id=ANY($1)
    UNION ALL SELECT project_id,at,'Mission A1',type,'mission','/projects/'||project_id||'/missions/'||mission_id,
      coalesce(details->>'operatorId',details->>'runnerId'),'A1','a'||id FROM mission_events WHERE project_id=ANY($1)
    UNION ALL SELECT project_id,at,profile->>'name','project_edited','settings','/projects/'||project_id||'/settings',
      actor,'Historique du profil','p'||project_id||revision FROM project_profile_history WHERE project_id=ANY($1)
    UNION ALL SELECT project_id,at,title,'knowledge_'||status,'knowledge','/projects/'||project_id||'/knowledge/'||knowledge_id||'#v'||version,
      actor,'Révisions des fiches','k'||knowledge_id||version FROM knowledge_revisions WHERE project_id=ANY($1)
    UNION ALL SELECT project_id,coalesce(finished_at,created_at),profile,coalesce(verdict,'lab_'||state),'quality','/projects/'||project_id||'/quality/'||id,
      actor_id,'Quality Lab','l'||id FROM product_lab_runs WHERE project_id=ANY($1)
    UNION ALL SELECT o.project_id,o.observed_at,coalesce(o.branch,'HEAD')||' · '||left(o.local_commit,9),'git_observed','git','/projects/'||o.project_id||'/repository?observation='||o.id,
      o.observed_by,'Relevé du dépôt','g'||o.id FROM repository_observations o WHERE o.project_id=ANY($1)
    UNION ALL SELECT r.project_id,d.at,r.branch,d.decision,'decision','/projects/'||r.project_id||'/review/'||r.id,
      d.actor,'Revue Git','d'||r.id||d.actor FROM product_git_reviews r JOIN product_git_decisions d ON d.review_id=r.id WHERE r.project_id=ANY($1)
    UNION ALL SELECT project_id,finished_at,left(commit_sha,9),verdict,'quality','/projects/'||project_id||'/quality/campaigns/'||id,
      NULL,'Campagne Studio','q'||id FROM product_campaigns WHERE project_id=ANY($1)
    UNION ALL SELECT project_id,created_at,profile,'profile_review','quality','/projects/'||project_id||'/quality/profiles/'||id,
      actor,'Bilan de qualification','pr'||id FROM quality_profile_reviews WHERE project_id=ANY($1)
    UNION ALL SELECT s.project_id,h.captured_at,s.label||' · '||s.environment,'schema_snapshot','schema',
      '/projects/'||s.project_id||'/database?source='||s.id||'&snapshot='||h.id,h.actor,'Database Explorer','s'||h.id
      FROM explorer_snapshots h JOIN explorer_sources s ON s.id=h.source_id WHERE s.project_id=ANY($1) AND s.revoked_at IS NULL
    UNION ALL SELECT project_id,updated_at,source_key||' · '||profile,mode,'settings','/projects/'||project_id||'/quality',
      updated_by,'Version courante de la règle Lab','r'||project_id||'/'||source_key||'/'||profile FROM product_lab_rules WHERE project_id=ANY($1)
    UNION ALL SELECT NULL,performed_at,'Contrôle de sauvegarde',outcome,'backup','/activity?type=backup',
      NULL,'Journal de maintenance','b'||id FROM studio_backup_checks WHERE $2
  )`;

export async function latestProjectActivity(db:PoolClient,ids:readonly string[]) {
  return (await db.query<{project_id:string;at:Date}>(journal+
    ' SELECT project_id,max(at) AS at FROM journal WHERE project_id IS NOT NULL GROUP BY project_id',[ids,false])).rows;
}

export async function readActivity(db:Pool|PoolClient,actor:Operator,project:string|undefined,filter=activityFilter(new URLSearchParams()),limit=40) {
  if(project) assertProject(actor,project);
  const admin=actor.accountRole==='admin'&&!project;
  const events=await db.query<Activity>(journal+` SELECT project_id,at,subject,kind,family,href,actor,source FROM journal
    WHERE ($3='' OR family=$3) AND at>=now()-make_interval(days=>$4)
    ORDER BY at DESC,key DESC LIMIT $5 OFFSET $6`,[project?[project]:actor.projectIds,admin,filter.family,filter.days,limit+1,(filter.page-1)*limit]);
  return {events:events.rows.slice(0,limit),more:events.rowCount!>limit};
}
export function activityPage(data:Awaited<ReturnType<typeof readActivity>>,projects:{id:string;name:string}[],project:string|undefined,query:URLSearchParams) {
  const f=activityFilter(query);
  const options=(items:[string,string][],value:string)=>items.map(([v,s])=>`<option value="${e(v)}"${v===value?' selected':''}>${e(s)}</option>`).join('');
  function page(n:number){const url=new URLSearchParams(query);url.set('page',String(n));return '/activity?'+e(url.toString());}
  return layout('Journal du Studio',`<header class="heading"><div><h1>Journal du Studio</h1><p>Les événements consignés, avec leur origine et leur contexte.</p></div></header>
  <form class="panel filters"><label>Projet<select name="project"><option value="">Tous mes projets</option>${options(orderedProjects(projects).map(p=>[p.id,p.name]),project??'')}</select></label>
  <label>Événement<select name="type"><option value="">Tous les types</option>${options(Object.entries(families),f.family)}</select></label>
  <label>Période<select name="days">${options(['1','7','30','90'].map(s=>[s,s+' jour'+(s==='1'?'':'s')]),String(f.days))}</select></label><button>Appliquer</button></form>
  <section class="panel"><h2>Activité enregistrée</h2>${data.events.length?`<ol class="event-feed">${data.events.map(v=>`<li><a href="${e(v.href)}">${e(v.subject)}</a><small>${e(v.source)} · ${e(v.kind)} · ${date(v.at)} · ${e(projects.find(p=>p.id===v.project_id)?.name??'Studio')}${v.actor?' · '+e(v.actor):''}</small></li>`).join('')}</ol>`:'<p>Aucun événement sur cette période et ce périmètre.</p>'}
  <nav class="actions">${f.page>1?`<a href="${page(f.page-1)}">Page précédente</a>`:''}${data.more&&f.page<999?`<a href="${page(f.page+1)}">Page suivante</a>`:''}</nav></section>`,projects,project,true,'activity');
}
