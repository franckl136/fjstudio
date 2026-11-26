import type {Pool} from 'pg';
import {DomainError,type Operator} from './contracts.ts';
import {assertProject} from './database.ts';

export const followLabels={priority:'Prioritaire',normal:'Suivi',standby:'En veille'} as const;
export type Follow={project_id:string;attention:keyof typeof followLabels;note:string;revision:number};
export async function projectFollow(pool:Pool,actor:Operator,project:string){
  assertProject(actor,project);
  return (await pool.query<Follow>('SELECT project_id,attention,note,revision FROM studio_project_follow WHERE account_id=$1 AND project_id=$2',[actor.id,project])).rows[0];
}
export async function saveProjectFollow(pool:Pool,actor:Operator,project:string,input:Record<string,unknown>){
  assertProject(actor,project);
  if(!actor.accountRole||actor.accountRole==='viewer')throw new DomainError(403,'follow_access','Un compte opérateur ou administrateur est requis.');
  if(typeof input.attention!=='string'||!Object.hasOwn(followLabels,input.attention)||typeof input.note!=='string'||
      input.note.length>280||/[\u0000-\u001f]/.test(input.note)||!/^\d{1,9}$/.test(String(input.revision)))
    throw new DomainError(400,'follow_input','Vérifiez le suivi et la note de reprise.');
  const values=[actor.id,project,input.attention,input.note.trim()];
  const result=Number(input.revision)===0
    ?await pool.query('INSERT INTO studio_project_follow(account_id,project_id,attention,note,revision) VALUES($1,$2,$3,$4,1) ON CONFLICT DO NOTHING',values)
    :await pool.query('UPDATE studio_project_follow SET attention=$3,note=$4,revision=revision+1 WHERE account_id=$1 AND project_id=$2 AND revision=$5',[...values,Number(input.revision)]);
  if(!result.rowCount)throw new DomainError(409,'follow_conflict','Le suivi a changé dans un autre onglet. Rechargez le projet avant de réessayer.');
}
