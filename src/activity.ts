import type { Pool, PoolClient } from 'pg';
import { DomainError, type Operator } from './contracts.ts';
import { assertProject } from './database.ts';
import { labSampleKeys } from './product-lab-source.ts';
import { date,e,eventLabels,layout,orderedProjects } from './views.ts';

const families={mission:'Missions',decision:'Décisions Git',knowledge:'Connaissances',quality:'Qualifications',
  git:'Observations Git',settings:'Profils et règles',schema:'Schémas',backup:'Sauvegardes'};
type Family=keyof typeof families;
type Activity={project_id:string|null; at:Date; subject:string; kind:string; family:Family; href:string; actor:string|null; source:string;
  metadata:Record<string,string|number|null>};
export function activityFilter(params:URLSearchParams) {
  const family=params.get('type')||'',days=params.get('days')||'30',page=params.get('page')||'1';
  if((family&&!Object.hasOwn(families,family))||!['1','7','30','90'].includes(days)||!/^([1-9]\d{0,8})$/.test(page))
    throw new DomainError(400,'activity_filter','Filtre de journal invalide.');
  return {family,days:Number(days),page:Number(page)};
}
const journal = `WITH journal AS (
    SELECT e.project_id,e.at,m.objective AS subject,e.event_type AS kind,'mission' AS family,
      '/projects/'||e.project_id||'/control/'||m.id AS href,e.actor,'Control Room' AS source,'c'||e.id AS key,
      jsonb_build_object('Événement',e.id::text,'Mission',m.id,'Tentative',e.details->>'attemptId','Branche',e.details#>>'{repositoryObservation,branch}',
        'Commit Git',e.details#>>'{repositoryObservation,commit}','SHA-256',coalesce(e.details->>'sha256',e.details->>'digest',e.details->>'sourceSha256',e.details->>'responseSha256')) AS metadata
      FROM control_events e JOIN control_missions m ON (m.project_id,m.id)=(e.project_id,e.mission_id) WHERE e.project_id=ANY($1)
    UNION ALL SELECT project_id,at,'Mission A1',type,'mission','/projects/'||project_id||'/missions/'||mission_id,
      coalesce(details->>'operatorId',details->>'runnerId'),'A1 · Cas synthétique','a'||id,
      jsonb_build_object('Événement',id::text,'Mission',mission_id,'Tentative',details->>'attemptId','SHA-256',details->>'digest') FROM mission_events WHERE project_id=ANY($1)
    UNION ALL SELECT project_id,at,profile->>'name','project_edited','settings','/projects/'||project_id||'/settings',
      actor,'Historique du profil','p'||project_id||revision,jsonb_build_object('Révision',revision) FROM project_profile_history WHERE project_id=ANY($1)
    UNION ALL SELECT project_id,at,title,'knowledge_'||status,'knowledge','/projects/'||project_id||'/knowledge/'||knowledge_id||'#v'||version,
      actor,'Révisions des fiches','k'||knowledge_id||version,jsonb_build_object('Fiche',knowledge_id,'Version',version) FROM knowledge_revisions WHERE project_id=ANY($1)
    UNION ALL SELECT project_id,coalesce(finished_at,created_at),profile,coalesce(verdict,'lab_'||state),'quality','/projects/'||project_id||'/quality/'||id,
      actor_id,CASE WHEN source_key=ANY($3::text[]) THEN 'Quality Lab · Exemple synthétique du Studio'
                    ELSE 'Quality Lab · Source autorisée du projet' END,'l'||id,
      jsonb_build_object('Passage',id,'Profil',profile,'Source',source_key,'Fichier',entry_path,'Commit Git',commit_sha,'SHA-256 de la source',source_digest,'SHA-256 du résultat',result_sha) FROM product_lab_runs WHERE project_id=ANY($1)
    UNION ALL SELECT o.project_id,o.observed_at,o.repository_key,'git_observed','git','/projects/'||o.project_id||'/repository?observation='||o.id,
      o.observed_by,'Relevé du dépôt','g'||o.id,jsonb_build_object('Relevé',o.id,'Dépôt',o.repository_key,'Branche',coalesce(o.branch,'HEAD détachée'),'Commit Git',o.local_commit)
      FROM repository_observations o WHERE o.project_id=ANY($1)
    UNION ALL SELECT r.project_id,d.at,r.branch,d.decision,'decision','/projects/'||r.project_id||'/review/'||r.id,
      d.actor,'Revue Git','d'||r.id||d.actor,jsonb_build_object('Revue',r.id,'Branche',r.branch,'Commit Git',r.head_sha,'SHA-256 de la revue',r.digest)
      FROM product_git_reviews r JOIN product_git_decisions d ON d.review_id=r.id WHERE r.project_id=ANY($1)
    UNION ALL SELECT project_id,finished_at,left(commit_sha,9),verdict,'quality','/projects/'||project_id||'/quality/campaigns/'||id,
      NULL,'Campagne Studio','q'||id,jsonb_build_object('Campagne',id,'Commit Git',commit_sha,'SHA-256 du rapport',report_sha) FROM product_campaigns WHERE project_id=ANY($1)
    UNION ALL SELECT project_id,created_at,profile,'profile_review','quality','/projects/'||project_id||'/quality/profiles/'||id,
      actor,'Bilan de qualification','pr'||id,jsonb_build_object('Bilan',id,'Profil',profile,'Révision',revision) FROM quality_profile_reviews WHERE project_id=ANY($1)
    UNION ALL SELECT s.project_id,h.captured_at,s.label||' · '||s.environment,'schema_snapshot','schema',
      '/projects/'||s.project_id||'/database?source='||s.id||'&snapshot='||h.id,h.actor,'Database Explorer','s'||h.id,
      jsonb_build_object('Photographie',h.id,'Source',s.id,'SHA-256',h.digest)
      FROM explorer_snapshots h JOIN explorer_sources s ON s.id=h.source_id WHERE s.project_id=ANY($1) AND s.revoked_at IS NULL
    UNION ALL SELECT project_id,updated_at,source_key||' · '||profile,mode,'settings','/projects/'||project_id||'/quality',
      updated_by,'Version courante de la règle Lab','r'||project_id||'/'||source_key||'/'||profile,jsonb_build_object('Source',source_key,'Profil',profile) FROM product_lab_rules WHERE project_id=ANY($1)
    UNION ALL SELECT NULL,performed_at,'Contrôle de sauvegarde',outcome,'backup','/activity?type=backup',
      NULL,'Journal de maintenance','b'||id,jsonb_build_object('Contrôle',id,'SHA-256',sha256,'Octets',bytes::text) FROM studio_backup_checks WHERE $2
  )`;

