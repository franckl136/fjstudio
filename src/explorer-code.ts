import { access } from 'node:fs/promises';
import { withFileRules,type Eligible } from './explorer-file-rules.ts';
import { createHash } from 'node:crypto';
import { checked,names,moduleRoots,localBytes } from './local-project-files.ts';
import type { Pool } from 'pg';
import { DomainError,type Operator } from './contracts.ts';
import { assertProject,transaction } from './database.ts';
import { linkedRepositoryDirectory } from './repositories.ts';
import {inspectStack} from './project-stack.ts';
import { importPrisma,importSql } from './explorer-import.ts';
import { invalid,type SchemaModel } from './explorer-model.ts';
import { storeCodeSnapshot } from './explorer-store.ts';

type Definition={path:string;files:string[];origin:'sql'|'prisma'};
export type CodeScan={project:string;state:'ready'|'detected'|'empty'|'unavailable'|'unreadable'|'unlinked';status:string;sources:{path:string;id:string;updated:boolean}[]};
const recent=new WeakMap<Pool,Map<string,CodeScan>>();
export async function codeDefinitions(root:string,eligible?:Eligible):Promise<Definition[]> {
  if(!eligible)return withFileRules(root,rules=>codeDefinitions(root,rules));
  const groups:Definition[]=[];
  const roots=await moduleRoots(root);
  const schemaNames=['prisma/schema.prisma','schema.prisma','schema.sql','db/schema.sql','supabase/schema.sql'];
  const migrationDirs=['supabase/migrations','migrations','db/migrations','prisma/migrations'];
  const allowed=await eligible(roots.flatMap(prefix=>[...schemaNames,...migrationDirs.map(p=>p+'/')].map(name=>prefix+name)));
  for(const prefix of roots){
    let prisma=false;
    for(const name of schemaNames){
      const path=prefix+name;
      if(!allowed.has(path))continue;
      if((await checked(root,path))?.isFile()){
        const origin=name.endsWith('.prisma')?'prisma':'sql';
        groups.push({path,files:[path],origin});
        if(origin==='prisma')prisma=true;
      }
    }
    for(const name of migrationDirs){
      if(name==='prisma/migrations' && prisma)continue;
      const path=prefix+name;
      if(!allowed.has(path+'/'))continue;
      let files:string[];
      if(name==='prisma/migrations'){
        files=[];
        for(const child of await names(root,path,true)){
          const file=path+'/'+child+'/migration.sql';
          if(/^\d/.test(child))files.push(file);
        }
      }else files=(await names(root,path,false)).map(file=>path+'/'+file);
      const eligibleFiles=await eligible(files);
      files=[...eligibleFiles];
      if(name==='prisma/migrations'){
        const present:string[]=[];
        for(const file of files)if((await checked(root,file))?.isFile())present.push(file);
        files=present;
      }
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
    const data=await localBytes(root,path,96000);
    if(!data || (bytes+=data.length)>2_000_000)throw invalid('Définition absente ou trop volumineuse.');
    hash.update(path).update('\0').update(createHash('sha256').update(data).digest());
    texts.push(data.toString('utf8'));
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
export async function syncProjectCode(pool:Pool,actor:Operator,project:string):Promise<CodeScan>{
  assertProject(actor,project);
  if(actor.accountRole==='viewer')throw new DomainError(403,'schema_readonly','Ce compte dispose d’un accès en lecture.');
  let result:CodeScan;
  try {
    result=await transaction<CodeScan>(pool,async c=>{
      await c.query('SELECT pg_advisory_xact_lock(64834,hashtext($1))',[project]);
      const root=await linkedRepositoryDirectory(c,actor,project);
      const sources:CodeScan['sources']=[];
      if(!root)return {project,state:'unlinked',status:'Aucun dépôt local relié',sources};
      try{await access(root);}catch{return {project,state:'unavailable',status:'Source indisponible · dossier local inaccessible',sources};}
      return withFileRules<CodeScan>(root,async eligible=>{
        const definitions=await codeDefinitions(root,eligible);
        for(const def of definitions){
          const input=await readDefinition(root,def);
          const entry=await storeCodeSnapshot(c,actor,project,def.path,def.origin,input.reference,input.build);
          if(entry)sources.push({path:def.path,id:entry.source,updated:entry.updated});
        }
        const stack=definitions.length?undefined:await inspectStack(root,eligible);
        const hints=[...(stack?.storage??[])];
        for(const tool of stack?.tools??[])if(['Supabase','PostgreSQL','Prisma'].includes(tool))hints.push('Dépendance '+tool+' déclarée');
        if(stack?.status==='unavailable'||stack?.status==='partial')return {project,state:'unreadable',status:'Fichier illisible · manifeste ou définition du projet',sources};
        return {project,state:sources.length?'ready':hints.length?'detected':'empty',status:sources.length?'Source locale accessible · structure découverte dans le code':hints.length?hints.join(' · '):definitions.length?'Définitions connues sans source consultable':'Aucune définition SQL ou Prisma reconnue',sources};
      });
    });
  } catch(error){
    const unreadable=error instanceof DomainError?error.code==='schema_input':['EACCES','EPERM','EISDIR','ENOENT'].includes((error as NodeJS.ErrnoException).code??'');
    result=unreadable?{project,state:'unreadable',status:'Fichier illisible · définition SQL, Prisma ou manifeste inexploitable',sources:[]}:
      {project,state:'unavailable',status:'Source indisponible · vérifiez le dossier relié et sa configuration',sources:[]};
  }
  if(!recent.has(pool))recent.set(pool,new Map());
  recent.get(pool)!.set(project,result);
  return result;
}
export async function syncLinkedCode(pool:Pool,actor?:Operator) {
  if(actor?.accountRole==='viewer')throw new DomainError(403,'schema_readonly','Ce compte dispose d’un accès en lecture.');
  const projects=(await pool.query<{project_id:string}>(
    `SELECT r.project_id FROM project_repositories r JOIN projects p ON p.id=r.project_id
      WHERE ($1::text[] IS NULL OR r.project_id=ANY($1)) AND
        (NOT $2::boolean OR p.id NOT IN ('a','b') OR p.context->>'classification' IS DISTINCT FROM 'synthetic')
      ORDER BY r.project_id`,[actor?.projectIds??null,process.env.STUDIO_ARCHIVE_DEMOS==='1'])).rows;
  const results:CodeScan[]=[];
  for(const {project_id} of projects){
    results.push(await syncProjectCode(pool,actor??{id:'studio-code',accountRole:'operator',projectIds:[project_id]},project_id));
  }
  return results;
}
