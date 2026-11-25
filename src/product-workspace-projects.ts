import type { Pool } from 'pg';
import { DomainError, isProjectId, type JsonObject, type Operator, type ProjectId } from './contracts.ts';
import { assertProject, notFound, transaction } from './database.ts';

export interface ProjectProfile {
  id: ProjectId;
  name: string;
  description: string;
  repository: string;
  mainBranch: string;
  workBranches: string[];
  acceptance: string;
  revision: number;
}
type Editable = Omit<ProjectProfile, 'id' | 'revision'>;
type Reader = Pick<Pool, 'query'>;
const fields = `id, name, coalesce(context->>'description','') AS description,
  repository_url AS repository, main_branch AS "mainBranch", work_branches AS "workBranches",
  acceptance, profile_revision AS revision`;

function invalid(message: string): never {
  throw new DomainError(400, 'project_profile', message);
}
function bounded(input: unknown, maximum: number, required = false) {
  if (typeof input !== 'string' || input.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(input)) {
    invalid('Champ invalide ou trop long.');
  }
  const value = input.trim();
  if (required && !value) invalid('Le nom du projet est requis.');
  return value;
}
function branch(input: unknown) {
  const name = bounded(input, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name) || name.includes('..') ||
      name.endsWith('.') || name.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'))) {
    invalid('Utilisez un nom de branche Git valide.');
  }
  return name;
}
function parseProfile(input: JsonObject): Editable {
  const keys = ['name','description','repository','mainBranch','workBranches','acceptance','revision'];
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) {
    invalid('Vérifiez les champs du profil.');
  }
  const repository = bounded(input.repository, 240);
  if (repository && !/^https:\/\/github\.com\/[a-z\d](?:[a-z\d-]{0,38})\/[a-z\d][a-z\d._-]{0,99}$/i.test(repository)) {
    invalid('Indiquez une URL de dépôt GitHub HTTPS sans identifiants ni paramètres.');
  }
  const lines = typeof input.workBranches === 'string' ? input.workBranches.split(/[\r\n,]+/).filter(s => s.trim()) : input.workBranches;
  if (!Array.isArray(lines) || lines.length > 12) invalid('Douze branches de travail au maximum.');
  const workBranches = lines.map(branch);
  if (new Set(workBranches).size !== workBranches.length) invalid('Une branche apparaît plusieurs fois.');
  return {
    name: bounded(input.name, 120, true), description: bounded(input.description, 1800), repository,
    mainBranch: input.mainBranch === '' ? '' : branch(input.mainBranch), workBranches,
    acceptance: bounded(input.acceptance, 1600),
  };
}

export async function listWorkspaceProjects(db: Reader, actor: Operator) {
  return (await db.query<ProjectProfile>('SELECT ' + fields + ' FROM projects WHERE id=ANY($1::text[]) ORDER BY id', [actor.projectIds])).rows;
}

export async function profileDetail(pool: Pool, actor: Operator, id: ProjectId) {
  assertProject(actor, id);
  return transaction(pool, async client => {
    const profile = (await client.query<ProjectProfile>('SELECT ' + fields + ' FROM projects WHERE id=$1', [id])).rows[0];
    if (!profile) throw notFound();
    const revisions = (await client.query<{revision: number; actor: string; at: Date; profile: Editable}>(
      'SELECT revision,actor,at,profile FROM project_profile_history WHERE project_id=$1 ORDER BY revision DESC LIMIT 20', [id],
    )).rows;
    return { profile, revisions };
  }, true);
}

/** The repository and branch labels are metadata. Execution policies remain under the existing operator configuration. */
export async function changeProfile(pool: Pool, actor: Operator, id: ProjectId, input: JsonObject) {
  assertProject(actor, id);
  if (actor.accountRole === 'viewer') throw new DomainError(403,'project_readonly','Ce compte dispose d’un accès en lecture.');
  const next = parseProfile(input);
  if (!['number','string'].includes(typeof input.revision) || !/^(0|[1-9]\d{0,9})$/.test(String(input.revision))) invalid('Révision de profil invalide.');
  const revision = Number(input.revision);
  return transaction(pool, async client => {
    const current = (await client.query<ProjectProfile>('SELECT ' + fields + ' FROM projects WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!current) throw notFound();
    if (current.name === next.name && current.description === next.description && current.repository === next.repository &&
        current.mainBranch === next.mainBranch && current.acceptance === next.acceptance &&
        JSON.stringify(current.workBranches) === JSON.stringify(next.workBranches)) return current;
    if (current.revision !== revision) throw new DomainError(409, 'profile_changed', 'Le profil a changé. Rechargez-le pour examiner la dernière révision.');
    const changed = (await client.query<ProjectProfile>(`UPDATE projects SET name=$2,
        context=jsonb_set(context,'{description}',to_jsonb($3::text)),repository_url=$4,main_branch=$5,
        work_branches=$6,acceptance=$7,profile_revision=profile_revision+1 WHERE id=$1 RETURNING ` + fields,
      [id,next.name,next.description,next.repository,next.mainBranch,next.workBranches,next.acceptance])).rows[0];
    await client.query('INSERT INTO project_profile_history(project_id,revision,actor,profile) VALUES ($1,$2,$3,$4::jsonb)',
      [id,changed.revision,actor.id,JSON.stringify(next)]);
    return changed;
  });
}

export function requireProjectAdministrator(actor: Operator) {
  if (actor.accountRole !== 'admin') {
    throw new DomainError(403, 'project_admin', 'La création de projet est réservée à un compte administrateur.');
  }
}

export async function createWorkspaceProject(pool: Pool, actor: Operator, input: JsonObject) {
  requireProjectAdministrator(actor);
  const { id, ...profile } = input;
  if (!isProjectId(id) || id === 'new' || !/^[a-z][a-z0-9-]{0,39}$/.test(id)) invalid('Identifiant de projet invalide ou réservé.');
  if (Object.hasOwn(profile,'revision')) invalid('Une création ne reçoit pas de numéro de révision.');
  const next = parseProfile({...profile,revision:0});
  return transaction(pool, async client => {
    const inserted = await client.query<ProjectProfile>(`INSERT INTO projects
      (id,name,context,repository_url,main_branch,work_branches,acceptance,profile_revision)
      VALUES ($1,$2,jsonb_build_object('description',$3::text),$4,$5,$6,$7,1)
      ON CONFLICT(id) DO NOTHING RETURNING ` + fields,
      [id,next.name,next.description,next.repository,next.mainBranch,next.workBranches,next.acceptance]);
    if (!inserted.rowCount) {
      // A lost response may replay the same creation. A later membership change must still be respected.
      const repeated = await client.query(`SELECT 1 FROM project_profile_history h
        JOIN studio_account_projects a ON a.project_id=h.project_id AND a.account_id=$2
        WHERE h.project_id=$1 AND h.revision=1 AND h.actor=$2 AND h.profile=$3::jsonb`,
        [id,actor.id,JSON.stringify(next)]);
      if (repeated.rowCount) return { id, ...next, revision: 1 };
      throw new DomainError(409,'project_exists','Cet identifiant de projet est déjà utilisé.');
    }
    await client.query('INSERT INTO studio_account_projects(account_id,project_id) VALUES ($1,$2)',[actor.id,id]);
    await client.query('INSERT INTO project_profile_history(project_id,revision,actor,profile) VALUES ($1,1,$2,$3::jsonb)',
      [id,actor.id,JSON.stringify(next)]);
    return inserted.rows[0];
  });
}
