import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DomainError, digestJson, type JsonObject, type Operator, type ProjectId } from './contracts.ts';
import { assertId, assertProject, notFound, transaction } from './database.ts';
import { selectMissionKnowledge } from './product-intelligence.ts';
import {
  controlLimits,
  controlVersion,
  documentHash,
  documentPlan,
  type KnowledgeRef,
} from './control-room-adapters.ts';

export type ControlStatus =
  | 'draft'
  | 'needs_approval'
  | 'ready'
  | 'running'
  | 'paused'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type ControlBrief = {
  purpose?:string;
  planMode?:'parallel'|'sequential';
  objective: string;
  scope: string;
  constraints: string;
  document: string;
  criteria: string[];
  risk: 'normal' | 'review';
  durationMinutes: number;
};
export type ControlMission = {
  purpose:string;
  plan_mode:'parallel'|'sequential';
  id: string;
  project_id: ProjectId;
  objective: string;
  scope: string;
  constraints_text: string;
  document: string;
  criteria: string[];
  risk: 'normal' | 'review';
  duration_minutes: number;
  status: ControlStatus;
  revision: number;
  context: KnowledgeRef[];
  source_sha256: string;
  contract_version: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  deadline_at: Date | null;
  reason: string | null;
  parent_id: string | null;
};
const terminal = ['completed', 'failed', 'cancelled', 'blocked'];
export const missionPurposes={analysis:'Analyse',development:'Développement',audit:'Audit',documentation:'Documentation',
  research:'Recherche',test:'Test',maintenance:'Maintenance',delivery:'Préparation de livraison'};
export function missionPlan(mode:'parallel'|'sequential') {
  return documentPlan.map(task=>mode==='sequential'&&task.key==='coverage'?{...task,dependencies:['structure' as const]}:task);
}
export function invalid(message: string): never {
  throw new DomainError(400, 'control_input', message);
}
export function conflict(message: string): never {
  throw new DomainError(409, 'control_state', message);
}
function field(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (!empty && !value.trim()))
    invalid('Vérifiez les champs et leur taille.');
  return value.trim();
}
export function readBrief(input: JsonObject): ControlBrief {
  const entries =
    typeof input.criteria === 'string'
      ? input.criteria
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      : input.criteria;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 12)
    invalid('Saisissez de 1 à 12 expressions attendues.');
  const criteria = entries.map((v) => field(v, 160));
  if (new Set(criteria.map((c) => c.normalize('NFC').toLowerCase())).size !== criteria.length)
    invalid('Les expressions doivent être distinctes.');
  const durationMinutes = Number(input.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 60)
    invalid('Choisissez une durée de 1 à 60 minutes.');
  if (input.risk !== 'normal' && input.risk !== 'review') invalid('Risque inconnu.');
  field(input.document, 10000);
  if(input.purpose!==undefined && (typeof input.purpose!=='string'||!Object.hasOwn(missionPurposes,input.purpose))) invalid('Finalité de mission inconnue.');
  if(input.planMode!==undefined && input.planMode!=='parallel' && input.planMode!=='sequential') invalid('Ordonnancement inconnu.');
  return {
    ...(typeof input.purpose==='string'?{purpose:input.purpose}:{}),
    ...(input.planMode?{planMode:input.planMode}:{}),
    objective: field(input.objective, 240),
    scope: field(input.scope, 1200),
    constraints: field(input.constraints ?? '', 1200, true),
    document: input.document as string,
    criteria,
    risk: input.risk,
    durationMinutes,
  };
}

// The global scheduler lock provides a single order for grants, quotas, approvals and lease revocation.
// No filesystem, network request or adapter call waits inside this critical section.
export function lockControl(c: PoolClient) {
  return c.query('SELECT pg_advisory_xact_lock(117986311,10)');
}
export async function recordControl(
  c: PoolClient,
  project: ProjectId,
  id: string,
  actor: string,
  event: string,
  details: JsonObject = {},
) {
  await c.query(
    'INSERT INTO control_events(project_id,mission_id,actor,event_type,details) VALUES($1,$2,$3,$4,$5)',
    [project, id, actor, event, details],
  );
}
export async function readControlMission(c: PoolClient, project: ProjectId, id: string) {
  assertId(id);
  const mission = (
    await c.query<ControlMission>('SELECT * FROM control_missions WHERE project_id=$1 AND id=$2', [
      project,
      id,
    ])
  ).rows[0];
  if (!mission) throw notFound();
  return mission;
}
async function changeStatus(
  c: PoolClient,
  m: ControlMission,
  status: ControlStatus,
  actor: string,
  reason: string | null = null,
) {
  await c.query(
    'UPDATE control_missions SET status=$3,reason=$4,revision=revision+1,updated_at=clock_timestamp() WHERE project_id=$1 AND id=$2',
    [m.project_id, m.id, status, reason],
  );
  await recordControl(c, m.project_id, m.id, actor, 'mission.' + status, { previous: m.status, reason });
}
export async function interruptControl(
  c: PoolClient,
  project: ProjectId,
  id: string,
  terminalState: boolean,
) {
  await c.query(
    `UPDATE control_attempts SET state='interrupted',finished_at=clock_timestamp()
    WHERE project_id=$1 AND mission_id=$2 AND state='running'`,
    [project, id],
  );
  if (terminalState) {
    await c.query(
      `UPDATE control_tasks SET state='cancelled' WHERE project_id=$1 AND mission_id=$2 AND state NOT IN ('completed','blocked')`,
      [project, id],
    );
  } else {
    await c.query(
      `UPDATE control_tasks SET state='ready' WHERE project_id=$1 AND mission_id=$2 AND state='running'`,
      [project, id],
    );
  }
}