export async function latestProjectActivity(db:PoolClient,ids:readonly string[]) {
  return (await db.query<{project_id:string;at:Date}>(journal+
    ' SELECT project_id,max(at) AS at FROM journal WHERE project_id IS NOT NULL GROUP BY project_id',[ids,false,labSampleKeys])).rows;
}

const pageSize = 10;

export async function readActivity(db:Pool|PoolClient,actor:Operator,project:string|undefined,filter=activityFilter(new URLSearchParams())) {
  if(project) assertProject(actor,project);
  // Totals, the effective page and its rows all use the same database snapshot.
  type PageRow = Activity & {key:string|null;total:number;page:number;pages:number};
  const result=await db.query<PageRow>(journal+`, filtered AS (
    SELECT * FROM journal WHERE ($4='' OR family=$4) AND at>=now()-make_interval(days=>$5)
  ), counts AS (
    SELECT count(*)::int AS total,ceil(count(*)::numeric/$6)::int AS pages FROM filtered
  ), bounds AS (
    SELECT total,pages,least($7::int,greatest(pages,1)) AS page FROM counts
  )
  SELECT bounds.*,entry.* FROM bounds LEFT JOIN LATERAL (
    SELECT * FROM filtered ORDER BY at DESC,key DESC LIMIT $6 OFFSET ((bounds.page-1)::bigint*$6)
  ) entry ON true ORDER BY entry.at DESC,entry.key DESC`,
  [project?[project]:actor.projectIds,actor.accountRole==='admin'&&!project,labSampleKeys,filter.family,filter.days,pageSize,filter.page]);
  const {total,page,pages}=result.rows[0];
  const events:Activity[]=result.rows.filter(row=>row.key!==null).map(({project_id,at,subject,kind,family,href,actor,source,metadata})=>
    ({project_id,at,subject,kind,family,href,actor,source,metadata}));
  return {events,total,page,pages,pageSize,more:page<pages};
}

