import { fork } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { isProjectId, type Runner } from './contracts.ts';

type Member = Runner & {kind:'runner'; engine:'control'; token:string};
export async function projectTeams(pool:Pool, setting:string|undefined):Promise<Member[]> {
  if(!setting?.trim()) return [];
  const ids=[...new Set(setting.split(',').map(s=>s.trim()))];
  if(!ids.every(isProjectId)) throw new Error('Identifiant de projet invalide pour les équipes locales.');
  const rows=(await pool.query<{project_id:string}>(`SELECT r.project_id FROM project_repositories r JOIN projects p ON p.id=r.project_id
    WHERE r.project_id=ANY($1::text[]) AND r.remote_url='' AND p.context->>'classification' IS DISTINCT FROM 'synthetic'
    ORDER BY r.project_id`,[ids])).rows;
  return rows.flatMap(({project_id:projectId})=>{
    const suffix=projectId.length<=30?projectId:projectId.slice(0,19)+'-'+createHash('sha256').update(projectId).digest('hex').slice(0,10);
    return (['preparer','verifier'] as const).map(role=>({
      id:(role==='preparer'?'scribe-':'controle-')+suffix,projectId,role,kind:'runner',engine:'control',token:randomBytes(32).toString('base64url'),
    }));
  });
}

/** Each child receives only one project's two short-lived capabilities. No database or operator credentials. */
export function startProjectTeams(members:Member[], origin:string, signal:AbortSignal) {
  async function supervise(pair:Member[]) {
    while(!signal.aborted) {
      const child=fork(fileURLToPath(new URL('../scripts/project-team-worker.ts',import.meta.url)),[],{
        windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],execArgv:['--max-old-space-size=48'],
        env:{SystemRoot:process.env.SystemRoot},
      });
      const disconnect=()=>{if(child.connected)child.disconnect();};
      signal.addEventListener('abort',disconnect,{once:true});
      const done=new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.once('error',()=>resolve());});
      child.send({origin,tokens:pair.map(r=>r.token)},error=>{if(error) disconnect();});
      await done;
      signal.removeEventListener('abort',disconnect);
      if(!signal.aborted) await delay(1500);
    }
  }
  return Promise.all([...new Set(members.map(m=>m.projectId))].map(id=>supervise(members.filter(m=>m.projectId===id))));
}
