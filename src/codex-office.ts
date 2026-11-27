import { DatabaseSync } from 'node:sqlite';
import { openSync, closeSync, readSync, fstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute, resolve, sep } from 'node:path';
import type { Pool } from 'pg';
import type { Operator } from './contracts.ts';
import { linkedRepositoryDirectory } from './repositories.ts';

export type CodexAgent = { id:string; name:string; project:string; state:'recent'|'finished'|'working' };
type Thread = { id:string; agent_nickname:string|null; rollout_path:string; cwd:string };
const day=86400000;
const normalize=(path:string)=>process.platform==='win32'?resolve(path.replace(/^\\\\\?\\/,'')).toLowerCase():resolve(path);

export function observedState(lines:string[],now:number):CodexAgent['state'] {
  for(const line of lines.reverse()){
    try {
      const event=JSON.parse(line);
      if(event.type!=='event_msg')continue;
      if(['task_complete','turn_aborted','task_aborted','shutdown_complete'].includes(event.payload?.type))return 'finished';
      if(['task_started','item_completed','agent_message','exec_command_end','token_count'].includes(event.payload?.type)){
        const age=now-Date.parse(event.timestamp);
        return age>=0 && age<90000?'working':'recent';
      }
    } catch { /* Partial or unsupported event. */ }
  }
  return 'recent';
}
const signals=new Map<string,{size:number;modified:number;checked:number;value:CodexAgent['state']}>();
function state(home:string,file:string,now:number){
  const path=normalize(file),within=relative(normalize(join(home,'sessions')),path);
  if(!within || within.startsWith('..'+sep) || isAbsolute(within) || !path.endsWith('.jsonl'))return 'recent';
  const fd=openSync(path,'r');
  try {
    const {size,mtimeMs}=fstatSync(fd);
    const previous=signals.get(path);
    if(previous && previous.size===size && previous.modified===mtimeMs && now-previous.checked<5000)return previous.value;
    const buffer=Buffer.alloc(Math.min(size,131072));
    const length=readSync(fd,buffer,0,buffer.length,size-buffer.length);
    const value=observedState(buffer.subarray(0,length).toString().split('\n'),now);
    if(signals.size>=512)signals.delete(signals.keys().next().value!);
    signals.set(path,{size,modified:mtimeMs,checked:now,value});
    return value;
  } finally { closeSync(fd); }
}

export function readCodexAgents(home:string,directory:string,project:string,now=Date.now()):CodexAgent[] {
  const db=new DatabaseSync(join(home,'state_5.sqlite'),{readOnly:true});
  try {
    const root=resolve(directory);
    const rows=db.prepare(`SELECT id, agent_nickname, rollout_path,cwd FROM threads
      WHERE archived=0 AND updated_at>=? AND cwd COLLATE NOCASE IN (?,?)
      ORDER BY updated_at DESC LIMIT 32`).all(Math.floor((now-day)/1000),root,'\\\\?\\'+root) as unknown as Thread[];
    return rows.filter(r=>normalize(r.cwd)===normalize(root) && /^[a-f0-9-]{36}$/i.test(r.id)).map(r=>{
      let status:CodexAgent['state']='recent';
      try { status=state(home,r.rollout_path,now); } catch { /* Journal unavailable. */ }
      return {id:r.id,name:r.agent_nickname||'Chat '+r.id.slice(-6),project,state:status};
    });
  } finally { db.close(); }
}
export async function officeCodex(pool:Pool,actor:Operator,filter?:string){
  if(process.env.STUDIO_CODEX_OFFICE!=='1' || actor.accountRole!=='admin')return [];
  const home=process.env.CODEX_HOME||join(homedir(),'.codex');
  const client=await pool.connect();
  const agents:CodexAgent[]=[];
  try {
    for(const project of filter?[filter]:actor.projectIds){
      try {
        const directory=await linkedRepositoryDirectory(client,actor,project);
        if(directory)agents.push(...readCodexAgents(home,directory,project));
      } catch { /* Local indexing is optional for each project. */ }
    }
    return agents;
  } finally { client.release(); }
}
