import { parse } from 'libpg-query';
import prisma from '@prisma/prisma-schema-wasm';
import { actions } from './explorer-catalog.ts';
import { expression,names,typeName,type PgNode } from './explorer-expression.ts';
import { finish,hash,invalid,model,table,type SchemaModel,type Constraint,type Table } from './explorer-model.ts';

function input(text:string) {
  if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>96000) throw invalid('Le schéma doit contenir entre 1 et 96 000 octets.');
}
export async function importSql(ddl:string,base?:SchemaModel):Promise<SchemaModel> {
  input(ddl);
  let tree:PgNode;
  try { tree=await parse(ddl); } catch { throw invalid('Le parseur PostgreSQL ne reconnaît pas ce document SQL.'); }
  if(tree.stmts.length>900) throw invalid('Trop d’instructions dans cet import.');
  const m=base?structuredClone(base):model('PostgreSQL · import SQL');
  let defaultSchema='public';
  const key=(r:PgNode)=>({schema:String(r.schemaname??defaultSchema),table:String(r.relname)});
  const find=(r:PgNode)=>m.tables.find(t=>t.name===key(r).table&&t.schema===key(r).schema);
  function constraint(t:Table,n:PgNode,local?:string) {
    const kinds:Record<string,Constraint['kind']>={CONSTR_PRIMARY:'primary',CONSTR_UNIQUE:'unique',CONSTR_FOREIGN:'foreign',CONSTR_CHECK:'check',CONSTR_EXCLUSION:'exclusion'};
    const kind=kinds[n.contype];
    if(!kind)return;
    const cols=local?[local]:names(n.fk_attrs??n.keys);
    const c:Constraint={kind,name:n.conname??'Non nommée · '+[kind,...cols,t.constraints.length+1].join(' '),columns:cols};
    if(kind==='foreign') {
      c.target={...key(n.pktable),columns:names(n.pk_attrs)};
      c.onDelete=actions[n.fk_del_action]??'NO ACTION';c.onUpdate=actions[n.fk_upd_action]??'NO ACTION';
    }
    if(n.raw_expr)c.expression=expression(n.raw_expr);
    t.constraints.push(c);
  }
  function column(t:Table,n:PgNode) {
    const cs:PgNode[]=(n.constraints??[]).map((x:PgNode)=>x.Constraint);
    t.columns.push({name:n.colname,type:typeName(n.typeName),nullable:!cs.some(c=>['CONSTR_NOTNULL','CONSTR_PRIMARY','CONSTR_IDENTITY'].includes(c.contype)),
      default:expression(cs.find(c=>c.contype==='CONSTR_DEFAULT')?.raw_expr),generation:cs.some(c=>c.contype==='CONSTR_IDENTITY')?'IDENTITY':cs.some(c=>c.contype==='CONSTR_GENERATED')?'GENERATED':''});
    for(const c of cs)constraint(t,c,n.colname);
  }
  const warn=(name:string)=>m.warnings.push('Instruction partiellement ou non représentée · '+name);
  for(const {stmt} of tree.stmts) {
    const type=Object.keys(stmt)[0],n=stmt[type] as PgNode;
    if(type==='CreateSchemaStmt') {if(n.schemaname)m.schemas.push(n.schemaname);if(n.schemaElts?.length)warn('CREATE SCHEMA avec objets');continue;}
    if(type==='VariableSetStmt') {
      if(n.name==='search_path') {
        const schemas=(n.args??[]).map((x:PgNode)=>x.A_Const?.sval?.sval);
        if(schemas.length!==1||!schemas[0]||/[,"$]/.test(schemas[0]))throw invalid('Qualifiez les tables ou indiquez un seul schéma explicite pour search_path.');
        defaultSchema=schemas[0];
      }
      continue;
    }
    if(type==='CreateFunctionStmt') {
      const path=names(n.funcname),args=(n.parameters??[]).map((v:PgNode)=>typeName(v.FunctionParameter?.argType)).join(', '),schema=path.at(-2)??defaultSchema,name=path.at(-1)!;
      m.functions=m.functions.filter(f=>f.schema!==schema||f.name!==name||f.arguments!==args);
      const signature=hash(JSON.stringify(n.options??[],(key,value)=>key==='location'||key==='arg_location'?undefined:value));
      m.functions.push({schema,name,arguments:args,definer:!!n.options?.find((x:PgNode)=>x.DefElem.defname==='security')?.DefElem.arg.Boolean.boolval,signature});continue;
    }
    if(type==='DropStmt') {
      for(const x of n.objects??[]) {
        const bits=names(x.List?.items),name=bits.at(-1),schema=bits.at(-2)??defaultSchema;
        if(['OBJECT_TABLE','OBJECT_VIEW','OBJECT_MATVIEW'].includes(n.removeType)){
          m.tables=m.tables.filter(t=>t.schema!==schema||t.name!==name);
          for(const t of m.tables)t.constraints=t.constraints.filter(c=>c.target?.schema!==schema||c.target.table!==name);
        }
        else if(n.removeType==='OBJECT_INDEX') for(const t of m.tables.filter(t=>t.schema===schema))t.indexes=t.indexes.filter(i=>i.name!==name);
        else if(['OBJECT_POLICY','OBJECT_TRIGGER'].includes(n.removeType)){
          const t=m.tables.find(t=>t.schema===(bits.at(-3)??defaultSchema)&&t.name===bits.at(-2));
          if(t&&n.removeType==='OBJECT_POLICY')t.policies=t.policies.filter(p=>p.name!==name);
          if(t&&n.removeType==='OBJECT_TRIGGER')t.triggers=t.triggers.filter(p=>p.name!==name);
        }
        else warn('DROP '+String(n.removeType));
      }continue;
    }
    if(type==='CreateStmt'||type==='ViewStmt') {
      const ref=n.relation??n.view,t=table(key(ref).schema,key(ref).table,type==='ViewStmt'?'view':'table');
      if(find(ref)) {if(n.if_not_exists)continue;if(!n.replace)throw invalid('Objet déclaré plusieurs fois.');m.tables=m.tables.filter(p=>p!==find(ref));}
      for(const field of n.tableElts??[]) {if(field.ColumnDef)column(t,field.ColumnDef);else if(field.Constraint)constraint(t,field.Constraint);else warn('CREATE TABLE · élément');}
      if(n.inhRelations||n.partspec)warn('Héritage ou partitionnement');
      if(n.query)warn('Projection et dépendances de vue · disponibles par introspection');
      m.tables.push(t);continue;
    }
    const ref=n.relation??n.table,t=ref?find(ref):undefined;
    if(['AlterTableStmt','CreateTrigStmt','CreatePolicyStmt','AlterPolicyStmt','IndexStmt'].includes(type)&&!t)throw invalid('Une table de la migration est absente du schéma de départ.');
    if(t&&((type==='RenameStmt'&&['OBJECT_TABLE','OBJECT_VIEW'].includes(n.renameType))||type==='AlterObjectSchemaStmt')){
      const schema=type==='AlterObjectSchemaStmt'?String(n.newschema):t.schema,name=type==='RenameStmt'?String(n.newname):t.name;
      for(const a of m.tables)for(const c of a.constraints)if(c.target?.schema===t.schema&&c.target.table===t.name){c.target.schema=schema;c.target.table=name;}
      t.schema=schema;t.name=name;continue;
    }
    if(t&&type==='RenameStmt'&&n.renameType==='OBJECT_COLUMN'){
      const col=t.columns.find(c=>c.name===n.subname);if(!col)throw invalid('Colonne renommée absente.');
      const rename=(v:string)=>v===n.subname?String(n.newname):v;
      col.name=n.newname;
      for(const c of [...t.constraints,...t.indexes])c.columns=c.columns.map(rename);
      for(const a of m.tables)for(const c of a.constraints)if(c.target?.schema===t.schema&&c.target.table===t.name)c.target.columns=c.target.columns.map(rename);
      if(t.policies.length||t.constraints.some(c=>c.expression))warn('Renommage · expressions à revérifier par introspection');
      continue;
    }
    if(type==='AlterTableStmt'&&t) {
      for(const x of n.cmds) {
        const c=x.AlterTableCmd,kind=c.subtype,def=c.def;
        if(kind==='AT_AddColumn'&&def?.ColumnDef)column(t,def.ColumnDef);
        else if(kind==='AT_AddConstraint'&&def?.Constraint)constraint(t,def.Constraint);
        else if(kind==='AT_DropConstraint')t.constraints=t.constraints.filter(k=>k.name!==c.name);
        else if(kind==='AT_DropColumn'){
          t.columns=t.columns.filter(col=>col.name!==c.name);t.constraints=t.constraints.filter(k=>!k.columns.includes(c.name));t.indexes=t.indexes.filter(k=>!k.columns.includes(c.name));
          for(const a of m.tables)a.constraints=a.constraints.filter(k=>!(k.target?.schema===t.schema&&k.target.table===t.name&&k.target.columns.includes(c.name)));
        }
        else if(kind==='AT_EnableRowSecurity'||kind==='AT_DisableRowSecurity')t.rls=kind==='AT_EnableRowSecurity';
        else if(kind==='AT_ForceRowSecurity'||kind==='AT_NoForceRowSecurity')t.forced=kind==='AT_ForceRowSecurity';
        else if(['AT_SetNotNull','AT_DropNotNull','AT_AlterColumnType','AT_ColumnDefault'].includes(kind)) {
          const col=t.columns.find(v=>v.name===c.name);if(!col)throw invalid('Colonne de migration absente.');
          if(kind==='AT_AlterColumnType')col.type=typeName(def.ColumnDef.typeName);else if(kind==='AT_ColumnDefault')col.default=expression(def);else col.nullable=kind==='AT_DropNotNull';
        } else warn(kind);
      }
    }else if(type==='AlterPolicyStmt'&&t){
      const policy=t.policies.find(p=>p.name===n.policy_name);if(!policy)throw invalid('Policy de migration absente.');
      if(n.roles)policy.roles=n.roles.map((x:PgNode)=>x.RoleSpec.rolename??x.RoleSpec.roletype.replace('ROLESPEC_',''));
      if(n.qual)policy.using=expression(n.qual);if(n.with_check)policy.check=expression(n.with_check);
    }else if(type==='CreatePolicyStmt'&&t)t.policies.push({name:n.policy_name,command:String(n.cmd_name).toUpperCase(),roles:(n.roles??[]).map((x:PgNode)=>x.RoleSpec.rolename??x.RoleSpec.roletype.replace('ROLESPEC_','')),using:expression(n.qual),check:expression(n.with_check),permissive:!!n.permissive});
    else if(type==='IndexStmt'&&t)t.indexes.push({name:n.idxname??'index_'+(t.indexes.length+1),method:n.accessMethod??'btree',columns:(n.indexParams??[]).map((x:PgNode)=>x.IndexElem.name??expression(x.IndexElem.expr)),unique:!!n.unique,valid:null,predicate:expression(n.whereClause)});
    else if(type==='CreateTrigStmt'&&t)t.triggers.push({name:n.trigname,routine:names(n.funcname).join('.'),state:'déclaré',signature:hash(JSON.stringify([n.events,n.timing,n.row,names(n.funcname)]))});
    else if(!['TransactionStmt','InsertStmt','UpdateStmt','DeleteStmt','SelectStmt','CommentStmt'].includes(type))warn(type);
  }
  for(const t of m.tables)for(const c of t.constraints){
    if(c.kind==='primary')for(const col of t.columns.filter(col=>c.columns.includes(col.name)))col.nullable=false;
    if(c.kind==='foreign'&&c.target&&!c.target.columns.length){
      const target=c.target,pk=m.tables.find(v=>v.schema===target.schema&&v.name===target.table)?.constraints.find(k=>k.kind==='primary');
      if(pk)target.columns=[...pk.columns];else m.warnings.push('Clé primaire cible absente de cet import.');
    }
  }
  if(!m.tables.length&&!m.functions.length)throw invalid('Document sans table, vue ou fonction représentée.');
  return finish(m);
}

export function importPrisma(source:string):SchemaModel {
  input(source);
  let data:PgNode|undefined,provider='',relationMode:string|undefined;
  // Older datamodel engines require url, whereas recent projects often provide it through prisma.config.
  // The fallback is a parser-only environment reference; neither form resolves it or opens a database.
  const placeholder=source.replace(/^([ \t]*datasource\s+\w+\s*\{)/m,'$1\n url = env("STUDIO_PRISMA_PARSER_ONLY")\n');
  for(const candidate of new Set([source,placeholder]))try{
    const params=JSON.stringify({prismaSchema:candidate,ignoreEnvVarErrors:true});
    const ds=JSON.parse(prisma.get_config(params)).config?.datasources;
    if(ds?.length!==1||ds[0].provider!=='postgresql')throw Error();
    provider=ds[0].provider;relationMode=ds[0].relationMode;
    data=JSON.parse(prisma.get_dmmf(params)).datamodel;
    break;
  }catch{ /* Invalid candidates are never echoed; source text may include credentials. */ }
  if(!data)throw invalid('Schéma Prisma PostgreSQL invalide ou non pris en charge.');
  const m=model('Prisma · '+provider);m.warnings.push('Modèle déclaratif Prisma. Policies, triggers, permissions et état RLS inconnus.');
  const mapped=(model:PgNode,name:string)=>model.fields.find((f:PgNode)=>f.name===name)?.dbName??name;
  const emulated=relationMode==='prisma'||/\brelationMode\s*=\s*"prisma"/.test(source);
  for(const def of data.models) {
    const t=table(def.schema??'public',def.dbName??def.name);t.rls=null;
    for(const f of def.fields) {
      if(f.kind==='object') {
        const target=data.models.find((d:PgNode)=>d.name===f.type);
        if(target&&f.relationFromFields?.length&&!emulated)t.constraints.push({kind:'foreign',name:f.relationName,columns:f.relationFromFields.map((k:string)=>mapped(def,k)),
          target:{schema:target.schema??'public',table:target.dbName??target.name,columns:f.relationToFields.map((k:string)=>mapped(target,k))},onDelete:f.relationOnDelete??'défaut Prisma',onUpdate:f.relationOnUpdate??'défaut Prisma'});
      }else t.columns.push({name:f.dbName??f.name,type:(f.nativeType?f.nativeType[0]:f.type)+(f.isList?'[]':''),nullable:!f.isRequired,default:f.hasDefaultValue?'déclarée · valeur masquée':'',generation:f.isGenerated?'générée':''});
    }
    for(const i of data.indexes.filter((x:PgNode)=>x.model===def.name)) {
      const cols=i.fields.map((f:PgNode)=>mapped(def,f.name)),name=i.dbName??i.name??i.type+'_'+cols.join('_');
      if(i.type==='id'||i.type==='unique')t.constraints.push({name,kind:i.type==='id'?'primary':'unique',columns:cols});
      t.indexes.push({name,columns:cols,method:i.algorithm??'défaut Prisma',unique:i.type!=='normal',valid:null,predicate:''});
    }
    m.tables.push(t);
  }
  if(emulated)m.warnings.push('Relations émulées par Prisma. Aucune clé étrangère physique déclarée.');
  if(!m.tables.length)throw invalid('Aucun modèle Prisma représenté.');
  return finish(m);
}
