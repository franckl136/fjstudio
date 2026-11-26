import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { digestJson,DomainError,type Operator } from './contracts.ts';
import { assertProject,assertId,notFound,transaction } from './database.ts';
import { environments,hash,invalid,type Environment,type SchemaModel } from './explorer-model.ts';
import { importSql,importPrisma } from './explorer-import.ts';
import { inspectCatalog } from './explorer-catalog.ts';

type DB=Pool|PoolClient;
export type Source={id:string;project_id:string|null;environment:string;label:string;origin:string;revoked_at:Date|null;from_code:boolean;synthetic_project:boolean;demonstration:boolean};
export type Snapshot={id:string;source_id:string;captured_at:Date;actor:string;reference:string;digest:string;structure:SchemaModel};
export type Version=Omit<Snapshot,'structure'>;
function scope(actor:Operator,project:string|null) {
  if(project!==null)assertProject(actor,project);
  else if(actor.accountRole!=='admin')throw new DomainError(403,'schema_admin','La structure interne est réservée à l’administration du Studio.');
}
function edit(actor:Operator,project:string) {
  scope(actor,project);
  if(actor.accountRole==='viewer')throw new DomainError(403,'schema_readonly','Ce compte dispose d’un accès en lecture.');
}
const sourceColumns=`s.id,s.project_id,s.environment,s.label,s.origin,s.revoked_at,
  (s.created_by='studio-code' AND s.label LIKE 'Code local · %') AS from_code,
  EXISTS(SELECT 1 FROM projects p WHERE p.id=s.project_id AND p.context->>'classification'='synthetic') AS synthetic_project,
  coalesce((SELECT h.structure->>'demonstration'='true' FROM explorer_snapshots h WHERE h.source_id=s.id ORDER BY h.captured_at DESC,h.id DESC LIMIT 1),false) AS demonstration`;
