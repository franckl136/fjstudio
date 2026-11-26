import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { digestJson, DomainError, type Operator, type ProjectId } from './contracts.ts';
import { assertId, assertProject, notFound, transaction } from './database.ts';
import { labDigest, labSources, readLabSnapshot, type LabSnapshot, type LabInventory } from './product-lab-source.ts';
import { image, compilerImage, checkTypeScript, limits, renderLab, labFailureReason, type Rendered } from './product-lab-render.ts';

export const labProfiles = {
  typescript: { title: 'Typage TypeScript strict', version: 'standalone-ts-v1', description: 'Vérifie une unité TypeScript autonome avec le compilateur du Studio en conteneur isolé.' },
  structure: { title: 'Source HTML', version: 'static-html-v1', description: 'Vérifie les octets Git, le doctype HTML et les indices de dépendances actives.' },
  visual: { title: 'Document rendu', version: 'static-chromium-v1', description: 'Ajoute une capture Chromium et mesure titre, langue, titre principal et région principale dans le DOM.' },
} as const;
type Profile = keyof typeof labProfiles;
type Trigger = 'manual' | 'on-change' | 'interval';
type Verdict = 'PASS' | 'PASS WITH RESERVATIONS' | 'FAIL' | 'NOT QUALIFIED';
type Check = { id: string; title: string; status: 'passed'|'failed'|'warning'|'not_run'; observed: string };
type Report = { checks: Check[]; node: string; note?: string; browser?: string; compiler?: string; toolchainSha256?: string; image?: string; driverSha256?: string;
  elapsedMs?: number; isolation?: typeof limits; commit: string; sourceSha256: string; profileVersion: string; screenshotSha256?: string };
interface Run {
  id: string; project_id: ProjectId; source_key: string; entry_path: string; commit_sha: string; source_digest: string;
  inventory: LabInventory; profile: Profile; profile_version: string; trigger_kind: Trigger; actor_id: string; created_at: Date;
  started_at: Date | null; finished_at: Date | null; worker: string | null; state: 'queued'|'running'|'finished';
  verdict: Verdict | null; result: Report | null; result_sha: string | null; screenshot_sha: string | null;
}
interface Rule {
  project_id: ProjectId; source_key: string; profile: Profile; mode: 'on-change'|'interval'; enabled: boolean; revision: string;
  interval_minutes: number; updated_at: Date; updated_by: string; next_at: Date; last_commit: string | null; last_status: string | null;
}
const runFields = 'id,project_id,source_key,entry_path,commit_sha,source_digest,inventory,profile,profile_version,trigger_kind,actor_id,created_at,started_at,finished_at,worker,state,verdict,result_sha,screenshot_sha';
const invalid = () => new DomainError(400, 'lab_input', 'Paramètres de qualification invalides.');
const quota = () => new DomainError(409, 'lab_quota', 'La limite de qualifications du projet ou de la file est atteinte.');
const profileKey = (v: unknown): v is Profile => v === 'visual' || v === 'structure' || v === 'typescript';
const decision = (checks: Check[]): Verdict => checks.some(c => c.status === 'failed') ? 'FAIL'
  : checks.some(c => c.status === 'not_run') ? 'NOT QUALIFIED' : checks.some(c => c.status === 'warning') ? 'PASS WITH RESERVATIONS' : 'PASS';

function sourceFor(project: ProjectId, key: string, profile: Profile) {
  const source = labSources(project).find(s => s.key === key);
  if (!source) throw notFound();
  if ((profile === 'typescript') !== source.entry.endsWith('.ts')) throw new DomainError(400,'lab_profile','Choisissez un profil compatible avec le fichier autorisé.');
  return source;
}
function key(value: string) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)) throw invalid();
}
function verifyReport(row: Run) {
  if (row.result && row.result_sha !== digestJson(row.result)) throw new DomainError(409,'lab_integrity','Empreinte de rapport divergente.');
  return row;
}

export async function listLab(pool: Pool, actor: Operator, project: ProjectId) {
  assertProject(actor, project);
  const [runs,rules,projects] = await Promise.all([
    pool.query<Run>(`SELECT ${runFields} FROM product_lab_runs WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`, [project]),
    pool.query<Rule>('SELECT * FROM product_lab_rules WHERE project_id=$1 ORDER BY source_key,profile', [project]),
    pool.query<{id: ProjectId; name: string}>('SELECT id,name FROM projects WHERE id=ANY($1::text[]) ORDER BY name', [actor.projectIds]),
  ]);
  return { runs: runs.rows, rules: rules.rows, projects: projects.rows, sources: labSources(project).map(s => ({key:s.key, entry:s.entry, ref:s.ref})), profiles: labProfiles };
}

