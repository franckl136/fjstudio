import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DomainError, type Operator, type ProjectId } from './contracts.ts';
import { assertId, assertProject, notFound, transaction } from './database.ts';

export type SessionState = 'created' | 'simulated' | 'stopped' | 'revoked' | 'expired';
export type SessionAction = 'start' | 'stop' | 'revoke';

export interface LabSession {
  project_id: ProjectId;
  id: string;
  profile: 'registry-fixture-v1';
  application: 'studio-fixture';
  source_version: 'studio-fixture-v1';
  state: SessionState;
  created_by: string;
  created_at: Date;
  expires_at: Date;
}

interface LabEvent {
  state: SessionState;
  reason: 'operator' | 'deadline' | 'restored';
  actor: string;
  at: Date;
}

const fields = 'project_id,id,profile,application,source_version,state,created_by,created_at,expires_at';
const open = "state IN ('created','simulated')";
const targetStates: Record<SessionAction, SessionState> = {
  start: 'simulated',
  stop: 'stopped',
  revoke: 'revoked',
};

async function record(client: PoolClient, session: LabSession, actor: string) {
  await client.query(
    `INSERT INTO app_lab_events(project_id,session_id,state,reason,actor)
     VALUES ($1,$2,$3,'operator',$4)`,
    [session.project_id, session.id, session.state, actor],
  );
}

async function expireSessions(client: PoolClient, project: ProjectId | null) {
  const result = await client.query(
    `WITH expired AS (
       UPDATE app_lab_sessions SET state='expired'
       WHERE ${open} AND expires_at <= clock_timestamp() AND ($1::text IS NULL OR project_id=$1)
       RETURNING project_id,id
     )
     INSERT INTO app_lab_events(project_id,session_id,state,reason,actor)
     SELECT project_id,id,'expired','deadline','core' FROM expired`,
    [project],
  );
  return result.rowCount ?? 0;
}

export class AppLab {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(actor: Operator, project: ProjectId) {
    assertProject(actor, project);
    return (await this.pool.query<LabSession>(
      `SELECT ${fields} FROM app_lab_sessions WHERE project_id=$1 ORDER BY created_at DESC,id LIMIT 50`,
      [project],
    )).rows;
  }

  async detail(actor: Operator, project: ProjectId, id: string) {
    assertProject(actor, project);
    assertId(id);
    return transaction(this.pool, async client => {
      const session = (await client.query<LabSession>(
        `SELECT ${fields} FROM app_lab_sessions WHERE project_id=$1 AND id=$2`, [project,id],
      )).rows[0];
      if (!session) throw notFound();
      const events = (await client.query<LabEvent>(
        `SELECT state,reason,actor,at FROM app_lab_events
         WHERE project_id=$1 AND session_id=$2 ORDER BY seq`, [project,id],
      )).rows;
      return {session, events};
    }, true);
  }

  async create(actor: Operator, project: ProjectId, commandKey: string): Promise<LabSession> {
    assertProject(actor, project);
    assertId(commandKey);
    return transaction(this.pool, async client => {
      // Serialize capacity decisions for this project. The partial unique index is a second fence.
      await client.query('SELECT id FROM projects WHERE id=$1 FOR NO KEY UPDATE', [project]);
      await expireSessions(client, project);
      const prior = (await client.query<LabSession>(
        `SELECT ${fields} FROM app_lab_sessions WHERE project_id=$1 AND created_by=$2 AND command_key=$3`,
        [project,actor.id,commandKey],
      )).rows[0];
      if (prior) return prior;
      const occupied = await client.query(`SELECT 1 FROM app_lab_sessions WHERE project_id=$1 AND ${open}`, [project]);
      if (occupied.rowCount) {
        throw new DomainError(409,'app_lab_quota','La place du projet est occupée. Arrêtez la session ou attendez son échéance.');
      }
      const session = (await client.query<LabSession>(
        `WITH moment AS (SELECT clock_timestamp() AS at)
         INSERT INTO app_lab_sessions(project_id,id,command_key,created_by,profile,application,source_version,state,created_at,expires_at)
         SELECT $1,$2,$3,$4,'registry-fixture-v1','studio-fixture','studio-fixture-v1','created',at,at+interval '15 minutes'
         FROM moment RETURNING ${fields}`,
        [project,randomUUID(),commandKey,actor.id],
      )).rows[0];
      await record(client, session, actor.id);
      return session;
    });
  }

  async act(actor: Operator, project: ProjectId, id: string, action: SessionAction): Promise<LabSession> {
    assertProject(actor, project);
    assertId(id);
    const updated = await transaction(this.pool, async client => {
      const prior = (await client.query<LabSession>(
        `SELECT ${fields} FROM app_lab_sessions WHERE project_id=$1 AND id=$2 FOR UPDATE`,
        [project,id],
      )).rows[0];
      if (!prior) throw notFound();
      const next = targetStates[action];
      if (prior.state !== 'created' && prior.state !== 'simulated') {
        if (prior.state === next) return prior; // Retry of an acknowledged terminal action.
        throw new DomainError(409,'app_lab_terminal','Cette session est clôturée.');
      }
      // The eligibility check uses the database clock after acquiring the lock.
      if (prior.state === next) {
        await expireSessions(client,project);
        const current = (await client.query<LabSession>(
          `SELECT ${fields} FROM app_lab_sessions WHERE project_id=$1 AND id=$2`, [project,id],
        )).rows[0];
        return current.state === 'expired' ? null : current;
      }
      const session = (await client.query<LabSession>(
        `UPDATE app_lab_sessions SET state=$3 WHERE project_id=$1 AND id=$2
          AND expires_at > clock_timestamp() RETURNING ${fields}`, [project,id,next],
      )).rows[0];
      if (!session) {
        await expireSessions(client, project);
        return null;
      }
      await record(client, session, actor.id);
      return session;
    });
    if (!updated) throw new DomainError(409,'app_lab_expired','La durée de vie de la session est écoulée.');
    return updated;
  }

  async expire(): Promise<number> {
    return transaction(this.pool, client => expireSessions(client,null));
  }

  async revokeRestoredSessions(): Promise<void> {
    await this.pool.query(
      `WITH retired AS (
         UPDATE app_lab_sessions SET state='revoked' WHERE ${open} RETURNING project_id,id
       )
       INSERT INTO app_lab_events(project_id,session_id,state,reason,actor)
       SELECT project_id,id,'revoked','restored','core' FROM retired`,
    );
  }
}
