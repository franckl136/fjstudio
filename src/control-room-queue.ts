import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { digestJson, type JsonObject, type ProjectId, type Runner } from './contracts.ts';
import { assertId, notFound, transaction } from './database.ts';
import {
  controlAdapters,
  controlLimits,
  executeControl,
  type ControlAssignment,
  type TaskKey,
} from './control-room-adapters.ts';
import {
  conflict,
  interruptControl,
  lockControl,
  readControlMission,
  recordControl,
} from './control-room.ts';

type Attempt = {
  id: string;
  project_id: ProjectId;
  mission_id: string;
  runner_id: string;
  task_key: TaskKey;
  generation: number;
  state: string;
  lease_until: Date;
};
async function finishFailure(c: PoolClient, a: Attempt, reason: 'expired' | 'failed') {
  const p = [a.project_id, a.mission_id, a.task_key];
  await c.query('UPDATE control_attempts SET state=$2,finished_at=clock_timestamp() WHERE id=$1', [
    a.id,
    reason,
  ]);
  const failures = (
    await c.query(
      `UPDATE control_tasks SET failure_count=failure_count+1,
    state=CASE WHEN failure_count+1 >= $4 THEN 'blocked' ELSE 'ready' END
    WHERE project_id=$1 AND mission_id=$2 AND task_key=$3 RETURNING failure_count`,
      [...p, controlLimits.failures],
    )
  ).rows[0].failure_count;
  await recordControl(c, a.project_id, a.mission_id, 'core', 'attempt.' + reason, {
    attemptId: a.id,
    task: a.task_key,
    generation: a.generation,
    failures,
  });
  if (failures >= controlLimits.failures) {
    await interruptControl(c, a.project_id, a.mission_id, true);
    await c.query(
      "UPDATE control_missions SET status='blocked',reason='attempt_limit',revision=revision+1,updated_at=clock_timestamp() WHERE project_id=$1 AND id=$2",
      p.slice(0, 2),
    );
    await recordControl(c, a.project_id, a.mission_id, 'core', 'mission.blocked', {
      reason: 'attempt_limit',
    });
  }
}
async function sweepLocked(c: PoolClient) {
  const overdue = await c.query<{
    id: string;
    project_id: ProjectId;
  }>(`SELECT id,project_id FROM control_missions
    WHERE status IN ('ready','running','paused') AND deadline_at <= clock_timestamp()`);
  for (const m of overdue.rows) {
    await interruptControl(c, m.project_id, m.id, true);
    await c.query(
      "UPDATE control_missions SET status='blocked',reason='deadline',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1",
      [m.id],
    );
    await recordControl(c, m.project_id, m.id, 'core', 'mission.blocked', { reason: 'deadline' });
  }
  const expired = await c.query<Attempt>(
    "SELECT * FROM control_attempts WHERE state='running' AND lease_until <= clock_timestamp() ORDER BY started_at",
  );
  for (const a of expired.rows) {
    // Another failed branch of the same mission may already have withdrawn this lease.
    const active = await c.query("SELECT 1 FROM control_attempts WHERE id=$1 AND state='running'", [a.id]);
    if (active.rowCount) await finishFailure(c, a, 'expired');
  }
}
export async function sweepControl(pool: Pool) {
  return transaction(pool, async (c) => {
    await lockControl(c);
    await sweepLocked(c);
  });
}
export async function quarantineControl(pool: Pool) {
  return transaction(pool, async (c) => {
    await lockControl(c);
    const active = await c.query<{ id: string; project_id: ProjectId }>(
      `SELECT id,project_id FROM control_missions WHERE status IN ('ready','running','paused','needs_approval')`,
    );
    for (const m of active.rows) {
      await interruptControl(c, m.project_id, m.id, true);
      await c.query(
        "UPDATE control_missions SET status='blocked',reason='restored',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1",
        [m.id],
      );
      await recordControl(c, m.project_id, m.id, 'restore', 'mission.blocked', { reason: 'restored' });
    }
    await c.query('DELETE FROM control_contacts');
    return active.rowCount ?? 0;
  });
}
async function contact(c: PoolClient, r: Runner) {
  await c.query(
    `INSERT INTO control_contacts(project_id,runner_id,role,last_seen) VALUES($1,$2,$3,clock_timestamp())
    ON CONFLICT(project_id,runner_id) DO UPDATE SET last_seen=excluded.last_seen,role=excluded.role
    WHERE control_contacts.last_seen < clock_timestamp()-interval '2 seconds'`,
    [r.projectId, r.id, r.role],
  );
}
async function assignment(c: PoolClient, a: Attempt): Promise<ControlAssignment> {
  const m = await readControlMission(c, a.project_id, a.mission_id);
  const evidence =
    a.task_key === 'synthesis'
      ? (
          await c.query<{ key: TaskKey; sha256: string }>(
            `SELECT task_key AS key,sha256 FROM control_tasks
    WHERE project_id=$1 AND mission_id=$2 AND task_key IN ('structure','coverage') AND state='completed' ORDER BY task_key`,
            [a.project_id, a.mission_id],
          )
        ).rows
      : [];
  return {
    attemptId: a.id,
    missionId: m.id,
    projectId: m.project_id,
    generation: a.generation,
    task: a.task_key,
    leaseUntil: a.lease_until.toISOString(),
    version: m.contract_version,
    input: {
      objective: m.objective,
      scope: m.scope,
      constraints: m.constraints_text,
      criteria: m.criteria,
      sourceSha256: m.source_sha256,
      document: m.document,
      context: m.context,
      evidence,
    },
  };
}
export async function claimControl(pool: Pool, r: Runner): Promise<ControlAssignment | null> {
  return transaction(pool, async (c) => {
    await lockControl(c);
    await contact(c, r);
    await sweepLocked(c);
    const slots = (
      await c.query(
        `SELECT count(*)::int AS total,count(*) FILTER(WHERE project_id=$1)::int AS project,
      bool_or(runner_id=$2) AS busy FROM control_attempts WHERE state='running'`,
        [r.projectId, r.id],
      )
    ).rows[0];
    if (slots.busy || slots.total >= controlLimits.global || slots.project >= controlLimits.project)
      return null;
    const task = (
      await c.query<{ mission_id: string; task_key: TaskKey }>(
        `SELECT t.mission_id,t.task_key FROM control_tasks t
      JOIN control_missions m ON (m.project_id,m.id)=(t.project_id,t.mission_id)
      WHERE t.project_id=$1 AND t.role=$2 AND t.state='ready' AND m.status IN ('ready','running')
      AND m.deadline_at > clock_timestamp() AND NOT EXISTS (
        SELECT 1 FROM control_tasks unmet WHERE unmet.project_id=t.project_id AND unmet.mission_id=t.mission_id
        AND unmet.task_key=ANY(t.dependencies) AND unmet.state<>'completed')
      ORDER BY m.created_at,m.id,t.task_key LIMIT 1`,
        [r.projectId, r.role],
      )
    ).rows[0];
    if (!task) return null;
    const { mission_id: id, task_key: key } = task;
    const generation = (
      await c.query(
        `UPDATE control_tasks SET state='running',generation=generation+1
      WHERE project_id=$1 AND mission_id=$2 AND task_key=$3 RETURNING generation`,
        [r.projectId, id, key],
      )
    ).rows[0].generation;
    const status = await c.query(
      `UPDATE control_missions SET status='running',updated_at=clock_timestamp(),revision=revision+1
      WHERE project_id=$1 AND id=$2 AND status='ready' RETURNING id`,
      [r.projectId, id],
    );
    if (status.rowCount) await recordControl(c, r.projectId, id, 'core', 'mission.running');
    const attempt = (
      await c.query<Attempt>(
        `INSERT INTO control_attempts(id,project_id,mission_id,task_key,runner_id,generation,state,lease_until)
      SELECT $1,$2,$3,$4,$5,$6,'running',least(deadline_at,clock_timestamp()+$7*interval '1 second')
      FROM control_missions WHERE project_id=$2 AND id=$3 RETURNING *`,
        [randomUUID(), r.projectId, id, key, r.id, generation, controlLimits.leaseSeconds],
      )
    ).rows[0];
    await recordControl(c, r.projectId, id, r.id, 'attempt.claimed', {
      attemptId: attempt.id,
      task: key,
      generation,
      adapter: controlAdapters[key].id,
    });
    return assignment(c, attempt);
  });
}
async function ownedAttempt(c: PoolClient, r: Runner, id: string, generation: number) {
  assertId(id);
  const a = (
    await c.query<Attempt & { active: boolean; role: string }>(
      `SELECT a.*,t.role,
    (a.state='running' AND a.lease_until>clock_timestamp() AND m.status='running' AND m.deadline_at>clock_timestamp()
     AND t.state='running' AND t.generation=a.generation) AS active FROM control_attempts a
    JOIN control_tasks t USING(project_id,mission_id,task_key) JOIN control_missions m ON (m.project_id,m.id)=(a.project_id,a.mission_id)
    WHERE a.id=$1 AND a.project_id=$2 AND a.runner_id=$3 AND t.role=$4`,
      [id, r.projectId, r.id, r.role],
    )
  ).rows[0];
  if (!a) throw notFound();
  if (a.generation !== generation) conflict('Cette attribution a été remplacée.');
  return a;
}
export async function heartbeatControl(pool: Pool, r: Runner, id: string, generation: number) {
  return transaction(pool, async (c) => {
    await lockControl(c);
    const a = await ownedAttempt(c, r, id, generation);
    if (!a.active) conflict('Le bail est terminé.');
    await contact(c, r);
    const row = (
      await c.query(
        `UPDATE control_attempts a SET heartbeat_at=clock_timestamp(),
      lease_until=least(m.deadline_at,clock_timestamp()+$2*interval '1 second')
      FROM control_missions m WHERE a.id=$1 AND (a.project_id,a.mission_id)=(m.project_id,m.id) RETURNING a.lease_until`,
        [id, controlLimits.leaseSeconds],
      )
    ).rows[0];
    return row.lease_until as Date;
  });
}
export async function completeControl(
  pool: Pool,
  r: Runner,
  id: string,
  generation: number,
  result: JsonObject,
): Promise<boolean> {
  return transaction(pool, async (c) => {
    await lockControl(c);
    const a = await ownedAttempt(c, r, id, generation);
    const p = [a.project_id, a.mission_id, a.task_key];
    const hash = digestJson(result);
    if (a.state === 'completed') {
      const saved = (
        await c.query(
          'SELECT sha256 FROM control_tasks WHERE project_id=$1 AND mission_id=$2 AND task_key=$3',
          p,
        )
      ).rows[0];
      if (saved.sha256 === hash) return true;
      conflict('Un autre résultat a déjà été enregistré pour cette tentative.');
    }
    if (!a.active) conflict('Ce bail est expiré, interrompu ou remplacé.');
    const work = await assignment(c, a);
    if (hash !== digestJson(executeControl(work))) {
      await finishFailure(c, a, 'failed');
      return false;
    }
    await c.query("UPDATE control_attempts SET state='completed',finished_at=clock_timestamp() WHERE id=$1", [
      id,
    ]);
    await c.query(
      `UPDATE control_tasks SET state='completed',result=$4,sha256=$5,completed_at=clock_timestamp()
      WHERE project_id=$1 AND mission_id=$2 AND task_key=$3`,
      [...p, result, hash],
    );
    await recordControl(c, a.project_id, a.mission_id, r.id, 'checkpoint.accepted', {
      attemptId: id,
      generation,
      task: a.task_key,
      sha256: hash,
    });
    if (a.task_key === 'synthesis') {
      const status = result.verdict === 'PASS' ? 'completed' : 'failed';
      await c.query(
        'UPDATE control_missions SET status=$2,reason=$3,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',
        [a.mission_id, status, status === 'failed' ? 'criteria_missing' : null],
      );
      await recordControl(c, a.project_id, a.mission_id, 'core', 'mission.' + status, {
        verdict: result.verdict,
        sha256: hash,
      });
    } else {
      await c.query(
        `UPDATE control_tasks t SET state='ready' WHERE project_id=$1 AND mission_id=$2 AND state='waiting' AND NOT EXISTS(
        SELECT 1 FROM control_tasks pending WHERE pending.project_id=t.project_id AND pending.mission_id=t.mission_id
        AND pending.task_key=ANY(t.dependencies) AND pending.state<>'completed')`,
        p.slice(0, 2),
      );
    }
    return true;
  });
}