export async function detailLab(pool: Pool, actor: Operator, project: ProjectId, id: string) {
  assertProject(actor, project); assertId(id);
  const row = (await pool.query<Run>(`SELECT ${runFields},result FROM product_lab_runs WHERE project_id=$1 AND id=$2`, [project,id])).rows[0];
  if (!row) throw notFound();
  return verifyReport(row);
}

export async function evidencePng(pool: Pool, actor: Operator, project: ProjectId, id: string) {
  assertProject(actor, project); assertId(id);
  const row = (await pool.query<{screenshot: Buffer; screenshot_sha:string}>(
    'SELECT screenshot,screenshot_sha FROM product_lab_runs WHERE project_id=$1 AND id=$2 AND screenshot IS NOT NULL',[project,id])).rows[0];
  if (!row) throw notFound();
  if (labDigest(row.screenshot) !== row.screenshot_sha) throw new DomainError(409,'lab_integrity','Empreinte d’image divergente.');
  return row.screenshot;
}

export async function compareLab(pool: Pool, actor: Operator, project: ProjectId, first: string, second: string) {
  const [before,after] = await Promise.all([detailLab(pool,actor,project,first),detailLab(pool,actor,project,second)]);
  if (!before.result || !after.result || before.id === after.id || before.source_key !== after.source_key ||
      before.entry_path !== after.entry_path || before.profile_version !== after.profile_version)
    throw new DomainError(409,'lab_comparison','Comparer deux passages terminés sur la même source et le même profil.');
  const old = new Map(before.result.checks.map(check=>[check.id,check]));
  const recent = new Map(after.result.checks.map(check=>[check.id,check]));
  const ids = new Set([...old.keys(),...recent.keys()]);
  const rows = [...ids].map(id => {
    const previous = old.get(id);
    const current = recent.get(id);
    return {title:(current ?? previous)!.title, before:previous?.status ?? 'not_run',
      after:current?.status ?? 'not_run', observed:current?.observed ?? 'Contrôle absent du second passage.'};
  });
  return {before,after,rows};
}

async function enqueue(client: PoolClient, project: ProjectId, actor: string, command: string, source: string, profile: Profile, snapshot: LabSnapshot, trigger: Trigger) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('studio-product-lab-enqueue'))");
  const existing = (await client.query<Run>(`SELECT ${runFields} FROM product_lab_runs WHERE project_id=$1 AND command_key=$2`,[project,command])).rows[0];
  if (existing) {
    if (existing.source_key !== source || existing.profile !== profile || existing.commit_sha !== snapshot.commit)
      throw new DomainError(409,'lab_command','Cette demande appartient à une autre qualification.');
    return existing;
  }
  const count = (await client.query<{total:number; queued:number; all_queued:number}>(
    `SELECT count(*) FILTER (WHERE project_id=$1)::int AS total,
      count(*) FILTER (WHERE project_id=$1 AND state <> 'finished')::int AS queued,
      count(*) FILTER (WHERE state <> 'finished')::int AS all_queued FROM product_lab_runs`, [project])).rows[0];
  if (count.total >= 500 || count.queued >= 4 || count.all_queued >= 16) throw quota();
  return (await client.query<Run>(`INSERT INTO product_lab_runs
    (id,project_id,command_key,source_key,entry_path,commit_sha,source_digest,source_html,profile,profile_version,trigger_kind,actor_id,inventory)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${runFields}`,
    [randomUUID(),project,command,source,snapshot.entry,snapshot.commit,snapshot.sha256,snapshot.bytes,profile,labProfiles[profile].version,trigger,actor,snapshot.inventory])).rows[0];
}

export async function queueLab(pool: Pool, actor: Operator, project: ProjectId, source: string, profile: string, command: string, commit?: string) {
  assertProject(actor,project);
  if (actor.accountRole === 'viewer') throw new DomainError(403,'read_only','Ce compte dispose d’un accès en lecture.');
  key(command);
  if (!profileKey(profile) || (commit && !/^[a-f0-9]{40}$/.test(commit))) throw invalid();
  const already = (await pool.query<Run>(`SELECT ${runFields} FROM product_lab_runs WHERE project_id=$1 AND command_key=$2`,[project,command])).rows[0];
  if (already) {
    if (already.source_key !== source || already.profile !== profile || (commit && already.commit_sha !== commit))
      throw new DomainError(409,'lab_command','Cette demande appartient à une autre qualification.');
    return already;
  }
  const snapshot = await readLabSnapshot(sourceFor(project,source,profile),commit);
  return transaction(pool,client=>enqueue(client,project,actor.id,command,source,profile,snapshot,'manual'));
}

