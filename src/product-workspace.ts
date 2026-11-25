import type { Pool, PoolClient } from 'pg';
import type { Operator, ProjectId, Role } from './contracts.ts';
import { assertProject, transaction } from './database.ts';
import { listWorkspaceProjects } from './product-workspace-projects.ts';

export type DeskIdentity = {id: string; projectId: ProjectId; role: Role};
export type MissionDigest = {id: string; project_id: ProjectId; objective: string; status: string; at: Date; engine: 'control' | 'a1'};
type Contact = {project_id: ProjectId; runner_id: string; role: Role; at: Date; fresh: boolean};
export type AssignmentRecord = {
  id: string; project_id: ProjectId; runner_id: string; role: Role; mission_id: string; task: string;
  began: Date; finished: Date | null; state: string; live: boolean; engine: 'control' | 'a1'; objective: string;
};
type Progress = {project_id: ProjectId; state: string; total: number};
type Activity = {project_id: ProjectId; at: Date; subject: string; kind: string; href: string; actor: string | null};
type Lab = {project_id: ProjectId; id: string; profile: string; state: string; verdict: string | null; created_at: Date};
export type Desk = DeskIdentity & {
  lastSeen: Date | null; state: 'unseen' | 'offline' | 'available' | 'working' | 'verifying';
  records: AssignmentRecord[]; running: number; configured: boolean;
};

const missionSet = `
  SELECT id,project_id,objective,status,updated_at AS at,'control'::text AS engine FROM control_missions
    WHERE project_id=ANY($1::text[])
  UNION ALL
  SELECT id,project_id,CASE fixture_id WHEN 'nominal' THEN 'Mission A1 · Cas nominal' ELSE 'Mission A1 · Contrôle négatif' END,
    CASE WHEN paused_at IS NOT NULL THEN 'paused' WHEN status='succeeded' THEN 'completed' ELSE status END,
    created_at,'a1' FROM missions WHERE project_id=ANY($1::text[])`;

// All joins keep the project in the key. A runner name is never a cross-project identity.
async function desks(client: PoolClient, ids: readonly ProjectId[], configured: readonly DeskIdentity[]) {
  const args = [ids];
  const contacts = (await client.query<Contact>(`SELECT project_id,runner_id,role,max(at) AS at,bool_or(fresh) AS fresh FROM (
    SELECT project_id,runner_id,role,last_seen AS at,last_seen>now()-interval '30 seconds' AS fresh
      FROM control_contacts WHERE project_id=ANY($1::text[])
    UNION ALL
    SELECT project_id,runner_id,role,last_seen,last_seen>now()-interval '20 seconds'
      FROM runner_contacts WHERE project_id=ANY($1::text[])
  ) signals GROUP BY project_id,runner_id,role ORDER BY project_id,runner_id`, args)).rows;
  const records = (await client.query<AssignmentRecord>(`WITH recent AS (
    SELECT a.id,a.project_id,a.runner_id,t.role,a.mission_id,a.task_key AS task,a.started_at AS began,
      a.finished_at AS finished,CASE WHEN a.state='running' AND a.lease_until<=now() THEN 'expired' ELSE a.state END AS state,
      (a.state='running' AND a.lease_until>now()) AS live,'control' AS engine,m.objective
    FROM control_attempts a JOIN control_tasks t USING(project_id,mission_id,task_key)
      JOIN control_missions m ON (m.project_id,m.id)=(a.project_id,a.mission_id)
    WHERE a.project_id=ANY($1::text[])
    UNION ALL
    SELECT a.id,a.project_id,a.runner_id,a.role,a.mission_id,a.role,a.started_at,a.finished_at,
      CASE WHEN a.status='active' AND a.lease_until<=now() THEN 'expired' ELSE a.status END,
      (a.status='active' AND a.lease_until>now()),'a1','Mission A1 · ' || CASE m.fixture_id WHEN 'nominal' THEN 'Cas nominal' ELSE 'Contrôle négatif' END
    FROM attempts a JOIN missions m ON (m.project_id,m.id)=(a.project_id,a.mission_id)
    WHERE a.project_id=ANY($1::text[])
  ), ranked AS (
    SELECT *,row_number() OVER (PARTITION BY project_id,runner_id,role ORDER BY live DESC,began DESC,id DESC) AS seq
      FROM recent
  ) SELECT * FROM ranked WHERE seq <= 6 OR live ORDER BY live DESC,began DESC,id DESC`,args)).rows;
  const registry = new Map<string, Desk>();
  function ensure(identity: DeskIdentity, configured = false) {
    const key = JSON.stringify([identity.projectId,identity.id,identity.role]);
    if (!registry.has(key)) registry.set(key, {
      projectId: identity.projectId, id: identity.id, role: identity.role, configured,
      lastSeen: null, records: [], state: 'unseen', running: 0,
    });
    return registry.get(key)!;
  }
  for (const identity of configured) if (ids.includes(identity.projectId)) ensure(identity, true);
  for (const contact of contacts) {
    const desk = ensure({projectId: contact.project_id, id: contact.runner_id, role: contact.role});
    desk.lastSeen = contact.at;
    desk.state = contact.fresh ? 'available' : 'offline';
  }
  for (const record of records) {
    const desk = ensure({projectId: record.project_id, id: record.runner_id, role: record.role});
    desk.records.push(record);
    if (record.live) {
      desk.running++;
      desk.state = record.role === 'verifier' ? 'verifying' : 'working';
    } else if (desk.state === 'unseen') desk.state = 'offline';
  }
  return [...registry.values()].sort((a,b) => a.projectId.localeCompare(b.projectId) || a.id.localeCompare(b.id) || a.role.localeCompare(b.role));
}

