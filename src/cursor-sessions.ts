import type { Pool, PoolClient } from 'pg';
import type { Operator } from './contracts.ts';
import { assertProject, transaction } from './database.ts';

export type CursorPull = {
  project_id:string; repository:string; pr_number:number; agent_id:string; title:string;
  branch:string; state:'draft'|'open'|'closed'|'merged'; observed_at:Date;
};
type PullEvidence = { number:number; title:string; url:string; headRefName:string; state:string; isDraft:boolean; body:string };
const sessionLink=/https:\/\/cursor\.com\/agents\/(bc-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?=$|[\s)"'#?<])/gi;

// An explicit local import. Keep the corroborating PR metadata, never its description or credentials.
export async function importCursorPulls(pool:Pool, project:string, repository:string, pulls:PullEvidence[], observedAt:Date) {
  if(!/^[a-z\d][a-z\d-]*\/[a-z\d_.-]+$/i.test(repository) || !Array.isArray(pulls) || pulls.length>1000 ||
      !Number.isFinite(observedAt.getTime()) || observedAt.getTime()>Date.now()+60000) throw Error('Relevé GitHub invalide.');
  const repo=repository.toLowerCase();
  return transaction(pool,async client=>{
    const target=await client.query('SELECT 1 FROM project_repositories WHERE project_id=$1',[project]);
    if(!target.rowCount) throw Error('Projet sans dépôt enregistré.');
    let linked=0;
    for(const pr of pulls) {
      if(!Number.isSafeInteger(pr.number) || pr.number<=0 || String(pr.url).toLowerCase()!=='https://github.com/'+repo+'/pull/'+pr.number ||
        typeof pr.title!=='string' || !pr.title.trim() || pr.title.length>300 || typeof pr.body!=='string' ||
        typeof pr.headRefName!=='string' || typeof pr.isDraft!=='boolean' || !['OPEN','CLOSED','MERGED'].includes(pr.state)) throw Error('Métadonnées de PR invalides.');
      if(!pr.headRefName.startsWith('cursor/')) continue;
      const ids=new Set(Array.from(pr.body.matchAll(sessionLink),m=>m[1].toLowerCase()));
      const state=pr.state==='OPEN'&&pr.isDraft?'draft':pr.state.toLowerCase();
      for(const id of ids) {
        await client.query(`INSERT INTO cursor_pull_requests(project_id,repository,pr_number,agent_id,title,branch,state,observed_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(project_id,repository,pr_number,agent_id)
          DO UPDATE SET title=excluded.title,branch=excluded.branch,state=excluded.state,observed_at=excluded.observed_at
          WHERE excluded.observed_at>=cursor_pull_requests.observed_at`,[project,repo,pr.number,id,pr.title,pr.headRefName,state,observedAt]);
        linked++;
      }
    }
    return linked;
  });
}

export async function cursorPulls(db:Pool|PoolClient,actor:Operator,project?:string) {
  if(project) assertProject(actor,project);
  return (await db.query<CursorPull>(`SELECT project_id, repository, pr_number, agent_id, title, branch, state, observed_at
    FROM cursor_pull_requests WHERE project_id=ANY($1::text[])
    ORDER BY CASE state WHEN 'draft' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,project_id,repository,pr_number DESC,agent_id`,
    [project?[project]:actor.projectIds])).rows;
}
