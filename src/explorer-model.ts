import { createHash } from 'node:crypto';
import { DomainError } from './contracts.ts';

export type Ref={schema:string;table:string;columns:string[]};
export type Constraint={name:string;kind:'primary'|'unique'|'foreign'|'check'|'exclusion';columns:string[];target?:Ref;onDelete?:string;onUpdate?:string;expression?:string};
export type Column={name:string;type:string;nullable:boolean;default:string;generation:string;comment?:boolean};
export type Index={name:string;columns:string[];method:string;unique:boolean;valid:boolean|null;predicate:string};
export type Policy={name:string;command:string;roles:string[];using:string;check:string;permissive:boolean};
export type Trigger={name:string;routine:string;state:string;signature:string};
export type Routine={schema:string;name:string;arguments:string;definer:boolean;signature:string};
export type Table={schema:string;name:string;kind:'table'|'view'|'materialized view'|'foreign table';columns:Column[];constraints:Constraint[];indexes:Index[];policies:Policy[];triggers:Trigger[];rls:boolean|null;forced:boolean;comment:boolean;depends:string[];privileges:string[]};
export type SchemaModel={engine:string;version:string;schemas:string[];tables:Table[];functions:Routine[];warnings:string[];migrations:string[]};
export const environments=['local','development','test','staging','production'] as const;
export type Environment=typeof environments[number];
export const invalid=(message:string)=>new DomainError(400,'schema_input',message);
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function model(engine:string,version=''):SchemaModel {
  return {engine,version,schemas:[],tables:[],functions:[],warnings:[],migrations:[]};
}
export function table(schema:string,name:string,kind:Table['kind']='table'):Table {
  return {schema,name,kind,columns:[],constraints:[],indexes:[],policies:[],triggers:[],rls:false,forced:false,comment:false,depends:[],privileges:[]};
}
export function finish(m:SchemaModel) {
  if(m.tables.length>250 || m.functions.length>1000 || m.tables.reduce((n,t)=>n+t.columns.length+t.constraints.length+t.indexes.length+t.policies.length+t.triggers.length,0)>10000) throw invalid('Catalogue trop volumineux. Réduisez les schémas sélectionnés.');
  m.tables.sort((a,b)=>a.schema.localeCompare(b.schema)||a.name.localeCompare(b.name));
  m.functions.sort((a,b)=>a.schema.localeCompare(b.schema)||a.name.localeCompare(b.name)||a.arguments.localeCompare(b.arguments));
  m.schemas=[...new Set([...m.schemas,...m.tables.map(t=>t.schema),...m.functions.map(f=>f.schema)])].sort();
  m.warnings=[...new Set(m.warnings)].sort();
  for(const t of m.tables) {
    for(const list of [t.constraints,t.indexes,t.policies,t.triggers]) list.sort((a,b)=>a.name.localeCompare(b.name));
    t.privileges.sort();t.depends.sort();
  }
  return m;
}
export function cardinality(t:Table,c:Constraint) {
  const keys=[...t.constraints.filter(x=>x.kind==='unique'||x.kind==='primary'),...t.indexes.filter(x=>x.unique&&!x.predicate&&x.valid!==false)];
  const unique=keys.some(x=>x.columns.length>0&&x.columns.every(k=>c.columns.includes(k)));
  return unique?'0..1':'0..N';
}
export function differences(before:SchemaModel,after:SchemaModel) {
  function items(m:SchemaModel) {
    const rows=new Map<string,string>();
    function put(path:string[],v:unknown) { rows.set(JSON.stringify(path),JSON.stringify(v)); }
    for(const t of m.tables) {
      const path=[t.schema,t.name];put([...path,'table'],[t.kind,t.rls,t.forced,t.depends,t.privileges]);
      for(const [kind,list] of Object.entries({colonne:t.columns,contrainte:t.constraints,index:t.indexes,policy:t.policies,trigger:t.triggers})) {
        for(const row of list) put([...path,kind,row.name],row);
      }
    }
    for(const f of m.functions) put([f.schema,'fonction',f.name,f.arguments],f);
    return rows;
  }
  const left=items(before),right=items(after);
  return [...new Set([...left.keys(),...right.keys()])].sort().filter(k=>left.get(k)!==right.get(k)).map(k=>({
    path:JSON.parse(k) as string[],change:left.has(k)?right.has(k)?'modifié':'supprimé':'ajouté',before:left.get(k),after:right.get(k),
  }));
}
export function schemaSignals(m:SchemaModel) {
  return {tables:m.tables.filter(t=>t.kind==='table').length,views:m.tables.filter(t=>t.kind.includes('view')).length,
    foreignKeys:m.tables.flatMap(t=>t.constraints).filter(c=>c.kind==='foreign').length,rls:m.tables.filter(t=>t.rls).length,
    indexes:m.tables.reduce((n,t)=>n+t.indexes.length,0),triggers:m.tables.reduce((n,t)=>n+t.triggers.length,0),
    policies:m.tables.reduce((n,t)=>n+t.policies.length,0),definers:m.functions.filter(f=>f.definer).length};
}
