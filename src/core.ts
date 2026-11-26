import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Pool, PoolClient } from 'pg';
import {
  DomainError,
  digestJson,
  type Assignment,
  type FixtureId,
  type JsonObject,
  type Operator,
  type ProjectId,
  type Role,
  type Runner,
} from './contracts.ts';
import { PLAN, PLAN_VERSION, getFixture, prepare, verify } from './plan.ts';
import { AppLab } from './app-lab.ts';
import { Repositories, freezeRepository, readMissionRepository } from './repositories.ts';
import { missionContract, requireCapability } from './agents.ts';
import { transaction, notFound, assertProject, assertId } from './database.ts';
import { Knowledge, contextSources, freezeContext, readContext } from './knowledge.ts';

type MissionStatus = 'ready' | 'running' | 'succeeded' | 'failed' | 'cancelled';
type AttemptStatus = 'active' | 'completed' | 'expired' | 'cancelled';
type StepStatus = MissionStatus | 'waiting';

interface ProjectRow {
  id: ProjectId;
  name: string;
  context: JsonObject;
}

interface MissionRow {
  id: string;
  project_id: ProjectId;
  fixture_id: FixtureId;
  fixture: JsonObject;
  plan_version: string;
  plan: JsonObject;
  status: MissionStatus;
  reason: string | null;
  max_attempts: number;
  lease_ms: number;
  created_at: Date;
  deadline_at: Date;
  paused_at: Date | null;
}

interface StepRow {
  role: Role;
  status: StepStatus;
  generation: number;
}

interface AttemptRow {
  id: string;
  mission_id: string;
  role: Role;
  generation: number;
  runner_id: string;
  status: AttemptStatus;
  lease_until: Date;
}

interface CheckpointRow {
  role: Role;
  attempt_id: string;
  created_at: Date;
  artifact: JsonObject;
  digest: string;
}

interface EventRow {
  type: string;
  role: Role | null;
  at: Date;
  details: JsonObject | null;
}

interface CoreOptions {
  leaseMs?: number;
  horizonMs?: number;
  maxAttempts?: number;
}

const migrationDir = new URL('../migrations/', import.meta.url);




export async function migrationNames(): Promise<string[]> {
  return (await readdir(migrationDir)).filter(name => /^\d+[-_].+\.sql$/.test(name)).sort();
}

export async function migrate(pool: Pool): Promise<void> {
  const names = await migrationNames();
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(8442, 1)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        digest text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);
    for (const name of names) {
      const source = await readFile(new URL(name, migrationDir), 'utf8');
      const normalized = source.replaceAll('\r\n','\n');
      const digest = createHash('sha256').update(normalized).digest('hex');
      const applied = (await client.query<{ digest: string }>(
        'SELECT digest FROM schema_migrations WHERE name = $1',
        [name],
      )).rows[0];
      if (applied) {
        // A1 hashed the working tree bytes. Accept that historical Windows representation.
        const windowsDigest = createHash('sha256').update(normalized.replaceAll('\n','\r\n')).digest('hex');
        if (applied.digest !== digest && applied.digest !== windowsDigest) throw new Error(`Migration modifiée après application : ${name}`);
        continue;
      }
      await client.query(source);
      await client.query('INSERT INTO schema_migrations (name, digest) VALUES ($1, $2)', [name, digest]);
    }
  });
}

function positiveInt(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new Error(`Paramètre Core hors limites : ${name}`);
  }
  return value;
}



function missionSummary(mission: MissionRow) {
  return {
    id: mission.id,
    projectId: mission.project_id,
    fixtureId: mission.fixture_id,
    status: mission.paused_at ? 'paused' as const : mission.status,
    reason: mission.reason,
    planVersion: mission.plan_version,
    createdAt: mission.created_at.toISOString(),
    deadlineAt: mission.deadline_at.toISOString(),
  };
}

async function recordEvent(
  client: PoolClient,
  mission: Pick<MissionRow, 'id' | 'project_id'>,
  type: string,
  role: Role | null = null,
  details: JsonObject | null = null,
): Promise<void> {
  await client.query(
    'INSERT INTO mission_events (project_id, mission_id, type, role, details) VALUES ($1, $2, $3, $4, $5)',
    [mission.project_id, mission.id, type, role, details],
  );
}