export async function controlCommand(
  pool: Pool,
  actor: Operator,
  project: ProjectId,
  key: string,
  input: JsonObject,
  apply: (client: PoolClient) => Promise<string>,
): Promise<{ id: string }> {
  assertProject(actor, project);
  if (actor.accountRole === 'viewer')
    throw new DomainError(403, 'read_only', 'Cette identité dispose d’un accès en lecture.');
  assertId(key);
  return transaction(pool, async (c) => {
    await lockControl(c);
    const hash = digestJson(input);
    const prior = (
      await c.query(
        'SELECT mission_id,payload_sha256 FROM control_commands WHERE project_id=$1 AND actor=$2 AND command_key=$3',
        [project, actor.id, key],
      )
    ).rows[0];
    if (prior) {
      if (hash !== prior.payload_sha256) conflict('Cette clé a déjà servi à une commande différente.');
      return { id: prior.mission_id as string };
    }
    const id = await apply(c);
    await c.query(
      'INSERT INTO control_commands(project_id,actor,command_key,payload_sha256,mission_id) VALUES($1,$2,$3,$4,$5)',
      [project, actor.id, key, hash, id],
    );
    return { id };
  });
}
async function insertMission(
  c: PoolClient,
  actor: Operator,
  project: ProjectId,
  b: ControlBrief,
  parent: string | null,
) {
  const count = (
    await c.query(
      "SELECT count(*)::int n FROM control_missions WHERE project_id=$1 AND status NOT IN ('completed','failed','cancelled','blocked')",
      [project],
    )
  ).rows[0].n;
  if (count >= controlLimits.queuePerProject)
    conflict('La file du projet contient déjà 32 missions ouvertes.');
  const id = randomUUID();
  await c.query(
    `INSERT INTO control_missions(id,project_id,objective,scope,constraints_text,document,criteria,risk,duration_minutes,status,
    source_sha256,contract_version,parent_id,created_by,purpose,plan_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11,$12,$13,$14,$15)`,
    [
      id,
      project,
      b.objective,
      b.scope,
      b.constraints,
      b.document,
      b.criteria,
      b.risk,
      b.durationMinutes,
      documentHash(b.document),
      controlVersion,
      parent,
      actor.id,
      b.purpose??'documentation',b.planMode??'parallel',
    ],
  );
  await recordControl(c, project, id, actor.id, 'mission.created', { parentId: parent });
  return id;
}
export function createControlMission(
  pool: Pool,
  actor: Operator,
  project: ProjectId,
  key: string,
  input: JsonObject,
) {
  const brief = readBrief(input);
  return controlCommand(pool, actor, project, key, { action: 'create', brief }, (c) =>
    insertMission(c, actor, project, brief, null),
  );
}
export function commandMission(
  pool: Pool,
  actor: Operator,
  project: ProjectId,
  id: string,
  action: string,
  key: string,
  revision: number,
  fields: JsonObject = {},
) {
  if (!Number.isSafeInteger(revision) || revision < 1) invalid('Fournissez la version de la mission.');
  return controlCommand(pool, actor, project, key, { action, id, revision, fields }, async (c) => {
    const m = await readControlMission(c, project, id);
    if (m.revision !== revision) conflict('La mission a changé. Actualisez la page puis vérifiez son état.');
    if (action === 'relaunch' && terminal.includes(m.status)) {
      return insertMission(
        c,
        actor,
        project,
        {
          objective: m.objective,
          scope: m.scope,
          constraints: m.constraints_text,
          document: m.document,
          criteria: m.criteria,
          risk: m.risk,
          durationMinutes: m.duration_minutes,
          purpose:m.purpose,planMode:m.plan_mode,
        },
        id,
      );
    }
    if (action === 'edit' && (m.status === 'draft' || m.status === 'needs_approval')) {
      const b = readBrief(fields);
      await c.query(
        `UPDATE control_missions SET objective=$3,scope=$4,constraints_text=$5,document=$6,criteria=$7,risk=$8,
        duration_minutes=$9,source_sha256=$10,purpose=$11,plan_mode=$12,context='[]',status='draft',updated_at=clock_timestamp(),revision=revision+1 WHERE project_id=$1 AND id=$2`,
        [
          project,
          id,
          b.objective,
          b.scope,
          b.constraints,
          b.document,
          b.criteria,
          b.risk,
          b.durationMinutes,
          documentHash(b.document),
          b.purpose??m.purpose,b.planMode??m.plan_mode,
        ],
      );
      await recordControl(c, project, id, actor.id, 'brief.revised', {
        priorRevision: revision,
        sourceSha256: documentHash(b.document),
      });
      return id;
    }
    if (action === 'plan' && m.status === 'draft') {
      const context = await selectMissionKnowledge(c, project, m.objective, m.criteria);
      await c.query('UPDATE control_missions SET context=$3 WHERE project_id=$1 AND id=$2', [
        project,
        id,
        JSON.stringify(context),
      ]);
      const observation =
        (
          await c.query(
            'SELECT id,local_commit AS commit,branch FROM repository_observations WHERE project_id=$1 ORDER BY observed_at DESC,id LIMIT 1',
            [project],
          )
        ).rows[0] ?? null;
      await recordControl(c, project, id, actor.id, 'plan.frozen', {
        contract: controlVersion,
        sourceSha256: m.source_sha256,
        contextCount: context.length,
        repositoryObservation: observation,
        ordering:m.plan_mode,purpose:m.purpose,
      });
      if (m.risk === 'review') {
        await changeStatus(c, m, 'needs_approval', actor.id);
        return id;
      }
    } else if (action === 'approve' && m.status === 'needs_approval') {
      await recordControl(c, project, id, actor.id, 'approval.accepted', { revision });
    } else if (
      (action === 'reject' && m.status === 'needs_approval') ||
      (action === 'cancel' && !['completed', 'failed', 'cancelled'].includes(m.status))
    ) {
      await interruptControl(c, project, id, true);
      await changeStatus(
        c,
        m,
        'cancelled',
        actor.id,
        action === 'reject' ? 'approval_rejected' : 'operator_cancelled',
      );
      return id;
    } else if (action === 'pause' && ['ready', 'running'].includes(m.status)) {
      await interruptControl(c, project, id, false);
      await changeStatus(c, m, 'paused', actor.id);
      return id;
    } else if (action === 'resume' && m.status === 'paused') {
      const expired = (await c.query('SELECT $1::timestamptz <= clock_timestamp() expired', [m.deadline_at]))
        .rows[0].expired;
      if (expired) conflict('Échéance dépassée. Clôturez ou relancez cette mission après réconciliation.');
      await changeStatus(c, m, 'ready', actor.id);
      return id;
    } else {
      conflict('Transition indisponible dans cet état.');
    }
    for (const task of missionPlan(m.plan_mode)) {
      await c.query(
        `INSERT INTO control_tasks(project_id,mission_id,task_key,role,dependencies,state) VALUES($1,$2,$3,$4,$5,$6)`,
        [project, id, task.key, task.role, task.dependencies, task.dependencies.length ? 'waiting' : 'ready'],
      );
    }
    await c.query(
      "UPDATE control_missions SET deadline_at=clock_timestamp()+duration_minutes*interval '1 minute' WHERE project_id=$1 AND id=$2",
      [project, id],
    );
    await changeStatus(c, m, 'ready', actor.id);
    return id;
  });
}
export async function listControlMissions(pool: Pool, actor: Operator, project: ProjectId) {
  assertProject(actor, project);
  return (
    await pool.query<
      Pick<ControlMission, 'id' | 'status' | 'objective' | 'risk' | 'updated_at' | 'revision'>
    >(
      'SELECT id,status,objective,risk,updated_at,revision FROM control_missions WHERE project_id=$1 ORDER BY updated_at DESC,id LIMIT 80',
      [project],
    )
  ).rows;
}
export async function controlDetail(pool: Pool, actor: Operator, project: ProjectId, id: string) {
  assertProject(actor, project);
  return transaction(
    pool,
    async (c) => {
      const mission = await readControlMission(c, project, id);
      const tasks = (
        await c.query(
          "SELECT * FROM control_tasks WHERE project_id=$1 AND mission_id=$2 ORDER BY CASE task_key WHEN 'structure' THEN 1 WHEN 'coverage' THEN 2 ELSE 3 END",
          [project, id],
        )
      ).rows;
      const attempts = (
        await c.query(
          'SELECT * FROM control_attempts WHERE project_id=$1 AND mission_id=$2 ORDER BY started_at,id',
          [project, id],
        )
      ).rows;
      const events = (
        await c.query(
          'SELECT id,event_type,actor,details,at FROM control_events WHERE project_id=$1 AND mission_id=$2 ORDER BY id',
          [project, id],
        )
      ).rows;
      return { mission, tasks, attempts, events, plan: missionPlan(mission.plan_mode), limits: controlLimits };
    },
    true,
  );
}
