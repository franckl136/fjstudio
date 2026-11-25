import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const evidenceRoot = fileURLToPath(new URL('../docs/evidence/g51/', import.meta.url));
export const resultLabels = {
  passed: 'Réussi', failed: 'Échoué', not_run: 'Non exécuté', uncertain: 'Incertain', partial: 'Qualification partielle',
} as const;
type State = keyof typeof resultLabels;
type Scenario = { id: string; title: string; fault: string; critical: boolean; minimum: number;
  prerequisites: string; steps: string[]; expected: string };
type Profile = { id: string; title: string; scenarios: Scenario[] };
type Evidence = { file: string; step: string };
type Result = { scenario: string; state: State; level: number; observed: string; evidence: Evidence[];
  outcome?: string };
type Run = { id: string; profile: string; version: string; variant: string; environment: string; fixture: string;
  mission: string; project: string; results: Result[] };
export type Catalog = { schema: 'fjstudio-qualification-v1'; profiles: Profile[]; runs: Run[]; artifacts: Record<string,string> };

const slug = /^[a-z0-9][a-z0-9-]{0,95}$/;
const artifactName = /^[a-z0-9][a-z0-9-]{0,100}\.(?:json|png|txt)$/;
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error('Dossier de qualification invalide · ' + message);
}
function uniqueIds(rows: {id: string}[]) {
  return new Set(rows.map(row => row.id)).size === rows.length && rows.every(row => slug.test(row.id));
}
function filled(value: unknown) { return typeof value === 'string' && value.trim().length > 0 }
function validLevel(n: number) { return Number.isInteger(n) && n >= 1 && n <= 6 }

export function validateCatalog(c: Catalog) {
  check(c.schema === 'fjstudio-qualification-v1' && Array.isArray(c.profiles) && c.profiles.length &&
    Array.isArray(c.runs) && c.runs.length && c.artifacts && typeof c.artifacts === 'object', 'format');
  check(uniqueIds(c.profiles) && uniqueIds(c.runs), 'identifiants de profil ou de passage');
  for (const [name, hash] of Object.entries(c.artifacts))
    check(artifactName.test(name) && typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash), 'empreinte de pièce');
  for (const p of c.profiles) {
    check(filled(p.title) && Array.isArray(p.scenarios) && uniqueIds(p.scenarios) && p.scenarios.some(s => s.critical), 'profil sans critères critiques uniques');
    for (const s of p.scenarios) check([s.title,s.expected,s.prerequisites,s.fault].every(filled) &&
      typeof s.critical === 'boolean' && validLevel(s.minimum) && s.minimum >= 3 && Array.isArray(s.steps) &&
      s.steps.length && s.steps.every(filled), 'contrat de scénario ' + s.id);
  }
  for (const r of c.runs) {
    const p = c.profiles.find(row => row.id === r.profile);
    check(p && [r.variant,r.environment,r.fixture,r.project].every(filled) && /^[a-f0-9]{40}$/.test(r.version) &&
      /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(r.mission), 'identité du passage ' + r.id);
    check(Array.isArray(r.results) && new Set(r.results.map(row => row.scenario)).size === r.results.length, 'résultats en double');
    for (const row of r.results) {
      check(p.scenarios.some(s => s.id === row.scenario) && Object.hasOwn(resultLabels,row.state) &&
        validLevel(row.level) && filled(row.observed) && Array.isArray(row.evidence), 'résultat ' + row.scenario);
      check(row.evidence.every(ref => Object.hasOwn(c.artifacts,ref.file) && filled(ref.step)), 'référence de preuve');
      if (row.state === 'passed' || row.state === 'failed') check(row.level >= 3 && row.evidence.length, 'constat sans mesure');
      if (row.outcome !== undefined) check(filled(row.outcome), 'signature de comparaison');
    }
  }
  return c;
}

export async function verifiedArtifact(c: Catalog, name: string, root = evidenceRoot) {
  check(artifactName.test(name) && Object.hasOwn(c.artifacts,name), 'pièce inconnue');
  const path = join(root,name);
  const info = await lstat(path);
  check(info.isFile() && info.size <= 12 * 1024 * 1024, 'type ou taille de pièce');
  const bytes = await readFile(path);
  check(createHash('sha256').update(bytes).digest('hex') === c.artifacts[name], 'empreinte de ' + name);
  return bytes;
}

export async function readCatalog(root = evidenceRoot) {
  const c = validateCatalog(JSON.parse(await readFile(join(root,'catalog.json'),'utf8')));
  await Promise.all(Object.keys(c.artifacts).map(name => verifiedArtifact(c,name,root)));
  return c;
}

export function assess(c: Catalog, id: string) {
  const run = c.runs.find(r => r.id === id);
  check(run, 'passage inconnu');
  const profile = c.profiles.find(p => p.id === run.profile)!;
  const rows = profile.scenarios.map(s => {
    const row = run.results.find(r => r.scenario === s.id);
    const state: State = !row ? 'not_run' : row.state === 'passed' && row.level < s.minimum ? 'partial' : row.state;
    return { ...s, state, level: row?.level ?? null, observed: row?.observed ?? 'Aucune mesure remise.',
      evidence: row?.evidence ?? [], outcome: row?.outcome };
  });
  const verdict = rows.some(s => s.critical && s.state === 'failed') ? 'FAIL' :
    rows.some(s => s.critical && s.state !== 'passed') ? 'NOT QUALIFIED' :
    rows.some(s => s.state !== 'passed') ? 'PASS WITH RESERVATIONS' : 'PASS';
  return {run, title: profile.title, rows, verdict};
}

export function compareRuns(c: Catalog, before: string, after: string) {
  const a = assess(c,before), b = assess(c,after);
  check(a.run.profile === b.run.profile && a.run.project === b.run.project && a.run.environment === b.run.environment &&
    a.run.fixture === b.run.fixture, 'comparaison entre profils, environnements ou jeux de données différents');
  return b.rows.map((right,index) => {
    const left = a.rows[index];
    let change = 'indéterminé';
    if (left.state === 'failed' && right.state === 'passed') change = 'correction';
    else if (left.state === 'passed' && right.state === 'failed') change = 'régression';
    else if ((left.state === 'partial' || left.state === 'uncertain') && right.state === 'passed') change = 'qualification améliorée';
    else if (left.state === right.state && ['passed','failed'].includes(right.state) && left.outcome && right.outcome)
      change = left.outcome === right.outcome ? 'comportement inchangé' : 'divergence';
    return {scenario: right.id, before: left.state, after: right.state, change};
  });
}
