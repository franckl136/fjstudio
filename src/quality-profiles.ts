import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {DomainError,digestJson,type Operator} from './contracts.ts';
import {assertId,assertProject,notFound,transaction} from './database.ts';
import {detailLab,labProfiles} from './product-lab.ts';
import {isLabSample,labSampleKeys,labSources} from './product-lab-source.ts';
import {listCampaigns,readCampaign} from './product-campaign.ts';
import {snapshot} from './explorer-store.ts';
import {auditSchema} from './schema-quality.ts';

export const controls={
  tests:['Tests','Suite npm du Studio avec compteurs et empreintes des sorties.'],
  typecheck:['Typecheck','Campagne du Studio ou compilation stricte d’une unité TypeScript autorisée.'],
  lint:['Lint','Aucun exécuteur de lint déclaré.'],
  security:['Sécurité','Inspection statique des références HTML ou des fonctions à privilèges du schéma sélectionné.'],
  dependencies:['Dépendances','Inventaire du manifeste package.json au commit du passage Lab.'],
  database:['Base de données','Constats de Quality Lab sur une photographie de Database Explorer.'],
  rls:['RLS','Inspection des états RLS et des policies déclarées, selon les informations de la photographie.'],
  architecture:['Architecture','Inventaire statique des répertoires reconnus au commit du passage Lab.'],
  performance:['Performance','Aucun banc de performance applicatif configuré.'],
  documentation:['Documentation','Présence observée du dossier docs/ dans l’inventaire Git du passage Lab.'],
  build:['Build','Aucun build de projet autorisé dans ce catalogue.'],
} as const;
export type CheckId=keyof typeof controls;
export const presets:{
  [key:string]:{name:string;checks:CheckId[]}
}={
  quick:{name:'Rapide',checks:['typecheck','dependencies']},
  complete:{name:'Complet',checks:Object.keys(controls) as CheckId[]},
  security:{name:'Sécurité',checks:['security','dependencies','rls']},
  database:{name:'Base de données',checks:['database','rls']},
  architecture:{name:'Architecture',checks:['architecture','dependencies','documentation']},
  release:{name:'Avant livraison',checks:['tests','typecheck','lint','security','performance','build']},
};
type Profile={profile:string;checks:CheckId[];revision:number};
type ReviewRow=Profile&{id:string;project_id:string;lab:string|null;campaign:string|null;schema_snapshot:string|null;actor:string;created_at:Date};
export type EvidenceSelection={lab:string|null;campaign:string|null;schema:string|null};
type DB=Pool|PoolClient;
const invalid=(s:string)=>new DomainError(400,'quality_profile',s);
const conflict=()=>new DomainError(409,'quality_revision','Le profil a changé. Rechargez sa sélection.');
const profileKey=(k:string)=>{if(!Object.hasOwn(presets,k))throw notFound();};
function write(actor:Operator,project:string){assertProject(actor,project);if(actor.accountRole==='viewer')throw new DomainError(403,'read_only','Accès en lecture.');}
function revision(v:unknown) {
  if(!/^(?:0|[1-9][0-9]{0,7})$/.test(String(v)))throw invalid('Révision de profil invalide.');
  return Number(v);
}
function checks(v:unknown):CheckId[] {
  if(!Array.isArray(v)||!v.length||v.length>11||v.some(k=>typeof k!=='string'||!Object.hasOwn(controls,k))||new Set(v).size!==v.length)throw invalid('Choisissez au moins un contrôle valide.');
  return (Object.keys(controls) as CheckId[]).filter(k=>v.includes(k));
}
async function config(c:DB,project:string,key:string):Promise<Profile>{
  const custom=(await c.query<Profile>('SELECT profile,checks,revision FROM quality_profile_settings WHERE project_id=$1 AND profile=$2',[project,key])).rows[0];
  return custom??{profile:key,checks:[...presets[key].checks],revision:0};
}
export async function saveProfile(pool:Pool,actor:Operator,project:string,key:string,selected:unknown,expected:unknown) {
  write(actor,project);profileKey(key);const next=checks(selected),version=revision(expected);
  return transaction(pool,async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[project,'quality-profile-'+key]);
    const current=await config(c,project,key);
    if(checks(current.checks).join()===next.join())return current;
    if(current.revision!==version)throw conflict();
    return (await c.query<Profile>(`INSERT INTO quality_profile_settings(project_id,profile,checks,revision,updated_by) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(project_id,profile) DO UPDATE SET checks=excluded.checks,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now()
      RETURNING profile,checks,revision`,[project,key,next,version+1,actor.id])).rows[0];
  });
}
export async function profileCatalogue(pool:Pool,actor:Operator,project:string,key:string){
  assertProject(actor,project);profileKey(key);
  const [chosen,lab,schemas,campaigns,history]=await Promise.all([
    config(pool,project,key),
    pool.query<{id:string;source_key:string;profile:keyof typeof labProfiles;commit_sha:string;finished_at:Date}>(
      "SELECT id,source_key,profile,commit_sha,finished_at FROM product_lab_runs WHERE project_id=$1 AND state='finished' AND source_key <> ALL($2::text[]) ORDER BY finished_at DESC,id LIMIT 80",[project,labSampleKeys]),
    pool.query<{id:string;label:string;environment:string;captured_at:Date}>(`SELECT h.id,s.label,s.environment,h.captured_at FROM explorer_snapshots h JOIN explorer_sources s ON s.id=h.source_id
      WHERE s.project_id=$1 AND s.revoked_at IS NULL ORDER BY h.captured_at DESC,h.id LIMIT 100`,[project]),
    project==='a'?listCampaigns(pool,actor,project):[],
    pool.query<Pick<ReviewRow,'id'|'profile'|'actor'|'created_at'|'revision'>>('SELECT id,profile,revision,actor,created_at FROM quality_profile_reviews WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 60',[project]),
  ]);
  const permitted=labSources(project).filter(s=>!isLabSample(s.key)).map(s=>({source:s.key,entry:s.entry}));
  return {chosen,presets,controls,permitted,lab:lab.rows,schemas:schemas.rows,campaigns,history:history.rows};
}
function optionalId(v:unknown){
  if(v===null||v===undefined||v==='')return null;
  if(typeof v!=='string')throw invalid('Identifiant de preuve invalide.');assertId(v);return v;
}
type Evidence={lab:Awaited<ReturnType<typeof detailLab>>|null;campaign:Awaited<ReturnType<typeof readCampaign>>|null;schema:Awaited<ReturnType<typeof snapshot>>|null};
async function evidence(pool:Pool,actor:Operator,project:string,ref:EvidenceSelection,requireCurrent:boolean):Promise<Evidence>{
  const lab=ref.lab?await detailLab(pool,actor,project,ref.lab):null;
  if(lab&&(lab.state!=='finished'||!lab.result||isLabSample(lab.source_key)))throw invalid('Choisissez un passage terminé sur une source du projet.');
  if(lab?.result&&(lab.result.commit!==lab.commit_sha||lab.result.sourceSha256!==lab.source_digest||lab.result.profileVersion!==lab.profile_version)){
    throw new DomainError(409,'quality_evidence','La révision indexée diffère du rapport de qualification.');
  }
  const campaign=ref.campaign?await readCampaign(pool,actor,project,ref.campaign):null;
  let schema:Evidence['schema']=null;
  if(ref.schema){
    const s=(await pool.query<{id:string}>(`SELECT s.id FROM explorer_sources s JOIN explorer_snapshots h ON h.source_id=s.id
      WHERE h.id=$1 AND s.project_id=$2 AND s.revoked_at IS NULL`,[ref.schema,project])).rows[0];
    if(s){
      try{schema=await snapshot(pool,actor,project,s.id,ref.schema);}
      catch(error){if(requireCurrent||!(error instanceof DomainError)||error.status!==404)throw error;}
    }else if(requireCurrent)throw notFound();
  }
  if(schema && digestJson(schema.structure)!==schema.digest)throw new DomainError(409,'quality_evidence','Empreinte de photographie incohérente.');
  if(lab&&campaign&&lab.commit_sha!==campaign.commit_sha)throw invalid('Les preuves Git sélectionnées doivent viser le même commit.');
  const commit=lab?.commit_sha??campaign?.commit_sha;
  if(commit&&schema&&/^[0-9a-f]{7,40}$/.test(schema.reference)&&!commit.startsWith(schema.reference))throw invalid('La référence Git de la photographie diffère du commit qualifié.');
  return {lab,campaign,schema};
}
export async function recordProfile(pool:Pool,actor:Operator,project:string,key:string,fields:Record<string,unknown>){
  write(actor,project);profileKey(key);const rev=revision(fields.revision),command=String(fields.commandKey);assertId(command);
  const ref={lab:optionalId(fields.lab),campaign:optionalId(fields.campaign),schema:optionalId(fields.schema)};
  const digest=digestJson({key,rev,...ref});
  async function replay(db:DB){
    const previous=(await db.query<{id:string;request_digest:string}>('SELECT id,request_digest FROM quality_profile_reviews WHERE project_id=$1 AND actor=$2 AND command_key=$3',[project,actor.id,command])).rows[0];
    if(previous&&previous.request_digest!==digest)throw new DomainError(409,'quality_replay','Cette commande correspond à un autre bilan.');
    return previous?.id;
  }
  const recorded=await replay(pool);if(recorded)return recorded;
  await evidence(pool,actor,project,ref,true);
  return transaction(pool,async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[project,'quality-review-'+command]);
    const previous=await replay(c);if(previous)return previous;
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[project,'quality-profile-'+key]);
    const profile=await config(c,project,key);if(profile.revision!==rev)throw conflict();
    if(ref.schema && !(await c.query(`SELECT s.id FROM explorer_sources s JOIN explorer_snapshots h ON h.source_id=s.id
      WHERE h.id=$1 AND s.project_id=$2 AND s.revoked_at IS NULL FOR SHARE OF s`,[ref.schema,project])).rowCount)throw notFound();
    const id=randomUUID();await c.query(`INSERT INTO quality_profile_reviews(id,project_id,profile,checks,revision,lab,campaign,schema_snapshot,actor,command_key,request_digest)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,project,key,profile.checks,rev,ref.lab,ref.campaign,ref.schema,actor.id,command,digest]);return id;
  });
}
type Observation={control:CheckId;status:'measured'|'failed'|'warning'|'not_run';method:string;detail:string;proof?:string;digest?:string;commit?:string};
function measure(key:CheckId,p:Evidence,project:string):Observation{
  const {lab,campaign,schema}=p,base='/projects/'+project+'/quality';
  const labProof=lab?{proof:base+'/'+lab.id,digest:lab.result_sha!,commit:lab.commit_sha}:{};
  const campaignProof=campaign?{proof:base+'/campaigns/'+campaign.id,digest:campaign.report_sha,commit:campaign.commit_sha}:{};
  const schemaProof=schema?{proof:base+'/schema?source='+schema.source_id+'&snapshot='+schema.id,digest:schema.digest}:{};
  const no=(detail:string):Observation=>({control:key,status:'not_run',method:'Aucune mesure',detail});
  const measured=(method:string,detail:string,proof:Pick<Observation,'proof'|'digest'|'commit'>,status:Observation['status']='measured'):Observation=>({control:key,method,detail,...proof,status});
  if(key==='tests'||key==='typecheck'&&campaign){
    if(!campaign)return no('Aucune campagne de tests du projet sélectionnée.');
    const r=campaign.report,stage=key==='tests'?r.tests:r.typecheck;
    if(r.treeAfter!=='clean'||r.commitBefore!==r.commitAfter||stage.exitCode===null)return measured('Campagne Studio','Exécution incomplète ou révision instable.',campaignProof,'not_run');
    if(key==='typecheck')return measured('Typecheck du Studio','Code de sortie '+stage.exitCode+' · '+stage.elapsedMs+' ms.',campaignProof,stage.exitCode===0?'measured':'failed');
    if(stage.exitCode!==0)return measured('Suite npm','Code de sortie '+stage.exitCode+'.',campaignProof,'failed');
    if(!r.counts?.tests)return measured('Suite npm','Compteurs de test indisponibles.',campaignProof,'not_run');
    const c=r.counts;
    return measured('Suite npm',c.pass+' réussis, '+c.fail+' échoués, '+c.skipped+' ignorés, '+c.cancelled+' annulés, '+c.todo+' à faire.',campaignProof,c.fail?'failed':c.cancelled||c.skipped||c.todo?'warning':'measured');
  }
  const htmlSecurity=lab?.result?.checks.some(c=>c.id==='references');
  if(key==='typecheck'||key==='security'&&(!schema||schema.structure.engine.startsWith('Prisma')&&htmlSecurity)){
    const id=key==='typecheck'?'typescript':'references',check=lab?.result?.checks.find(c=>c.id===id);
    if(!check)return no(key==='typecheck'?'Aucun passage TypeScript ni campagne correspondante sélectionnés.':'Aucune inspection HTML ni photographie de schéma sélectionnée.');
    return measured(key==='typecheck'?'TypeScript strict de l’unité autorisée':'Références actives dans le HTML',check.observed,labProof,check.status==='passed'?'measured':check.status);
  }
  if(key==='dependencies'||key==='architecture'||key==='documentation'){
    if(!lab)return no('Aucun inventaire de commit provenant d’un passage Lab du projet sélectionné.');
    const i=lab.inventory;
    if(key==='dependencies')return i.dependencies===null?no('Le manifeste n’a pas donné de comptage exploitable.'):
      measured('Inventaire de package.json',i.dependencies+' dépendance'+(i.dependencies>1?'s':'')+' en production et '+(i.devDependencies??0)+' en développement. Le risque lié aux versions reste à qualifier.',labProof);
    if(!i.directories)return no('Aucun inventaire de répertoires disponible dans ce passage.');
    if(key==='documentation')return measured('Inventaire Git du commit',i.directories.includes('docs')?'Le dossier docs/ est présent. Son contenu reste à qualifier.':'Aucun dossier docs/ parmi les chemins reconnus.',labProof,i.directories.includes('docs')?'measured':'warning');
    return measured('Inventaire Git du commit','Répertoires reconnus · '+i.directories.join(', ')+'. Les dépendances entre composants restent à qualifier.',labProof);
  }
  if(key==='database'||key==='security'||key==='rls'){
    if(!schema)return no('Aucune photographie accessible sélectionnée pour ce projet.');
    if(key==='security'&&schema.structure.engine.startsWith('Prisma'))return measured('Audit statique du schéma','Les fonctions à privilèges ne figurent pas dans un modèle Prisma.',schemaProof,'not_run');
    const s=auditSchema(schema.structure),scope=schema.structure.tables.filter(t=>t.kind==='table');
    if(key==='rls'&&(!scope.length||scope.every(t=>t.rls===null)))return measured('Audit statique du schéma','L’état RLS est inconnu dans cette photographie.',schemaProof,'not_run');
    const observations=s.findings.filter(f=>key==='database'||key==='security'&&f.category==='Privilèges'||key==='rls'&&f.category==='RLS').length;
    const details=key==='database'?'Tables · '+s.signals.tables+' / clés étrangères · '+s.signals.foreignKeys+' / index · '+s.signals.indexes:
      key==='rls'?'Tables avec RLS · '+s.signals.rls+' / policies · '+s.signals.policies:'Fonctions SECURITY DEFINER · '+s.signals.definers;
    return measured('Audit statique de la photographie',details+' · '+observations+' point(s) à examiner. Les accès effectifs ne sont pas testés.',schemaProof,observations||s.warnings.length?'warning':'measured');
  }
  return no(controls[key][1]);
}
export async function profileReview(pool:Pool,actor:Operator,project:string,id:string){
  assertProject(actor,project);assertId(id);
  const row=(await pool.query<ReviewRow>('SELECT * FROM quality_profile_reviews WHERE project_id=$1 AND id=$2',[project,id])).rows[0];
  if(!row)throw notFound();
  const proof=await evidence(pool,actor,project,{lab:row.lab,campaign:row.campaign,schema:row.schema_snapshot},false);
  const observations=row.checks.map(c=>measure(c,proof,project));
  return {id,profile:row.profile,revision:row.revision,actor:row.actor,created_at:row.created_at,observations,
    coverage:observations.filter(x=>x.status!=='not_run').length,total:observations.length};
}
