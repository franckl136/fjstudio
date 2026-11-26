import type { PoolClient } from 'pg';
import { finish,invalid,model,table,type Constraint,type Table } from './explorer-model.ts';
import { safeExpression } from './explorer-expression.ts';

export const actions:Record<string,string>={a:'NO ACTION',r:'RESTRICT',c:'CASCADE',n:'SET NULL',d:'SET DEFAULT'};
const objects=` FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace `;
const visible="n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','v','m','f')";
const columns=(alias:string,keys:string)=>`ARRAY(SELECT a.attname::text FROM unnest(${keys}) WITH ORDINALITY key_pos(num,ord)
 JOIN pg_catalog.pg_attribute a ON a.attrelid=${alias} AND a.attnum=key_pos.num ORDER BY key_pos.ord)`;
export async function inspectCatalog(client:PoolClient,schemas:string[]) {
  if(!schemas.length || schemas.length>16 || schemas.some(s=>!s || s.length>63 || s==='information_schema'||s.startsWith('pg_'))) throw invalid('Sélection de schémas invalide.');
  await client.query("SET LOCAL search_path=pg_catalog");
  await client.query("SET LOCAL statement_timeout='3000ms'");
  await client.query("SET LOCAL lock_timeout='500ms'");
  async function read(sql:string,limit=10000) {
    const r=await client.query(sql+' LIMIT '+(limit+1),[schemas]);
    if(r.rows.length>limit) throw invalid('Réduisez le nombre de schémas ou de tables.');
    return r.rows;
  }
  const m=model('PostgreSQL',(await client.query('SHOW server_version')).rows[0].server_version);
  const dbTables=new Map<string,Table>();
  const actual=await read('SELECT nspname FROM pg_namespace WHERE nspname=ANY($1::text[]) AND has_schema_privilege(oid,\'USAGE\')');
  if(actual.length!==new Set(schemas).size) throw invalid('Schéma inexistant ou inaccessible.');
  m.schemas=actual.map(r=>r.nspname);
  for(const r of await read(`SELECT c.oid::text AS id,n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
    obj_description(c.oid,'pg_class') IS NOT NULL AS commented,ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ' · '||a.privilege_type FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a ORDER BY 1) AS privileges
    ${objects} WHERE ${visible}`,250)) {
    const kind=r.relkind==='v'?'view':r.relkind==='m'?'materialized view':r.relkind==='f'?'foreign table':'table';
    const item=table(r.nspname,r.relname,kind);item.rls=r.relrowsecurity;item.forced=r.relforcerowsecurity;item.comment=r.commented;item.privileges=r.privileges;
    dbTables.set(r.id,item);m.tables.push(item);
  }
  for(const r of await read(`SELECT c.oid::text AS id,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
    a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS def,col_description(c.oid,a.attnum) IS NOT NULL AS commented
    ${objects} JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE ${visible} ORDER BY c.oid,a.attnum`)) {
    dbTables.get(r.id)!.columns.push({name:r.attname,type:r.type,nullable:!r.attnotnull,default:await safeExpression(r.def),generation:r.attidentity?'IDENTITY '+(r.attidentity==='a'?'ALWAYS':'BY DEFAULT'):r.attgenerated?'GENERATED':'',comment:r.commented});
  }
  const kinds:Record<string,Constraint['kind']>={f:'foreign',c:'check',u:'unique',p:'primary',x:'exclusion'};
  for(const r of await read(`SELECT c.oid::text AS id,k.conname,k.contype,tn.nspname AS ts,tc.relname AS tt,${columns('c.oid','k.conkey')} AS cols,
    ${columns('k.confrelid','k.confkey')} AS targetcols,k.confupdtype,k.confdeltype,pg_get_expr(k.conbin,k.conrelid) AS expr
    ${objects} JOIN pg_constraint k ON k.conrelid=c.oid LEFT JOIN pg_class tc ON tc.oid=k.confrelid LEFT JOIN pg_namespace tn ON tn.oid=tc.relnamespace
    WHERE ${visible} AND k.contype IN ('p','f','u','x','c')`)) {
    const c:Constraint={name:r.conname,kind:kinds[r.contype],columns:r.cols};
    if(c.kind==='foreign') {
      if(schemas.includes(r.ts)) c.target={schema:r.ts,table:r.tt,columns:r.targetcols};
      else m.warnings.push('Des références sortent des schémas autorisés. Leurs cibles sont masquées.');
      c.onDelete=actions[r.confdeltype];c.onUpdate=actions[r.confupdtype];
    }
    if(r.expr) c.expression=await safeExpression(r.expr);
    dbTables.get(r.id)!.constraints.push(c);
  }
  for(const r of await read(`SELECT c.oid::text AS id,i.relname,am.amname,x.indisunique,x.indisvalid,
    ARRAY(SELECT coalesce(a.attname::text,'‹expression›') FROM unnest(x.indkey) WITH ORDINALITY k(num,ord)
    LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num ORDER BY k.ord) AS cols,pg_get_expr(x.indpred,x.indrelid) AS pred
    ${objects} JOIN pg_index x ON x.indrelid=c.oid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_am am ON am.oid=i.relam WHERE ${visible}`))
    dbTables.get(r.id)!.indexes.push({name:r.relname,method:r.amname,unique:r.indisunique,valid:r.indisvalid,columns:r.cols,predicate:await safeExpression(r.pred)});
  for(const r of await read(`SELECT c.oid::text AS id,p.polname,p.polcmd,p.polpermissive,pg_get_expr(p.polqual,c.oid) AS expr,
    pg_get_expr(p.polwithcheck,c.oid) AS chk,ARRAY(SELECT CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id)::text END FROM unnest(p.polroles) role_id ORDER BY 1) AS roles
    ${objects} JOIN pg_policy p ON p.polrelid=c.oid WHERE ${visible}`)){
    const commands:Record<string,string>={'*':'ALL',r:'SELECT',a:'INSERT',w:'UPDATE',d:'DELETE'};
    dbTables.get(r.id)!.policies.push({name:r.polname,command:commands[r.polcmd],roles:r.roles,using:await safeExpression(r.expr),check:await safeExpression(r.chk),permissive:r.polpermissive});
  }
  for(const r of await read(`SELECT c.oid::text AS id,t.tgname,t.tgenabled,pn.nspname,p.proname,md5(pg_get_triggerdef(t.oid)) AS sig ${objects}
    JOIN pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE ${visible}`))
    dbTables.get(r.id)!.triggers.push({name:r.tgname,routine:schemas.includes(r.nspname)?r.nspname+'.'+r.proname:'hors périmètre',state:r.tgenabled,signature:r.sig});
  for(const r of await read(`SELECT DISTINCT c.oid::text AS id,dn.nspname,dc.relname ${objects}
    JOIN pg_rewrite rw ON rw.ev_class=c.oid JOIN pg_depend d ON d.classid='pg_rewrite'::regclass AND d.objid=rw.oid AND d.refclassid='pg_class'::regclass
    JOIN pg_class dc ON dc.oid=d.refobjid JOIN pg_namespace dn ON dn.oid=dc.relnamespace
    WHERE ${visible} AND c.relkind IN ('v','m') AND dc.oid<>c.oid AND dn.nspname=ANY($1::text[])`))
    dbTables.get(r.id)!.depends.push(r.nspname+'.'+r.relname);
  for(const r of await read(`SELECT n.nspname,p.proname,oidvectortypes(p.proargtypes) AS arguments,p.prosecdef,md5(p.prosrc) AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY($1::text[])`,1000))
    m.functions.push({schema:r.nspname,name:r.proname,arguments:r.arguments,definer:r.prosecdef,signature:r.sig});
  return finish(m);
}