async function lockMission(client: PoolClient, projectId: ProjectId, missionId: string): Promise<MissionRow> {
  const { rows } = await client.query<MissionRow>(
    'SELECT * FROM missions WHERE project_id = $1 AND id = $2 FOR UPDATE',
    [projectId, missionId],
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function preparerArtifact(client: PoolClient, mission: MissionRow): Promise<JsonObject> {
  const { rows } = await client.query<CheckpointRow>(
    `SELECT artifact, digest FROM checkpoints
     WHERE project_id = $1 AND mission_id = $2 AND role = 'preparer'`,
    [mission.project_id, mission.id],
  );
  if (!rows[0] || digestJson(rows[0].artifact) !== rows[0].digest) {
    throw new DomainError(409, 'invalid_checkpoint', 'Le livrable du préparateur est absent ou incohérent.');
  }
  return rows[0].artifact;
}

export class Core {
  readonly knowledge: Knowledge;
  readonly appLab: AppLab;
  readonly repositories: Repositories;
  readonly pool: Pool;
  private leaseMs: number;
  private horizonMs: number;
  private maxAttempts: number;

  constructor(pool: Pool, options: CoreOptions = {}) {
    this.pool = pool;
    this.knowledge = new Knowledge(pool);
    this.appLab = new AppLab(pool);
    this.repositories = new Repositories(pool);
    this.leaseMs = positiveInt(options.leaseMs ?? 30_000, 'leaseMs');
    this.horizonMs = positiveInt(options.horizonMs ?? 15 * 60_000, 'horizonMs');
    this.maxAttempts = positiveInt(options.maxAttempts ?? 3, 'maxAttempts');
  }

  async listProjects(actor: Operator) {
    const { rows } = await this.pool.query<ProjectRow>(
      'SELECT id, name, context FROM projects WHERE id = ANY($1::text[]) ORDER BY id',
      [actor.projectIds],
    );
    return rows;
  }

  async getProject(actor: Operator, projectId: ProjectId) {
    assertProject(actor, projectId);

    const project = (await this.pool.query<ProjectRow>(
      'SELECT id, name, context FROM projects WHERE id = $1',
      [projectId],
    )).rows[0];
    if (!project) throw notFound();
    const { rows } = await this.pool.query<MissionRow>(
      'SELECT * FROM missions WHERE project_id = $1 ORDER BY created_at DESC, id DESC',
      [projectId],
    );
    return { ...project, missions: rows.map(missionSummary) };
  }

  async createMission(actor: Operator, projectId: ProjectId, fixtureId: FixtureId, commandKey: string, relaunchOf?: string) {
    assertProject(actor, projectId);
    if (fixtureId !== 'nominal' && fixtureId !== 'incorrect') {
      throw new DomainError(400, 'invalid_fixture', 'Choisir un jeu synthétique du catalogue.');
    }
    if (typeof commandKey !== 'string' || !commandKey.trim() || commandKey.length > 160) {
      throw new DomainError(400, 'invalid_command_key', 'Clé de commande invalide.');
    }
    return transaction(this.pool, async (client) => {
      if (relaunchOf !== undefined) {
        assertId(relaunchOf);
        const parent = await lockMission(client, projectId, relaunchOf);
        if (!['failed','cancelled'].includes(parent.status) || parent.fixture_id !== fixtureId) {
          throw new DomainError(409,'relaunch_unavailable','Seule une mission échouée ou annulée peut être relancée avec la même fixture.');
        }
      }
      const id = randomUUID();
      const result = await client.query<MissionRow>(
        `WITH moment AS MATERIALIZED (SELECT clock_timestamp() AS now)
         INSERT INTO missions (
           id, project_id, created_by, command_key, fixture_id, fixture, plan_version,
           plan, status, max_attempts, lease_ms, created_at, deadline_at
         )
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, 'ready', $9, $10,
                now, now + $11::int * interval '1 millisecond'
         FROM moment
         ON CONFLICT (project_id, created_by, command_key) DO NOTHING
         RETURNING *`,
        [
          id, projectId, actor.id, commandKey, fixtureId, getFixture(projectId, fixtureId),
          PLAN_VERSION, { ...PLAN, execution: missionContract() }, this.maxAttempts, this.leaseMs, this.horizonMs,
        ],
      );
      const mission = result.rows[0];
      if (!mission) {
        const prior = (await client.query<{id:string;fixture_id:FixtureId;parent:string|null}>(
          `SELECT m.id,m.fixture_id,(SELECT details->>'relaunchOf' FROM mission_events e
              WHERE e.project_id=m.project_id AND e.mission_id=m.id AND e.type='mission_created' LIMIT 1) AS parent
            FROM missions m WHERE project_id=$1 AND created_by=$2 AND command_key=$3`,
          [projectId, actor.id, commandKey],
        )).rows[0];
        if (!prior || prior.fixture_id !== fixtureId || (prior.parent ?? undefined) !== relaunchOf) {
          throw new DomainError(409, 'command_conflict', 'Cette clé est déjà liée à une autre demande.');
        }
        return { id: prior.id };
      }
      await client.query(
        `INSERT INTO steps (project_id, mission_id, role, status)
         VALUES ($1, $2, 'preparer', 'ready'), ($1, $2, 'verifier', 'waiting')`,
        [projectId, id],
      );
      await freezeContext(client, projectId, id, fixtureId);
      await freezeRepository(client, projectId, id);
      await recordEvent(client, mission, 'mission_created', null, { fixtureId, planVersion: PLAN_VERSION, operatorId: actor.id, ...(relaunchOf ? { relaunchOf } : {}) });
      await recordEvent(client, mission, 'step_ready', 'preparer');
      return { id };
    });
  }

  async getMission(actor: Operator, projectId: ProjectId, missionId: string) {
    assertProject(actor, projectId);
    assertId(missionId);

    return transaction(this.pool, async (client) => {
      const key = [projectId, missionId];
      const mission = (await client.query<MissionRow>(
        'SELECT * FROM missions WHERE project_id = $1 AND id = $2',
        key,
      )).rows[0];
      if (!mission) throw notFound();
      const { rows: steps } = await client.query<StepRow>(
        'SELECT role, status FROM steps WHERE project_id = $1 AND mission_id = $2 ORDER BY role',
        key,
      );
      const { rows: attempts } = await client.query<AttemptRow>(
        'SELECT * FROM attempts WHERE project_id = $1 AND mission_id = $2 ORDER BY generation',
        key,
      );
      const { rows: checkpoints } = await client.query<CheckpointRow>(
        'SELECT role, artifact, digest, attempt_id, created_at FROM checkpoints WHERE project_id = $1 AND mission_id = $2',
        key,
      );
      const { rows: events } = await client.query<EventRow>(
        'SELECT type, role, at, details FROM mission_events WHERE project_id = $1 AND mission_id = $2 ORDER BY id',
        key,
      );
      return {
        ...missionSummary(mission),
        plan: mission.plan,
        context: await readContext(client, projectId, missionId),
        contextSources: await contextSources(client, projectId, missionId),
        repository: await readMissionRepository(client, projectId, missionId),
        steps: steps.map(({ role, status }) => {
          const checkpoint = checkpoints.find((item) => item.role === role);
          return {
            role,
            status,
            attempts: attempts.filter((attempt) => attempt.role === role).map((attempt) => ({
              id: attempt.id,
              generation: attempt.generation,
              status: attempt.status,
              runnerId: attempt.runner_id,
              leaseUntil: attempt.lease_until.toISOString(),
            })),
            checkpoint: checkpoint ? { artifact: checkpoint.artifact, digest: checkpoint.digest, recordedAt: checkpoint.created_at.toISOString(), attemptId: checkpoint.attempt_id } : null,
          };
        }),
        events: events.map((event) => ({
          type: event.type,
          ...(event.role ? { role: event.role } : {}),
          at: event.at.toISOString(),
          ...(event.details ? { details: event.details } : {}),
        })),
      };
    }, true);
  }

  async claim(runner: Runner): Promise<Assignment | null> {
    requireCapability(runner.role,'assignment.claim');
    await this.pool.query(`INSERT INTO runner_contacts(project_id,runner_id,role,last_seen) VALUES ($1,$2,$3,clock_timestamp())
      ON CONFLICT(project_id,runner_id) DO UPDATE SET last_seen=excluded.last_seen,role=excluded.role
      WHERE runner_contacts.last_seen < now() - interval '5 seconds'`,[runner.projectId,runner.id,runner.role]);
    await this.sweepExpired(runner.projectId);
    return transaction(this.pool, async (client) => {
      const mission = (await client.query<MissionRow>(
        `SELECT m.* FROM missions m
         JOIN steps s ON s.project_id = m.project_id AND s.mission_id = m.id
         WHERE m.project_id = $1 AND s.role = $2 AND m.plan_version = $3 AND s.status = 'ready'
           AND m.status IN ('ready', 'running') AND m.paused_at IS NULL AND m.deadline_at > clock_timestamp()
         ORDER BY m.created_at, m.id
         LIMIT 1 FOR UPDATE OF m SKIP LOCKED`,
        [runner.projectId, runner.role, PLAN_VERSION],
      )).rows[0];
      if (!mission) return null;
      const step = (await client.query<StepRow>(
        'SELECT * FROM steps WHERE project_id = $1 AND mission_id = $2 AND role = $3 FOR UPDATE',
        [runner.projectId, mission.id, runner.role],
      )).rows[0];
      if (step.status !== 'ready' || step.generation >= mission.max_attempts) return null;
      const input = runner.role === 'preparer' ? mission.fixture : await preparerArtifact(client, mission);
      const attemptId = randomUUID();
      const generation = step.generation + 1;
      const attempt = (await client.query<{ lease_until: Date }>(
        `WITH moment AS MATERIALIZED (SELECT clock_timestamp() AS now)
         INSERT INTO attempts (
           id, project_id, mission_id, role, generation, runner_id, status, started_at, lease_until
         )
         SELECT $1, m.project_id, m.id, $4, $5, $6, 'active', now,
                LEAST(m.deadline_at, now + m.lease_ms * interval '1 millisecond')
         FROM missions m CROSS JOIN moment
         WHERE m.project_id = $2 AND m.id = $3
           AND m.status IN ('ready', 'running') AND m.paused_at IS NULL AND m.deadline_at > now
         RETURNING lease_until`,
        [attemptId, runner.projectId, mission.id, runner.role, generation, runner.id],
      )).rows[0];
      if (!attempt) return null;
      await client.query(
        `UPDATE steps SET status = 'running', generation = $4
         WHERE project_id = $1 AND mission_id = $2 AND role = $3`,
        [runner.projectId, mission.id, runner.role, generation],
      );
      await client.query(
        "UPDATE missions SET status = 'running', reason = NULL WHERE project_id = $1 AND id = $2",
        [runner.projectId, mission.id],
      );
      await recordEvent(client, mission, 'attempt_claimed', runner.role, { attemptId, generation, runnerId: runner.id });
      return {
        attemptId,
        generation,
        missionId: mission.id,
        projectId: runner.projectId,
        role: runner.role,
        fixtureId: mission.fixture_id,
        leaseUntil: attempt.lease_until.toISOString(),
        input,
        inputDigest: digestJson(input),
        context: await readContext(client, runner.projectId, mission.id),
        planVersion: mission.plan_version,
      };
    });
  }

  async complete(runner: Runner, attemptId: string, generation: number, result: JsonObject): Promise<void> {
    assertId(attemptId);
    await transaction(this.pool, async (client) => {
      const scope = [attemptId, runner.projectId, runner.role, runner.id];
      const locate = `FROM attempts WHERE id = $1 AND project_id = $2 AND role = $3 AND runner_id = $4`;
      const lookup = (await client.query<Pick<AttemptRow, 'mission_id'>>(`SELECT mission_id ${locate}`, scope)).rows[0];
      if (!lookup) throw notFound();
      const mission = await lockMission(client, runner.projectId, lookup.mission_id);
      const { rows: steps } = await client.query<StepRow>(
        'SELECT * FROM steps WHERE project_id = $1 AND mission_id = $2 ORDER BY role FOR UPDATE',
        [runner.projectId, mission.id],
      );
      const step = steps.find((item) => item.role === runner.role);
      const attempt = (await client.query<AttemptRow>(`SELECT * ${locate} FOR UPDATE`, scope)).rows[0];
      if (!attempt || attempt.status !== 'active' || attempt.generation !== generation ||
          step?.status !== 'running' || step.generation !== generation || mission.status !== 'running') {
        throw new DomainError(409, 'stale_attempt', 'Cette tentative ne peut plus valider de résultat.');
      }

      const finish = await client.query(
        `WITH moment AS MATERIALIZED (SELECT clock_timestamp() AS now)
         UPDATE attempts a SET status = 'completed', finished_at = now
         FROM missions m CROSS JOIN moment
         WHERE a.id = $1 AND a.project_id = m.project_id AND a.mission_id = m.id
           AND a.status = 'active' AND a.lease_until > now AND m.deadline_at > now`,
        [attemptId],
      );
      if (finish.rowCount !== 1) {
        throw new DomainError(409, 'stale_attempt', 'Le bail ou l’horizon de cette tentative est expiré.');
      }
      requireCapability(runner.role,'checkpoint.submit');
      requireCapability(runner.role, step.role === 'preparer' ? 'artifact.prepare' : 'artifact.verify');
      const expected = runner.role === 'preparer'
        ? prepare(mission.fixture, await readContext(client, runner.projectId, mission.id))
        : verify(mission.fixture, await preparerArtifact(client, mission));
      const digest = digestJson(expected);
      if (digestJson(result) !== digest) {
        throw new DomainError(422, 'invalid_result', 'Le résultat ne correspond pas à la preuve synthétique attendue.');
      }
      const accepted = runner.role === 'preparer' || expected.passed === true;
      const finalStatus = accepted ? 'succeeded' : 'failed';
      const key = [runner.projectId, mission.id, runner.role];
      await client.query(
        `INSERT INTO checkpoints (project_id, mission_id, role, attempt_id, artifact, digest)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [...key, attemptId, expected, digest],
      );
      await client.query(
        'UPDATE steps SET status = $4 WHERE project_id = $1 AND mission_id = $2 AND role = $3',
        [...key, finalStatus],
      );
      await recordEvent(client, mission, 'checkpoint_saved', runner.role, { attemptId, digest, runnerId: runner.id });
      if (runner.role === 'preparer') {
        await client.query(
          "UPDATE steps SET status = 'ready' WHERE project_id = $1 AND mission_id = $2 AND role = 'verifier' AND status = 'waiting'",
          [runner.projectId, mission.id],
        );
        await recordEvent(client, mission, 'step_ready', 'verifier');
      } else {
        const reason = accepted ? null : 'quality_rejected';
        await client.query(
          'UPDATE missions SET status = $3, reason = $4 WHERE project_id = $1 AND id = $2',
          [runner.projectId, mission.id, finalStatus, reason],
        );
        await recordEvent(client, mission, accepted ? 'mission_succeeded' : 'mission_failed', runner.role, { reason });
      }
    });
  }

  async cancelMission(actor: Operator, projectId: ProjectId, missionId: string): Promise<void> {
    assertProject(actor, projectId);
    assertId(missionId);
    await transaction(this.pool, async (client) => {
      const mission = await lockMission(client, projectId, missionId);
      if (mission.status === 'cancelled') return;
      if (mission.status !== 'ready' && mission.status !== 'running') {
        throw new DomainError(409, 'terminal_mission', 'La mission est déjà clôturée.');
      }
      const key = [projectId, missionId];
      const { rows: attempts } = await client.query<AttemptRow>(
        `UPDATE attempts SET status = 'cancelled', finished_at = clock_timestamp()
         WHERE project_id = $1 AND mission_id = $2 AND status = 'active' RETURNING *`,
        key,
      );
      for (const attempt of attempts) {
        await recordEvent(client, mission, 'attempt_cancelled', attempt.role, { attemptId: attempt.id });
      }
      await client.query(
        `UPDATE steps SET status = 'cancelled'
         WHERE project_id = $1 AND mission_id = $2 AND status IN ('waiting', 'ready', 'running')`,
        key,
      );
      await client.query(
        "UPDATE missions SET status = 'cancelled', paused_at=NULL, reason = 'operator_cancelled' WHERE project_id = $1 AND id = $2",
        key,
      );
      await recordEvent(client, mission, 'mission_cancelled', null, { operatorId: actor.id });
    });
  }

  async setPaused(actor: Operator, project: ProjectId, id: string, paused: boolean) {
    assertProject(actor,project);
    assertId(id);
    await transaction(this.pool,async client => {
      const mission = await lockMission(client,project,id);
      if (!['ready','running'].includes(mission.status) || Boolean(mission.paused_at) === paused) {
        throw new DomainError(409,'transition','Cette transition ne correspond plus à l’état de la mission.');
      }
      if (paused) {
        const result = await client.query(`UPDATE missions m SET paused_at=clock_timestamp()
          WHERE m.project_id=$1 AND m.id=$2 AND m.deadline_at>clock_timestamp() AND NOT EXISTS
          (SELECT 1 FROM attempts WHERE project_id=$1 AND mission_id=$2 AND status='active')`,[project,id]);
        if (!result.rowCount) throw new DomainError(409,'pause_unavailable','La suspension exige une mission dans son horizon et sans tentative active.');
      } else {
        await client.query(`UPDATE missions SET deadline_at=deadline_at+(clock_timestamp()-paused_at),paused_at=NULL
          WHERE project_id=$1 AND id=$2`,[project,id]);
      }
      await recordEvent(client,mission,paused?'mission_paused':'mission_resumed',null,{operatorId:actor.id});
    });
  }

  async agentActivity(actor: Operator) {
    return (await this.pool.query<{
      project_id:ProjectId; runner_id:string; role:Role; last_seen:Date|null; fresh:boolean;
      mission_id:string|null; active_engine:string|null; attempts:number; completed:number; observed:string[];
    }>(`WITH signals AS (
        SELECT project_id,runner_id,role,last_seen,last_seen>now()-interval '20 seconds' fresh FROM runner_contacts WHERE project_id=ANY($1)
        UNION ALL SELECT project_id,runner_id,role,last_seen,last_seen>now()-interval '30 seconds' FROM control_contacts WHERE project_id=ANY($1)
      ), contacts AS (
        SELECT project_id,runner_id,role,max(last_seen) last_seen,bool_or(fresh) fresh FROM signals GROUP BY project_id,runner_id,role
      ), work AS (
        SELECT project_id,runner_id,role,mission_id,started_at,'a1' engine,role task,status='completed' done,status='active' AND lease_until>now() live FROM attempts WHERE project_id=ANY($1)
        UNION ALL SELECT a.project_id,a.runner_id,t.role,a.mission_id,a.started_at,'control',a.task_key,a.state='completed',a.state='running' AND a.lease_until>now()
          FROM control_attempts a JOIN control_tasks t USING(project_id,mission_id,task_key) WHERE a.project_id=ANY($1)
      ), totals AS (
        SELECT project_id,runner_id,role,count(*)::int attempts,count(*) FILTER(WHERE done)::int completed,
          (array_agg(mission_id ORDER BY started_at DESC) FILTER(WHERE live))[1] mission_id,
          (array_agg(engine ORDER BY started_at DESC) FILTER(WHERE live))[1] active_engine,
          array_agg(DISTINCT task ORDER BY task) FILTER(WHERE done) observed FROM work GROUP BY project_id,runner_id,role
      ) SELECT project_id,runner_id,role,last_seen,coalesce(fresh,false) OR mission_id IS NOT NULL fresh,mission_id,active_engine,
        coalesce(attempts,0) attempts,coalesce(completed,0) completed,coalesce(observed,'{}') observed
        FROM contacts FULL JOIN totals USING(project_id,runner_id,role) ORDER BY project_id,runner_id`,[actor.projectIds])).rows;
  }

  async overview(actor: Operator) {
    return transaction(this.pool,async client => {
      const args = [actor.projectIds];
      const projects = (await client.query<ProjectRow>('SELECT * FROM projects WHERE id=ANY($1) ORDER BY id',args)).rows;
      const counts = (await client.query<{status:string;count:number}>(`SELECT CASE WHEN paused_at IS NOT NULL THEN 'paused' ELSE status END AS status,
        count(*)::int AS count FROM missions WHERE project_id=ANY($1) GROUP BY 1`,args)).rows;
      const recent = (await client.query<MissionRow>(`SELECT * FROM missions WHERE project_id=ANY($1)
        ORDER BY (status IN ('ready','running')) DESC, created_at DESC,id LIMIT 24`,args)).rows.map(missionSummary);
      const events = (await client.query<EventRow & {mission_id:string;project_id:ProjectId}>(`SELECT project_id,mission_id,type,role,at
        FROM mission_events WHERE project_id=ANY($1) ORDER BY id DESC LIMIT 24`,args)).rows;
      const contacts = (await client.query<{project_id: ProjectId;runner_id:string;role:Role;last_seen:Date;fresh:boolean;mission_id:string|null}>(`SELECT r.*,
        r.last_seen > clock_timestamp()-interval '20 seconds' AS fresh,
        (SELECT a.mission_id FROM attempts a WHERE a.project_id=r.project_id AND a.runner_id=r.runner_id
          AND a.status='active' AND a.lease_until>clock_timestamp() ORDER BY started_at DESC LIMIT 1) AS mission_id
        FROM runner_contacts r WHERE r.project_id=ANY($1) ORDER BY r.project_id,r.role,r.runner_id`,args)).rows;
      const proposals = (await client.query<{project_id:ProjectId;count:number}>(`SELECT project_id,count(*)::int AS count FROM knowledge_current
        WHERE project_id=ANY($1) AND status='proposed' GROUP BY project_id ORDER BY project_id`,args)).rows;
      const failures = (await client.query<MissionRow>(`SELECT * FROM missions WHERE project_id=ANY($1)
        AND status='failed' ORDER BY created_at DESC,id LIMIT 8`,args)).rows.map(missionSummary);
      const conflicts = (await client.query<{project_id:ProjectId;first_id:string;first_title:string}>(`SELECT project_id,first_id,first_title
        FROM knowledge_disagreements WHERE project_id=ANY($1) ORDER BY project_id,first_id,second_id LIMIT 12`,args)).rows;
      return {projects,counts,recent,events,contacts,proposals,failures,conflicts};
    },true);
  }

  async sweepExpired(projectId?: ProjectId, missionId?: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      const { rows } = await client.query<MissionRow>(
        `SELECT m.* FROM missions m
         WHERE m.status IN ('ready', 'running') AND m.paused_at IS NULL AND ($1::text IS NULL OR m.project_id = $1)
           AND ($2::uuid IS NULL OR m.id = $2)
           AND (m.deadline_at <= clock_timestamp() OR EXISTS (
             SELECT 1 FROM attempts a
             WHERE a.project_id = m.project_id AND a.mission_id = m.id
               AND a.status = 'active' AND a.lease_until <= clock_timestamp()
           ))
         ORDER BY m.id LIMIT 64 FOR UPDATE OF m SKIP LOCKED`,
        [projectId ?? null, missionId ?? null],
      );
      for (const mission of rows) await this.expireLocked(client, mission);
    });
  }

  // Call before admitting work on a fresh restore, with the original runners stopped.
  async recoverRestoredState(): Promise<void> {
    await transaction(this.pool, async (client) => {
      const { rows } = await client.query<MissionRow>(
        "SELECT * FROM missions WHERE status IN ('ready', 'running') AND paused_at IS NULL ORDER BY id FOR UPDATE",
      );
      for (const mission of rows) await this.expireLocked(client, mission, true);
    });
  }

  private async expireLocked(client: PoolClient, mission: MissionRow, restored = false): Promise<void> {
    const key = [mission.project_id, mission.id];
    const { rows: [clock] } = await client.query<{ overdue: boolean }>(
      'SELECT deadline_at <= clock_timestamp() AS overdue FROM missions WHERE project_id = $1 AND id = $2',
      key,
    );
    const { rows: expired } = await client.query<AttemptRow>(
      `UPDATE attempts SET status = 'expired', finished_at = clock_timestamp()
       WHERE project_id = $1 AND mission_id = $2 AND status = 'active'
         AND ($3::boolean OR lease_until <= clock_timestamp())
       RETURNING *`,
      [...key, restored || clock.overdue],
    );
    for (const attempt of expired) {
      await recordEvent(client, mission, 'attempt_expired', attempt.role, {
        attemptId: attempt.id,
        generation: attempt.generation,
        reason: restored ? 'restored_state' : clock.overdue ? 'deadline_exceeded' : 'lease_expired',
      });
    }

    const exhausted = expired.some((attempt) => attempt.generation >= mission.max_attempts);
    if (clock.overdue || exhausted) {
      const reason = clock.overdue ? 'deadline_exceeded' : 'attempt_limit_reached';
      await client.query(
        `UPDATE steps SET status = CASE WHEN status = 'running' THEN 'failed' ELSE 'cancelled' END
         WHERE project_id = $1 AND mission_id = $2 AND status IN ('waiting', 'ready', 'running')`,
        key,
      );
      await client.query(
        "UPDATE missions SET status = 'failed', reason = $3 WHERE project_id = $1 AND id = $2",
        [...key, reason],
      );
      await recordEvent(client, mission, 'mission_failed', null, { reason });
      return;
    }
    for (const attempt of expired) {
      await client.query(
        "UPDATE steps SET status = 'ready' WHERE project_id = $1 AND mission_id = $2 AND role = $3",
        [...key, attempt.role],
      );
      await recordEvent(client, mission, 'step_ready', attempt.role);
    }
  }
}
