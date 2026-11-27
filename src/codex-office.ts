import { DatabaseSync } from 'node:sqlite';
import { openSync, closeSync, readSync, fstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute, resolve, sep } from 'node:path';
import type { Pool } from 'pg';
import type { Operator } from './contracts.ts';
import { linkedRepositoryDirectory } from './repositories.ts';

export type CodexAgent = { id:string; name:string; project:string; state:'recent'|'finished'|'working'; observedAt?:string };
type Thread = { id:string; agent_nickname:string|null; rollout_path:string; cwd:string };
const day=86400000;
const normalize=(path:string)=>process.platform==='win32'?resolve(path.replace(/^\\\\\?\\/,'')).toLowerCase():resolve(path);

type Signal = { at:number; finished:boolean };
const terminalEvents=new Set(['task_complete','turn_aborted','task_aborted','shutdown_complete']);
const workEvents=new Set(['task_started','item_completed','agent_message','exec_command_end']);
function latestSignal(lines:readonly string[]):Signal|undefined {
  for(let i=lines.length-1;i>=0;i--){
    try {
      const event=JSON.parse(lines[i]);
      if(event.type!=='event_msg')continue;
      const type=event.payload?.type;
      if(!terminalEvents.has(type) && !workEvents.has(type))continue;
      const at=Date.parse(event.timestamp);
      if(Number.isFinite(at))return {at,finished:terminalEvents.has(type)};
    } catch { /* A tail can begin or end in the middle of a JSON record. */ }
  }
}
function status(signal:Signal|undefined,now:number):CodexAgent['state'] {
  if(!signal || signal.at>now)return 'recent';
  if(signal.finished)return 'finished';
  return now-signal.at<90000?'working':'recent';
}
export function observedState(lines:readonly string[],now:number){
  return status(latestSignal(lines),now);
}

const signals=new Map<string,{size:number;modified:number;signal:Signal|undefined}>();
function readSignal(sessionRoot:string,file:string){
  const path=normalize(realpathSync.native(file)),within=relative(sessionRoot,path);
  if(!within || within==='..' || within.startsWith('..'+sep) || isAbsolute(within) || !path.endsWith('.jsonl'))return;
  const fd=openSync(path,'r');
  try {
    const {size,mtimeMs}=fstatSync(fd);
    const previous=signals.get(path);
    if(previous && previous.size===size && previous.modified===mtimeMs)return previous.signal;
    const buffer=Buffer.alloc(Math.min(size,131072));
    const length=readSync(fd,buffer,0,buffer.length,size-buffer.length);
    const signal=latestSignal(buffer.subarray(0,length).toString().split('\n'));
    if(signals.size>=512)signals.delete(signals.keys().next().value!);
    signals.set(path,{size,modified:mtimeMs,signal});
    return signal;
  } finally { closeSync(fd); }
}

export function readCodexAgents(home:string,directory:string,project:string,now=Date.now()):CodexAgent[] {
  const db=new DatabaseSync(join(home,'state_5.sqlite'),{readOnly:true});
  try {
    const root=resolve(directory);
    let sessionRoot:string|undefined;
    try { sessionRoot=normalize(realpathSync.native(join(home,'sessions'))); } catch { /* Optional journals. */ }
    const rows=db.prepare(`SELECT id, agent_nickname, rollout_path,cwd FROM threads
      WHERE archived=0 AND updated_at>=? AND cwd COLLATE NOCASE IN (?,?)
      ORDER BY updated_at DESC LIMIT 32`).all(Math.floor((now-day)/1000),root,'\\\\?\\'+root) as unknown as Thread[];
    return rows.filter(r=>normalize(r.cwd)===normalize(root) && /^[a-f0-9-]{36}$/i.test(r.id)).map(r=>{
      let signal:Signal|undefined;
      try { if(sessionRoot)signal=readSignal(sessionRoot,r.rollout_path); } catch { /* Journal unavailable. */ }
      return {id:r.id,name:r.agent_nickname||'Chat '+r.id.slice(-6),project,state:status(signal,now),
        observedAt:signal && signal.at<=now?new Date(signal.at).toISOString():undefined};
    });
  } finally { db.close(); }
}
export async function officeCodex(pool:Pool,actor:Operator,filter?:string){
  const agents:CodexAgent[]=[];
  if(process.env.STUDIO_CODEX_OFFICE!=='1' || actor.accountRole!=='admin')return {agents,unavailable:false};
  const home=process.env.CODEX_HOME||join(homedir(),'.codex');
  const client=await pool.connect();
  let unavailable=false;
  try {
    for(const project of filter?[filter]:actor.projectIds){
      try {
        const directory=await linkedRepositoryDirectory(client,actor,project);
        if(directory)agents.push(...readCodexAgents(home,directory,project));
      } catch { unavailable=true; }
    }
    return {agents,unavailable};
  } finally { client.release(); }
}