export async function activityPreview(db:PoolClient,actor:Operator,project?:string) {
  if(project)assertProject(actor,project);
  // Keep the latest mission transition for each mission. Attribution and checkpoint
  // events remain available on its detail page and in the chronological journal.
  const result=await db.query<Activity>(journal+`, latest AS (
    SELECT DISTINCT ON (topic) * FROM (
      SELECT journal.*,CASE WHEN family IN ('mission','knowledge','backup') THEN split_part(href,'#',1) ELSE key END AS topic FROM journal
      WHERE at>=now()-interval '30 days'
    ) scoped ORDER BY topic,
      CASE WHEN family='mission' AND kind NOT LIKE 'mission.%' AND left(kind,8)<>'mission_'
        AND kind NOT IN ('attempt_claimed','attempt_expired') THEN 1 ELSE 0 END,
      at DESC,key DESC
  ), ranked AS (
    SELECT latest.*,row_number() OVER (PARTITION BY family ORDER BY at DESC,key DESC) AS family_rank FROM latest
  )
  SELECT project_id,at,subject,kind,family,href,actor,source,metadata FROM ranked WHERE family<>'git' OR family_rank=1 ORDER BY
    CASE WHEN kind IN ('failed','FAIL','NOT QUALIFIED','mission.blocked','mission_failed','mission.failed','changes_requested','mission.needs_approval') THEN 0
         WHEN kind IN ('mission.running','mission.completed','mission_succeeded','attempt_claimed','approved','knowledge_validated','knowledge_proposed','PASS WITH RESERVATIONS') THEN 1
         WHEN family='git' THEN 3 ELSE 2 END,
    at DESC,key DESC LIMIT 5`,[project?[project]:actor.projectIds,actor.accountRole==='admin'&&!project,labSampleKeys]);
  return result.rows;
}

const eventNames: Record<string,string> = {
  ...eventLabels,
  'mission.created':'Mission créée','mission.ready':'Mission prête','mission.running':'Mission en cours',
  'mission.needs_approval':'Mission à approuver','mission.completed':'Mission terminée','mission.blocked':'Mission bloquée',
  'mission.failed':'Mission en échec','mission.cancelled':'Mission annulée','mission.draft':'Mission en préparation',
  'approval.accepted':'Plan approuvé','brief.revised':'Brief révisé','plan.frozen':'Plan enregistré',
  'handoff.exported':'Dossier de mission exporté','handoff.proposed':'Réponse au dossier proposée',
  'attempt.claimed':'Travail attribué','attempt.expired':'Bail expiré','attempt.failed':'Tentative en échec','attempt.interrupted':'Travail interrompu',
  'checkpoint.accepted':'Checkpoint accepté',git_observed:'Relevé Git actualisé',schema_snapshot:'Schéma enregistré',
  project_edited:'Profil du projet modifié',profile_review:'Bilan de qualification enregistré',
  approved:'Changements approuvés',changes_requested:'Modifications demandées',
  knowledge_validated:'Connaissance validée',knowledge_proposed:'Connaissance à valider',
  knowledge_revoked:'Connaissance révoquée',knowledge_rejected:'Connaissance rejetée',knowledge_obsolete:'Connaissance remplacée',
  lab_queued:'Qualification en attente',lab_running:'Qualification en cours',lab_finished:'Qualification terminée',
  'PASS':'Qualification réussie','FAIL':'Qualification en échec','PASS WITH RESERVATIONS':'Qualification avec réserves',
  'NOT QUALIFIED':'Qualification incomplète',verified:'Sauvegarde vérifiée',failed:'Contrôle de sauvegarde en échec',
  'on-change':'Règle sur changement de commit',interval:'Règle périodique',
};