export async function setLabRule(pool: Pool, actor: Operator, project: ProjectId, source: string, profile: string, mode: string, minutes: number) {
  assertProject(actor,project);
  if (actor.accountRole === 'viewer') throw new DomainError(403,'read_only','Ce compte dispose d’un accès en lecture.');
  if (!profileKey(profile) || !['off','interval','on-change'].includes(mode) || !Number.isInteger(minutes) || minutes < 5 || minutes > 10080) throw invalid();
  if (mode === 'off') {
    await pool.query(`UPDATE product_lab_rules SET revision=gen_random_uuid(),enabled=false,updated_by=$4,updated_at=clock_timestamp()
      WHERE project_id=$1 AND source_key=$2 AND profile=$3`,[project,source,profile,actor.id]);
    return;
  }
  sourceFor(project,source,profile);
  await pool.query(`INSERT INTO product_lab_rules(project_id,source_key,profile,mode,interval_minutes,updated_by)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(project_id,source_key,profile) DO UPDATE SET
      revision=gen_random_uuid(),mode=EXCLUDED.mode,enabled=true,interval_minutes=EXCLUDED.interval_minutes,updated_by=EXCLUDED.updated_by,
      updated_at=clock_timestamp(),next_at=clock_timestamp()`,[project,source,profile,mode,minutes,actor.id]);
}

// Reserve the next poll before doing Git I/O. Replacement or suspension invalidates this poll.
export async function pollLabRule(pool: Pool) {
  const rule = await transaction(pool,async client=>(await client.query<Rule>(`WITH due AS (
    SELECT project_id,source_key,profile FROM product_lab_rules WHERE enabled AND next_at <= clock_timestamp()
    ORDER BY next_at,project_id,source_key,profile FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE product_lab_rules r SET next_at=clock_timestamp() + r.interval_minutes * interval '1 minute'
    FROM due WHERE (r.project_id,r.source_key,r.profile)=(due.project_id,due.source_key,due.profile) RETURNING r.*`)).rows[0]);
  if (!rule) return;
  const identity = [rule.project_id,rule.source_key,rule.profile];
  try {
    const snapshot = await readLabSnapshot(sourceFor(rule.project_id,rule.source_key,rule.profile));
    await transaction(pool,async client=>{
      const now = (await client.query<Rule>(`SELECT * FROM product_lab_rules
        WHERE project_id=$1 AND source_key=$2 AND profile=$3 FOR UPDATE`,identity)).rows[0];
      if (!now?.enabled || now.revision !== rule.revision || now.next_at.getTime() !== rule.next_at.getTime()) return;
      if (rule.mode==='on-change' && rule.last_commit === snapshot.commit) {
        await client.query("UPDATE product_lab_rules SET last_status='inchangé' WHERE project_id=$1 AND source_key=$2 AND profile=$3",identity);
        return;
      }
      await enqueue(client,rule.project_id,rule.updated_by,randomUUID(),rule.source_key,rule.profile,snapshot,rule.mode);
      await client.query(`UPDATE product_lab_rules SET last_commit=$4,last_status='qualification en file'
        WHERE project_id=$1 AND source_key=$2 AND profile=$3`,[...identity,snapshot.commit]);
    });
  } catch {
    await pool.query(`UPDATE product_lab_rules SET last_status='source ou capacité indisponible'
      WHERE project_id=$1 AND source_key=$2 AND profile=$3 AND enabled AND revision=$4`,[...identity,rule.revision]);
  }
}

function incomplete(row: Pick<Run,'commit_sha'|'source_digest'|'profile_version'>, note: string): Report {
  return {node:process.version,commit:row.commit_sha,sourceSha256:row.source_digest,profileVersion:row.profile_version,note,
    checks:[{id:'execution',title:'Exécution complète',status:'not_run',observed:note}]};
}
async function abandon(client: PoolClient, where: string, note: string) {
  const rows = (await client.query<Run>(`SELECT ${runFields} FROM product_lab_runs WHERE ${where} FOR UPDATE`)).rows;
  for (const row of rows) {
    const report = incomplete(row,note);
    await client.query(`UPDATE product_lab_runs SET state='finished',finished_at=clock_timestamp(),
      verdict='NOT QUALIFIED',result=$2,result_sha=$3 WHERE id=$1`,[row.id,report,digestJson(report)]);
  }
  return rows.length;
}

export async function quarantineProductLab(client: PoolClient) {
  await client.query("UPDATE product_lab_rules SET enabled=false,updated_at=clock_timestamp(),last_status='restauration' WHERE enabled");
  return abandon(client,"state IN ('queued','running')",'Passage interrompu par la restauration. Relancer dans la base restaurée après revue.');
}