export async function sources(db:DB,actor:Operator,project:string|null) {
  scope(actor,project);
  return (await db.query<Source>(`SELECT ${sourceColumns} FROM explorer_sources s
    WHERE project_id IS NOT DISTINCT FROM $1::text AND revoked_at IS NULL ORDER BY environment,label,id`,[project])).rows;
}
export async function readSource(db:DB,actor:Operator,project:string|null,id:string,lock=false) {
  scope(actor,project);assertId(id);
  const s=(await db.query<Source>(`SELECT ${sourceColumns} FROM explorer_sources s WHERE s.id=$1 AND s.project_id IS NOT DISTINCT FROM $2::text AND s.revoked_at IS NULL`+(lock?' FOR UPDATE':''),[id,project])).rows[0];
  if(!s)throw notFound();return s;
}
export async function versions(db:DB,actor:Operator,project:string|null,id:string) {
  await readSource(db,actor,project,id);
  return (await db.query<Version>(`SELECT h.id,h.source_id,h.captured_at,h.actor,h.reference,h.digest FROM explorer_snapshots h JOIN explorer_sources s ON s.id=h.source_id
    WHERE s.id=$1 AND s.revoked_at IS NULL AND s.project_id IS NOT DISTINCT FROM $2::text ORDER BY h.captured_at DESC,h.id DESC LIMIT 100`,[id,project])).rows;
}
export async function snapshot(db:DB,actor:Operator,project:string|null,source:string,id?:string) {
  scope(actor,project);assertId(source);if(id)assertId(id);
  const result=(await db.query<Snapshot>(`SELECT h.* FROM explorer_snapshots h JOIN explorer_sources s ON s.id=h.source_id
    WHERE s.project_id IS NOT DISTINCT FROM $1::text AND s.id=$2 AND s.revoked_at IS NULL AND ($3::uuid IS NULL OR h.id=$3::uuid)
    ORDER BY h.captured_at DESC,h.id DESC LIMIT 1`,[project,source,id??null])).rows[0];
  if(!result)throw notFound();return result;
}
type Origin='sql'|'prisma'|'migration'|'postgresql';
export function sourceFields(environment:unknown,label:unknown,reference:unknown) {
  if(!environments.includes(environment as Environment)||typeof label!=='string'||!label.trim()||label.length>100||
    /[\r\n\u0000-\u001f]/.test(label)||typeof reference!=='string'||!/^([0-9a-f]{7,64}|[\w.-]{1,110}\.sql|[\w.-]{1,110}\.prisma)?$/i.test(reference))throw invalid('Environnement, nom ou référence de source invalide.');
  return {environment:environment as Environment,label:label.trim(),reference};
}
async function referenceSource(c:PoolClient,project:string,environment:string,label:string,origin:Origin,actor:string) {
  await c.query('INSERT INTO explorer_sources(id,project_id,environment,label,origin,created_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[randomUUID(),project,environment,label,origin,actor]);
  const s=(await c.query<Source>('SELECT * FROM explorer_sources WHERE project_id=$1 AND environment=$2 AND label=$3 FOR UPDATE',[project,environment,label])).rows[0];
  if(!s||s.revoked_at)throw new DomainError(409,'schema_revoked','Cette source a été révoquée.');
  if(s.origin!==origin && !(origin==='migration'&&['sql','migration'].includes(s.origin)))throw invalid('Ce nom de source appartient à un autre adaptateur.');
  return s;
}
async function persist(c:PoolClient,s:Source,actor:string,m:SchemaModel,reference:string,freshCapture=false) {
  const json=JSON.stringify(m);
  if(Buffer.byteLength(json)>4_000_000)throw invalid('La photographie dépasse la limite de stockage.');
  const digest=digestJson(JSON.parse(json));
  const last=(await c.query<{id:string;digest:string;reference:string}>('SELECT id,digest,reference FROM explorer_snapshots WHERE source_id=$1 ORDER BY captured_at DESC,id DESC LIMIT 1',[s.id])).rows[0];
  if(!freshCapture&&last?.digest===digest&&last.reference===reference)return {source:s.id,id:last.id};
  const id=randomUUID();
  await c.query('INSERT INTO explorer_snapshots(id,source_id,actor,reference,digest,structure) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',[id,s.id,actor,reference,digest,json]);
  return {source:s.id,id};
}
export const codePrefix='Code local · ';
export async function storeCodeSnapshot(c:PoolClient,actor:Operator,project:string,path:string,origin:'sql'|'prisma',reference:string,build:()=>Promise<SchemaModel>) {
  edit(actor,project);
  const f=sourceFields('local',codePrefix+path,reference);
  const previous=(await c.query<{created_by:string;revoked_at:Date|null}>(
    'SELECT created_by,revoked_at FROM explorer_sources WHERE project_id=$1 AND environment=$2 AND label=$3 FOR UPDATE',[project,f.environment,f.label])).rows[0];
  if(previous?.revoked_at)return null;
  if(previous && previous.created_by!=='studio-code')throw invalid('Une source manuelle porte déjà ce nom.');
  const s=await referenceSource(c,project,f.environment,f.label,origin,'studio-code');
  const last=(await c.query<{id:string;reference:string}>('SELECT id,reference FROM explorer_snapshots WHERE source_id=$1 ORDER BY captured_at DESC,id DESC LIMIT 1',[s.id])).rows[0];
  if(last?.reference===reference)return {source:s.id,id:last.id,updated:false};
  return {...await persist(c,s,actor.id,await build(),reference),updated:true};
}
export async function importSource(pool:Pool,actor:Operator,project:string,v:Record<string,unknown>) {
  edit(actor,project);
  const f=sourceFields(v.environment,v.label,v.reference??''),origin=v.origin;
  if(!['sql','prisma','migration'].includes(String(origin))||typeof v.document!=='string')throw invalid('Format d’import invalide.');
  if(f.label.startsWith(codePrefix))throw invalid('Ce nom est réservé aux sources du code local.');
  if(v.demonstration!==undefined && v.demonstration!=='yes')throw invalid('Usage de démonstration invalide.');
  const text=v.document;
  return transaction(pool,async c=>{
    const s=await referenceSource(c,project,f.environment,f.label,origin as Origin,actor.id);
    const latest=(await c.query<{structure:SchemaModel}>('SELECT structure FROM explorer_snapshots WHERE source_id=$1 ORDER BY captured_at DESC,id DESC LIMIT 1',[s.id])).rows[0];
    if(latest && v.demonstration==='yes' && !latest.structure.demonstration)throw invalid('Créez une source distincte pour cette démonstration.');
    let base:SchemaModel|undefined;
    const inputDigest=hash(text.replaceAll('\r\n','\n'));
    if(origin==='migration'){
      const previous=await c.query<{snapshot_id:string}>('SELECT snapshot_id FROM explorer_migration_inputs WHERE source_id=$1 AND reference=$2 AND input_digest=$3',[s.id,f.reference,inputDigest]);
      if(previous.rows.length)return {source:s.id,id:previous.rows[0].snapshot_id};
      if(f.reference && (await c.query('SELECT 1 FROM explorer_migration_inputs WHERE source_id=$1 AND reference=$2',[s.id,f.reference])).rowCount)
        throw invalid('Cette référence de migration existe avec un contenu différent.');
      base=latest?.structure;
    }
    const m=origin==='prisma'?importPrisma(text):await importSql(text,base);
    if(origin==='migration'&&f.reference&&!m.migrations.includes(f.reference))m.migrations.push(f.reference);
    if(latest?.structure.demonstration || v.demonstration==='yes')m.demonstration=true;
    const result=await persist(c,s,actor.id,m,f.reference);
    if(origin==='migration')await c.query('INSERT INTO explorer_migration_inputs(source_id,reference,input_digest,snapshot_id) VALUES ($1,$2,$3,$4)',[s.id,f.reference,inputDigest,result.id]);
    return result;
  });
}
export async function revokeSource(pool:Pool,actor:Operator,project:string,id:string) {
  edit(actor,project);if(actor.accountRole!=='admin')throw new DomainError(403,'schema_admin','Compte administrateur requis.');
  return transaction(pool,async c=>{
    await readSource(c,actor,project,id,true);
    await c.query('UPDATE explorer_sources SET revoked_at=clock_timestamp() WHERE id=$1',[id]);
  });
}
export async function captureInternal(pool:Pool) {
  const m=await transaction(pool,async c=>{
    const result=await inspectCatalog(c,['public']);
    result.migrations=(await c.query("SELECT name FROM public.schema_migrations ORDER BY name")).rows.map(r=>r.name);
    return result;
  },true);
  return transaction(pool,async c=>{
    await c.query("INSERT INTO explorer_sources(id,environment,label,origin,created_by) VALUES ($1,'studio','Base interne du Studio','maintenance','maintenance') ON CONFLICT DO NOTHING",[randomUUID()]);
    const s=(await c.query<Source>("SELECT * FROM explorer_sources WHERE project_id IS NULL FOR UPDATE")).rows[0];
    return persist(c,s,'maintenance',m,m.migrations.at(-1)??'',true);
  });
}
export async function captureProject(pool:Pool,actor:Operator,project:string,environment:string,label:string,inspect:()=>Promise<SchemaModel>) {
  if(actor.accountRole!=='admin')throw new DomainError(403,'schema_admin','Compte administrateur requis.');
  edit(actor,project);sourceFields(environment,label,'');
  if(environment==='production')throw invalid('Connexion de production hors périmètre.');
  return transaction(pool,async c=>{
    const s=await referenceSource(c,project,environment,label,'postgresql',actor.id);
    const m=await inspect();
    return persist(c,s,actor.id,m,'',true);
  });
}
