import { execFile } from 'node:child_process';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname,delimiter } from 'node:path';
import { promisify } from 'node:util';
import { DomainError } from './contracts.ts';
import { gitProgram } from './repositories.ts';

const execute=promisify(execFile);
export type Eligible=(paths:string[])=>Promise<Set<string>>;
const privateName=/(?:^|[\/._-])(?:secrets?|credentials?|passwords?|private[_-]?keys?|tokens?)(?:$|[\/._-])/i;
const failure=()=>new DomainError(503,'schema_exclusions','Source indisponible · impossible de vérifier les exclusions du dossier.');

// Check only candidate names. A temporary Git directory keeps the external repository's config,
// index and hooks out of the command, including when the linked folder has no .git directory.
export async function withFileRules<T>(root:string,work:(eligible:Eligible)=>Promise<T>):Promise<T>{
  const git=gitProgram(root),meta=await mkdtemp(join(tmpdir(),'fjstudio-ignore-'));
  const env={SystemRoot:process.env.SystemRoot,TEMP:tmpdir(),TMP:tmpdir(),HOME:meta,
    PATH:[dirname(git),process.platform==='win32'?join(process.env.SystemRoot??'C:/Windows','System32'):'/usr/bin'].join(delimiter),
    GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:join(meta,'empty-config'),GIT_TERMINAL_PROMPT:'0'};
  const options={env,cwd:meta,windowsHide:true,timeout:3500,maxBuffer:256000};
  try{
    try{await execute(git,['init','--quiet','--bare','--template=',meta],options);}catch{throw failure();}
    async function eligible(paths:string[]){
      const allowed=new Set(paths.filter(p=>!privateName.test(p)&&!p.split('/').some(part=>part.startsWith('.')||part==='node_modules')));
      const candidates=[...allowed];
      for(let pos=0;pos<candidates.length;){
        let end=pos,bytes=0;
        do{bytes+=candidates[end++].length+1;}while(end<candidates.length && bytes+candidates[end].length<7000);
        try{
          const {stdout}=await execute(git,['--git-dir='+meta,'--work-tree='+root,'-C',root,'check-ignore','--no-index','--',...candidates.slice(pos,end)],options);
          for(const path of stdout.split(/\r?\n/))allowed.delete(path);
        }catch(error){if((error as {code?:number}).code!==1)throw failure();}
        pos=end;
      }
      return allowed;
    }
    return await work(eligible);
  }finally{await rm(meta,{recursive:true,force:true});}
}
