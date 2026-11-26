import pg from 'pg';
import type { Operator } from './contracts.ts';
import { assertProject,notFound,transaction } from './database.ts';
import { invalid } from './explorer-model.ts';
import { inspectCatalog } from './explorer-catalog.ts';
import { captureProject,sourceFields } from './explorer-store.ts';

type Target={project:string;environment:string;label:string;secret:string;schemas:string[]};
function configured():Target[] {
  const error=()=>invalid('Configuration des sources PostgreSQL invalide.');
  let rows:Target[];try{rows=JSON.parse(process.env.STUDIO_EXPLORER_CONNECTIONS??'[]');}catch{throw error();}
  if(!Array.isArray(rows)||rows.length>30)throw error();
  const secrets=new Set<string>(),identities=new Set<string>(),roles=new Set<string>();
  for(const r of rows) {
    if(!r||typeof r.project!=='string'||!/^STUDIO_EXPLORER_DSN_[A-Z0-9_]{1,60}$/.test(r.secret)||!Array.isArray(r.schemas)||!r.schemas.length||r.schemas.length>16||
        r.schemas.some(s=>typeof s!=='string'||!s||s.length>63||s==='information_schema'||s.startsWith('pg_'))||!['local','development','test'].includes(r.environment))throw error();
    sourceFields(r.environment,r.label,'');
    const key=JSON.stringify([r.project,r.environment,r.label]);if(secrets.has(r.secret)||identities.has(key))throw error();
    if(process.env[r.secret]){
      let url:URL;try{url=new URL(process.env[r.secret]!);}catch{throw error();}
      const role=JSON.stringify([url.host,decodeURIComponent(url.username)]);
      if(roles.has(role))throw error();
      roles.add(role);
    }
    secrets.add(r.secret);identities.add(key);
  }return rows;
}
export function connectionChoices(actor:Operator,project:string) {
  assertProject(actor,project);
  if(actor.accountRole!=='admin')return [];
  return configured().filter(r=>r.project===project).map(r=>({environment:r.environment,label:r.label}));
}
export async function inspectDedicated(dsn:string,schemas:string[]) {
  let url:URL;try{url=new URL(dsn);}catch{throw invalid('Connexion PostgreSQL de lecture indisponible.');}
  if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||!url.port||!url.username||!url.password||!/^\/[a-zA-Z0-9_]+$/.test(url.pathname)||url.search||url.hash)
    throw invalid('La connexion doit désigner une base locale autorisée avec un identifiant dédié.');
  const db=new pg.Pool({connectionString:url.href,max:1,connectionTimeoutMillis:1800,statement_timeout:3000,options:'-c default_transaction_read_only=on',application_name:'studio-explorer'});
  try {
    return await transaction(db,async c=>{
      await c.query('SET LOCAL search_path=pg_catalog');
      const rights=(await c.query(`SELECT current_setting('transaction_read_only')='on' AND NOT (
        r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls OR
        EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) OR has_database_privilege(current_database(),'CREATE') OR
        EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname!~'^pg_' AND n.nspname<>'information_schema' AND has_schema_privilege(n.oid,'CREATE')) OR
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname!~'^pg_' AND n.nspname<>'information_schema'
        AND c.relkind IN ('r','p','v','m','f') AND (c.relowner=r.oid OR has_table_privilege(c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
      ) AS ok FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
      if(!rights?.ok)throw invalid('Le compte doit être dédié aux métadonnées, sans privilège sur les lignes ni droit de création.');
      return inspectCatalog(c,schemas);
    },true);
  } catch(e) {
    if(e instanceof Error&&'code' in e&&e.code==='schema_input')throw e;
    throw invalid('Introspection impossible. Vérifiez la source, le rôle et les délais.');
  } finally { await db.end(); }
}
export async function refreshConnection(pool:pg.Pool,actor:Operator,project:string,environment:string,label:string) {
  assertProject(actor,project);
  const target=configured().find(s=>s.project===project&&s.environment===environment&&s.label===label);
  if(!target)throw notFound();
  return captureProject(pool,actor,project,environment,label,()=>inspectDedicated(process.env[target.secret]??'',target.schemas));
}
