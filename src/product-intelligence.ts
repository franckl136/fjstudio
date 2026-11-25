import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ProjectId } from './contracts.ts';

export type MissionKnowledge = { id: string; version: number; title: string; content: string; digest: string };

/** The task stores these exact revisions. Only a validated fact may enter a new plan. */
export async function selectMissionKnowledge(client: PoolClient, project: ProjectId, goal: string, criteria: string[]): Promise<MissionKnowledge[]> {
  const terms = [...new Set((goal + ' ' + criteria.join(' ')).toLocaleLowerCase('fr').match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0,32);
  const result = await client.query<{id:string; version:number; title:string; content:string}>(`
    SELECT k.id,k.version,k.title,k.content FROM knowledge_current k
    CROSS JOIN LATERAL (SELECT count(*) AS matches FROM unnest($2::text[]) term
      WHERE strpos(lower(k.title || ' ' || k.content),term)>0) score
    WHERE k.project_id=$1 AND k.status='validated' AND (score.matches>0 OR k.kind IN ('architecture','goal','risk'))
    ORDER BY score.matches DESC,k.at DESC,k.id LIMIT 5`, [project,terms]);
  return result.rows.map(row => ({...row, digest:createHash('sha256').update(row.content).digest('hex')}));
}