export async function readWorkspace(pool: Pool, actor: Operator, configured: readonly DeskIdentity[], filter?: ProjectId) {
  if (filter) assertProject(actor, filter);
  const ids = filter ? [filter] : actor.projectIds;
  return transaction(pool, async client => {
    const projects = await listWorkspaceProjects(client, actor);
    const args = [ids];
    const capturedAt = (await client.query<{at: Date}>('SELECT now() AS at')).rows[0].at;
    const counts = (await client.query<Progress>(`WITH catalogue AS (${missionSet})
      SELECT project_id,status AS state,count(*)::int AS total FROM catalogue GROUP BY project_id,status`,args)).rows;
    const missions = (await client.query<MissionDigest>(`WITH catalogue AS (${missionSet})
      SELECT * FROM catalogue ORDER BY
        CASE status WHEN 'needs_approval' THEN 0 WHEN 'blocked' THEN 1 WHEN 'running' THEN 2 WHEN 'ready' THEN 3
        WHEN 'draft' THEN 4 WHEN 'paused' THEN 5 ELSE 6 END,at DESC,id DESC LIMIT 24`,args)).rows;
    const alerts = (await client.query<MissionDigest>(`WITH catalogue AS (${missionSet})
      SELECT * FROM catalogue WHERE status IN ('needs_approval','blocked','failed')
      ORDER BY CASE status WHEN 'needs_approval' THEN 0 WHEN 'blocked' THEN 1 ELSE 2 END,at DESC,id DESC LIMIT 6`,args)).rows;
    const tasks = (await client.query<Progress>(`SELECT project_id,state,count(*)::int AS total FROM (
      SELECT project_id,state FROM control_tasks WHERE project_id=ANY($1::text[])
      UNION ALL SELECT project_id,status FROM steps WHERE project_id=ANY($1::text[])
    ) all_tasks GROUP BY project_id,state`,args)).rows;
    const events = (await client.query<Activity>(`SELECT * FROM (
       SELECT e.project_id,e.at,m.objective AS subject,e.event_type AS kind,e.actor,
         '/projects/'||e.project_id||'/control/'||e.mission_id AS href
       FROM control_events e JOIN control_missions m ON (m.project_id,m.id)=(e.project_id,e.mission_id)
       WHERE e.project_id=ANY($1::text[])
       UNION ALL SELECT project_id,at,'Mission A1',type,coalesce(details->>'operatorId',details->>'runnerId'),
         '/projects/'||project_id||'/missions/'||mission_id FROM mission_events WHERE project_id=ANY($1::text[])
       UNION ALL SELECT project_id,at,profile->>'name','project_edited',actor,'/projects/'||project_id||'/settings'
         FROM project_profile_history WHERE project_id=ANY($1::text[])
       UNION ALL SELECT project_id,at,title,'knowledge_'||status,actor,'/projects/'||project_id||'/knowledge/'||id
         FROM knowledge_current WHERE project_id=ANY($1::text[])
       UNION ALL SELECT project_id,coalesce(finished_at,created_at),profile,coalesce(verdict,'lab_'||state),NULL,
         '/projects/'||project_id||'/quality/'||id FROM product_lab_runs WHERE project_id=ANY($1::text[])
    ) timeline ORDER BY at DESC,href,kind LIMIT 16`,args)).rows;
    const labs = (await client.query<Lab>(`SELECT DISTINCT ON (project_id) project_id,id,profile,state,verdict,created_at
      FROM product_lab_runs WHERE project_id=ANY($1::text[]) ORDER BY project_id,created_at DESC,id DESC`,args)).rows;
    const proposals = (await client.query<{project_id: ProjectId; total: number}>(`SELECT project_id,count(*)::int AS total
      FROM knowledge_current WHERE project_id=ANY($1::text[]) AND status='proposed' GROUP BY project_id`,args)).rows;
    const backup = 'accountRole' in actor && actor.accountRole === 'admin'
      ? (await client.query<{performed_at: Date; outcome: string; bytes: string | null}>(
        'SELECT performed_at,outcome,bytes FROM studio_backup_checks ORDER BY performed_at DESC,id DESC LIMIT 1',
      )).rows[0] ?? null : undefined;
    const agents = await desks(client,ids,configured);
    return { capturedAt, projects, counts, missions, alerts, tasks, events, labs, proposals, agents, backup };
  }, true);
}

export type Workspace = Awaited<ReturnType<typeof readWorkspace>>;