async function claimLab(pool: Pool) {
  return transaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('studio-product-lab-claim'))");
    await abandon(client,"state='running' AND started_at < clock_timestamp() - interval '75 seconds'",'Le runner a dépassé son délai. Le passage peut être relancé après inspection.');
    const result = await client.query<Run & {source_html:Buffer}>(`WITH next AS (
      SELECT q.id FROM product_lab_runs q WHERE q.state='queued' AND
        (SELECT count(*) FROM product_lab_runs WHERE state='running') < 2 AND
        NOT EXISTS (SELECT 1 FROM product_lab_runs other WHERE other.state='running' AND other.project_id=q.project_id)
      ORDER BY q.created_at,q.id LIMIT 1 FOR UPDATE SKIP LOCKED)
      UPDATE product_lab_runs r SET state='running',started_at=clock_timestamp(),worker='studio-local-lab'
      FROM next WHERE r.id=next.id RETURNING r.*`);
    return result.rows[0];
  });
}

export async function runProductLabTick(pool: Pool) {
  await pollLabRule(pool);
  const row = await claimLab(pool);
  if (!row) return false;
  const start = Date.now();
  const report: Report = {checks:[],node:process.version,commit:row.commit_sha,sourceSha256:row.source_digest,profileVersion:row.profile_version};
  let png: Buffer | null = null;
  try {
    if (row.profile_version !== labProfiles[row.profile].version || labDigest(row.source_html) !== row.source_digest) throw Error('snapshot');

    report.checks.push({id:'source',title:'Intégrité des octets Git',status:'passed',observed:row.source_html.length+' octets · SHA-256 vérifié.'});
    if (row.profile === 'typescript') {
      report.image=compilerImage; report.isolation=limits;
      const result=await checkTypeScript(row.source_html,row.id);
      report.compiler=result.version;report.driverSha256=result.driverSha256;report.toolchainSha256=result.toolchainSha256;
      const details=result.diagnostics.map(d=>'TS'+d.code+(d.line===null?'':' L'+d.line+':'+d.column)).join(', ');
      report.checks.push({id:'typescript',title:'TypeScript strict · unité autonome',status:result.status,
        observed:result.reason==='directives'?'Une directive modifie les vérifications strictes du profil.':
          result.reason==='dependencies'?'Une dépendance ou une référence externe sort du profil autonome.':
          result.count+' diagnostic(s)'+(details?' · '+details:'.')});
    } else {
      const html = row.source_html.toString('utf8');
      const doctype = /^\s*<!doctype\s+html\s*>/i.test(html);
      report.checks.push({id:'doctype',title:'Déclaration HTML5',status:doctype?'passed':'failed',observed:doctype?'Doctype HTML5 en tête du document.':'Doctype HTML5 absent en tête.'});
      const activeReferences = /<(?:script|iframe)\b|\s(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(html);
      report.checks.push({id:'references',title:'Indices de dépendances externes ou actives',status:activeReferences?'warning':'passed',
        observed:activeReferences?'Référence active ou externe repérée dans la source.':'Aucun motif script, iframe ou URL externe repéré.'});
      if (row.profile==='visual') {
        report.image=image; report.isolation=limits;
        const rendered: Rendered = await renderLab(row.source_html,row.id);
        const m = rendered.metrics;
        report.browser=m.version; report.driverSha256=rendered.driverSha256;
        for (const [id,title,ok,observed] of [
          ['title','Titre du document',m.hasTitle,m.hasTitle?'Titre non vide.':'Titre absent ou vide.'],
          ['language','Langue déclarée',m.language,m.language?'Langue déclarée.':'Langue absente.'],
          ['heading','Titre principal',m.h1===1,m.h1+' élément(s) h1.'],
          ['landmark','Région principale',m.main===1,m.main+' région(s) principale(s).'],
        ] as const) report.checks.push({id,title,status:ok?'passed':'failed',observed});
        png=rendered.screenshot;
        report.screenshotSha256=labDigest(png);
      }
    }
  } catch(error) {
    const failure=labFailureReason(error);
    report.checks.push({id:'execution',title:'Exécution complète',status:'not_run',observed:failure.observed+' ['+failure.code+']'});
  }
  report.elapsedMs=Date.now()-start;
  await pool.query(`UPDATE product_lab_runs SET state='finished',finished_at=clock_timestamp(),verdict=$2,
    result=$3,result_sha=$4,screenshot=$5,screenshot_sha=$6 WHERE id=$1 AND state='running'`,
    [row.id,decision(report.checks),report,digestJson(report),png,png?createHash('sha256').update(png).digest('hex'):null]);
  return true;
}
