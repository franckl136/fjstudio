import type { Pool,PoolClient } from 'pg';
import { DomainError,type Operator } from './contracts.ts';
import { assertId,assertProject,notFound,transaction } from './database.ts';

import { labSampleKeys } from './product-lab-source.ts';

const evidence=`SELECT id, 'git' AS kind, observed_at AS at, coalesce(branch,'HEAD')||' · '||left(local_commit,12) AS title,
  '/projects/'||project_id||'/repository?observation='||id AS href FROM repository_observations WHERE project_id=$1
  UNION ALL SELECT id,'lab',finished_at,(CASE WHEN source_key=ANY($2::text[]) THEN 'Démonstration Studio' ELSE 'Fichier du projet' END)||' · '||profile||' · '||verdict||' · '||left(commit_sha,12),
    '/projects/'||project_id||'/quality/'||id FROM product_lab_runs WHERE project_id=$1 AND state='finished'
  UNION ALL SELECT h.id,'schema',h.captured_at,s.label||' · '||s.environment||' · '||left(h.digest,12),
    '/projects/'||s.project_id||'/database?source='||s.id||'&snapshot='||h.id
    FROM explorer_snapshots h JOIN explorer_sources s ON s.id=h.source_id WHERE s.project_id=$1 AND s.revoked_at IS NULL`;
type Entry={id:string;kind:string;title:string;href:string;at:Date};
export async function knowledgeEvidence(db:PoolClient,project:string,id:string,canAttach:boolean) {
  const attached=(await db.query<Entry & {version:number}>(`WITH items AS (${evidence}) SELECT i.*,l.version
    FROM knowledge_evidence l JOIN items i ON i.id=l.evidence_id AND i.kind=l.kind
    WHERE l.project_id=$1 AND l.knowledge_id=$3 ORDER BY l.version DESC,l.at DESC`,[project,labSampleKeys,id])).rows;
  if (!canAttach) return {attached,choices:[]};
  const choices=(await db.query<Entry>(`WITH items AS (${evidence}), ranked AS (SELECT *,row_number() OVER(PARTITION BY kind ORDER BY at DESC,id) AS n FROM items)
    SELECT id,kind,title,href,at FROM ranked WHERE n<=12 ORDER BY kind,at DESC`,[project,labSampleKeys])).rows;
  return {attached,choices};
}
export async function attachEvidence(pool:Pool,actor:Operator,project:string,id:string,version:number,selection:string) {
  assertProject(actor,project);assertId(id);
  if(actor.accountRole==='viewer') throw new DomainError(403,'reader','Accès opérateur requis.');
  const match=/^(git|lab|schema)\/([a-f0-9-]{36})$/.exec(selection);
  if(!match||!Number.isInteger(version)||version<1) throw notFound();
  assertId(match[2]);
  await transaction(pool,async c=>{
    await c.query('SELECT id FROM projects WHERE id=$1 FOR NO KEY UPDATE',[project]);
    const current=(await c.query('SELECT status,version FROM knowledge_current WHERE project_id=$1 AND id=$2',[project,id])).rows[0];
    if(!current)throw notFound();
    if(current.version!==version||current.status!=='proposed')throw new DomainError(409,'knowledge_version','Seule la proposition courante peut recevoir une preuve.');
    const exists=await c.query(`WITH items AS (${evidence}) SELECT id FROM items WHERE kind=$3 AND id=$4`,[project,labSampleKeys,match[1],match[2]]);
    if(!exists.rowCount) throw notFound();
    await c.query('INSERT INTO knowledge_evidence(project_id,knowledge_id,version,kind,evidence_id,actor) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
      [project,id,version,match[1],match[2],actor.id]);
  });
}