export function activityItem(event:Activity,projects:{id:string;name:string}[]) {
  const project=projects.find(p=>p.id===event.project_id);
  const title=eventNames[event.kind]??families[event.family];
  const scope=project?`<a href="/projects/${e(project.id)}">${e(project.name)}</a>`:'Studio';
  const humanSubject=['mission','knowledge','schema'].includes(event.family)||event.kind==='project_edited';
  const fields={Auteur:event.actor,...event.metadata};
  const facts=Object.entries(fields).filter(([,value])=>value!==null && value!=='');
  return `<li><a href="${e(event.href)}"><strong>${e(title)}</strong></a> · ${scope}
    ${humanSubject?`<small>${e(event.subject)}</small>`:''}
    <small>${e(event.source)} · ${date(event.at)}</small>
    ${facts.length?`<details><summary>Détails techniques</summary><dl class="facts journal-facts">${facts.map(([name,value])=>`<dt>${e(name)}</dt><dd>${e(value)}</dd>`).join('')}</dl></details>`:''}</li>`;
}

type JournalPage = Awaited<ReturnType<typeof readActivity>>;
function pageNavigation(data:JournalPage,query:URLSearchParams,position:string){
  const links=[['Première',1],['Précédente',data.page-1],['Suivante',data.page+1],['Dernière',data.pages]] as const;
  return `<nav class="journal-pages" aria-label="Pagination en ${position} de liste">${links.map(([label,n])=>{
    if(n===data.page||n<1||n>data.pages)return '<span aria-disabled="true">'+label+'</span>';
    const params=new URLSearchParams(query);params.set('page',String(n));
    return `<a href="/activity?${e(params.toString())}#journal-resultats">${label}</a>`;
  }).join('')}</nav>`;
}

export function activityResults(data:JournalPage,projects:{id:string;name:string}[],query:URLSearchParams) {
  const first=(data.page-1)*data.pageSize+1,last=first+data.events.length-1;
  const range=data.total?`Résultats ${first} à ${last} sur ${data.total} · Page ${data.page} sur ${data.pages}`:'0 résultat';
  return `<section class="panel journal-results" id="journal-resultats" tabindex="-1" aria-labelledby="journal-count">
    <h2 id="journal-count">${range}</h2>${pageNavigation(data,query,'haut')}
    ${data.total?`<ol class="event-feed" start="${first}">${data.events.map(v=>activityItem(v,projects)).join('')}</ol>`:'<p>Aucun événement sur cette période et ce périmètre.</p>'}
    ${data.pages>1?pageNavigation(data,query,'bas'):''}</section>`;
}

export function activityPage(data:JournalPage,projects:{id:string;name:string}[],project:string|undefined,query:URLSearchParams) {
  const f=activityFilter(query);
  const options=(items:[string,string][],value:string)=>items.map(([v,s])=>`<option value="${e(v)}"${v===value?' selected':''}>${e(s)}</option>`).join('');
  const scope=projects.find(p=>p.id===project)?.name??'Tous les projets autorisés';
  return layout('Journal du Studio',`<link rel="stylesheet" href="/activity-assets/journal.css">
  <script defer src="/activity-assets/journal.js"></script>
  <header class="heading"><div><h1>Journal du Studio</h1><p>${e(scope)} · ${f.days} jour${f.days===1?'':'s'}</p></div></header>
  <form class="panel filters journal-filters" action="/activity" method="get">
  <label>Projet<select name="project"><option value="">Tous mes projets</option>${options(orderedProjects(projects).map(p=>[p.id,p.name]),project??'')}</select></label>
  <label>Événement<select name="type"><option value="">Tous les types</option>${options(Object.entries(families),f.family)}</select></label>
  <label>Période<select name="days">${options(['1','7','30','90'].map(s=>[s,s+' jour'+(s==='1'?'':'s')]),String(f.days))}</select></label><button>Appliquer</button></form>
  ${activityResults(data,projects,query)}`,projects,project,true,'activity');
}
