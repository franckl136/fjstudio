import type { Pool } from 'pg';
import type { Operator } from './contracts.ts';
import { assertId,assertProject,notFound } from './database.ts';
import { createControlMission } from './control-room.ts';

export async function projectTeamBrief(pool:Pool,actor:Operator,project:string,observation:string,kind:string,key:string) {
  assertProject(actor,project);
  assertId(observation);
  if(!['handoff','clean'].includes(kind)) throw notFound();
  const shot=(await pool.query<{branch:string|null;local_commit:string;observed_at:Date;
    worktree:{staged:number;unstaged:number;untracked:number}}>(`SELECT o.branch,o.local_commit,o.observed_at,o.worktree
    FROM repository_observations o JOIN project_repositories r USING(project_id,repository_key)
    WHERE o.project_id=$1 AND o.id=$2 AND r.remote_url='' AND o.operation='local'`,[project,observation])).rows[0];
  if(!shot) throw notFound();
  const {staged,unstaged,untracked}=shot.worktree;
  const clean=staged===0 && unstaged===0 && untracked===0;
  const document=[
    '# Version observée','Projet '+project,'Branche '+(shot.branch??'HEAD détachée'),'Commit '+shot.local_commit,
    'Observation '+observation+' · '+shot.observed_at.toISOString(),
    '# Travail local',staged+' entrée(s) indexée(s)',unstaged+' entrée(s) modifiée(s) hors index',untracked+' entrée(s) non suivie(s)',
    clean?'Arbre de travail propre.':'Changements locaux présents.',
    '# Prochaine action',clean?'Reprendre depuis le commit indiqué.':'Examiner les différences avant de partager le travail.',
  ].join('\n');
  return createControlMission(pool,actor,project,key,{
    objective:(kind==='clean'?'Vérifier la propreté du dépôt':'Préparer la passation Git')+' · '+project,
    scope:'Relevé Git local du '+shot.observed_at.toISOString()+' · '+observation,
    constraints:'Lecture du relevé enregistré. Une vérification de propreté porte seulement sur l’arbre Git à cette date.',
    document,criteria:kind==='clean'?['Arbre de travail propre.','Commit '+shot.local_commit]:['Commit '+shot.local_commit,'# Travail local','# Prochaine action'],
    risk:'normal',durationMinutes:10,
  });
}
