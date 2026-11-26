import { createHash } from 'node:crypto';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Pool } from 'pg';
import { DomainError,type Operator } from './contracts.ts';
import { assertProject,transaction } from './database.ts';
import { linkedRepositoryDirectory } from './repositories.ts';
import { importPrisma,importSql } from './explorer-import.ts';
import { invalid,type SchemaModel } from './explorer-model.ts';
import { storeCodeSnapshot } from './explorer-store.ts';

type Definition={path:string;files:string[];origin:'sql'|'prisma'};
type Result={project:string;status:string;sources:{path:string;id:string;updated:boolean}[]};
const recent=new WeakMap<Pool,Map<string,Result>>();
const allowedName=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,110}$/;
const migrationName=/^(?:V)?[0-9][A-Za-z0-9_.-]*\.sql$/i;
function missing(error:unknown){return (error as NodeJS.ErrnoException)?.code==='ENOENT';}

async function checked(root:string,path:string) {
  const full=join(root,path);
  try {
    const info=await lstat(full);
    if(info.isSymbolicLink()||relative(full,await realpath(full)) || (!info.isDirectory()&&(!info.isFile()||info.nlink!==1)))
      throw invalid('Une définition utilise un lien ou un type de fichier non pris en charge.');
    return info;
  } catch(error){if(missing(error))return null;throw error;}
}
async function names(root:string,path:string,directories:boolean) {
  if(!(await checked(root,path))?.isDirectory())return [];
  const result:string[]=[];
  const entries=await opendir(join(root,path));
  let count=0;
  for await(const item of entries){
    if(++count>1000)throw invalid('Répertoire de définitions trop volumineux.');
    if(!allowedName.test(item.name))continue;
    if(directories?item.isDirectory():migrationName.test(item.name) && !/(?:[._-](?:down|rollback)|[._-]seed(?:s)?)\.sql$/i.test(item.name))result.push(item.name);
  }
  return result.sort((a,b)=>a.localeCompare(b,'en',{numeric:true}) || (a<b?-1:a>b?1:0));
}
export async function codeDefinitions(root:string):Promise<Definition[]> {
  if(relative(root,await realpath(root)))throw invalid('Le dossier relié a changé de destination.');
  const groups:Definition[]=[];
  const roots=[''];
  for(const parent of ['apps','packages']){
    const children=await names(root,parent,true);
    if(children.length>48)throw invalid('Trop de modules locaux à examiner.');
    roots.push(...children.map(child=>parent+'/'+child+'/'));
  }
  for(const prefix of roots){
    let prisma=false;
    for(const name of ['prisma/schema.prisma','schema.prisma','schema.sql','db/schema.sql','supabase/schema.sql']){
      const path=prefix+name;
      if((await checked(root,path))?.isFile()){
        const origin=name.endsWith('.prisma')?'prisma':'sql';
        groups.push({path,files:[path],origin});
        if(origin==='prisma')prisma=true;
      }
    }
    for(const name of ['supabase/migrations','migrations','db/migrations','prisma/migrations']){
      if(name==='prisma/migrations' && prisma)continue;
      const path=prefix+name;
      let files:string[];
      if(name==='prisma/migrations'){
        files=[];
        for(const child of await names(root,path,true)){
          const file=path+'/'+child+'/migration.sql';
          if(/^\d/.test(child)&&(await checked(root,file))?.isFile())files.push(file);
        }
      }else files=(await names(root,path,false)).map(file=>path+'/'+file);
      if(files.length>160)throw invalid('Trop de migrations pour une source.');
      if(files.length)groups.push({path,files,origin:'sql'});
    }
  }
  if(groups.length>32)throw invalid('Trop de sources dans ce dépôt.');
  return groups;
}
async function readDefinition(root:string,def:Definition){
  const hash=createHash('sha256'),texts:string[]=[];
  let bytes=0;
  for(const path of def.files){
    const full=join(root,path),before=await checked(root,path);
    if(!before?.isFile() || before.size>96000 || (bytes+=before.size)>2_000_000)throw invalid('Définition absente ou trop volumineuse.');
    const file=await open(full,'r');
    try{
      const info=await file.stat();
      if(info.dev!==before.dev || info.ino!==before.ino || info.size!==before.size || info.nlink!==1 || relative(full,await realpath(full)))throw invalid('Définition modifiée pendant la lecture.');
      const data=Buffer.alloc(info.size);
      let offset=0;
      while(offset<data.length){const part=await file.read(data,offset,data.length-offset,offset);if(!part.bytesRead)break;offset+=part.bytesRead;}
      const after=await file.stat();
      if(offset!==data.length || after.mtimeMs!==info.mtimeMs || after.size!==info.size)throw invalid('Définition modifiée pendant la lecture.');
      hash.update(path).update('\0').update(createHash('sha256').update(data).digest());
      texts.push(data.toString('utf8'));
    }finally{await file.close();}
  }
  async function build(){
    if(def.origin==='prisma')return importPrisma(texts[0]);
    let m:SchemaModel|undefined;
    for(const text of texts)m=await importSql(text,m,/(^|\/)supabase\//.test(def.path)?'supabase':'series');
    if(!m || !(m.tables.length||m.functions.length))throw invalid('Aucun objet SQL représenté.');
    if(def.files.length>1 || def.path.endsWith('migrations'))m.migrations=[...def.files];
    m.warnings.push('Structure décrite dans les fichiers locaux. Les objets créés hors de ces fichiers peuvent différer.');
    return m;
  }
  return {reference:hash.digest('hex'),build};
}
export function lastCodeScan(pool:Pool,project:string){return recent.get(pool)?.get(project);}
export async function syncProjectCode(pool:Pool,actor:Operator,project:string):Promise<Result>{
  assertProject(actor,project);
  if(actor.accountRole==='viewer')throw new DomainError(403,'schema_readonly','Ce compte dispose d’un accès en lecture.');
  let result:Result;
  try {
    result=await transaction(pool,async c=>{
      await c.query('SELECT pg_advisory_xact_lock(64834,hashtext($1))',[project]);
      const root=await linkedRepositoryDirectory(c,actor,project);
      const sources:Result['sources']=[];
      if(!root)return {project,status:'Aucun dépôt local relié',sources};
      for(const def of await codeDefinitions(root)){
        const input=await readDefinition(root,def);
        const entry=await storeCodeSnapshot(c,actor,project,def.path,def.origin,input.reference,input.build);
        if(entry)sources.push({path:def.path,id:entry.source,updated:entry.updated});
      }
      return {project,status:sources.length?'Structure disponible':'Aucune définition SQL ou Prisma reconnue',sources};
    });
  } catch(error){
    result={project,status:error instanceof DomainError?error.message:'Lecture du dossier temporairement indisponible',sources:[]};
  }
  if(!recent.has(pool))recent.set(pool,new Map());
  recent.get(pool)!.set(project,result);
  return result;
}
export async function syncLinkedCode(pool:Pool,actor?:Operator) {
  if(actor?.accountRole==='viewer')throw new DomainError(403,'schema_readonly','Ce compte dispose d’un accès en lecture.');
  const projects=(await pool.query<{project_id:string}>(
    'SELECT project_id FROM project_repositories WHERE ($1::text[] IS NULL OR project_id=ANY($1)) ORDER BY project_id',[actor?.projectIds??null])).rows;
  const results:Result[]=[];
  for(const {project_id} of projects){
    results.push(await syncProjectCode(pool,actor??{id:'studio-code',accountRole:'operator',projectIds:[project_id]},project_id));
  }
  return results;
}
