import { createHash } from 'node:crypto';
import { digestJson, type JsonObject, type ProjectId, type Role } from './contracts.ts';

export const controlVersion = 'document-review-v1';
export const controlLimits = {
  global: 4,
  project: 2,
  mission: 2,
  runner: 1,
  failures: 3,
  leaseSeconds: 20,
  queuePerProject: 32,
};
export type TaskKey = 'structure' | 'coverage' | 'synthesis';
type Reading = { key: TaskKey; role: Role; label: string; capability: string; dependencies: TaskKey[] };
export const documentPlan: readonly Reading[] = [
  {
    key: 'structure',
    role: 'preparer',
    label: 'Indexer le document',
    capability: 'document.structure',
    dependencies: [],
  },
  {
    key: 'coverage',
    role: 'verifier',
    label: 'Repérer les critères',
    capability: 'document.coverage',
    dependencies: [],
  },
  {
    key: 'synthesis',
    role: 'verifier',
    label: 'Vérifier les preuves',
    capability: 'evidence.verify',
    dependencies: ['structure', 'coverage'],
  },
];

export interface KnowledgeRef {
  id: string;
  version: number;
  title: string;
  content: string;
  digest: string;
}
export interface ControlInput {
  objective: string;
  scope: string;
  constraints: string;
  briefDetails?:Record<string,string>;
  document: string;
  criteria: string[];
  sourceSha256: string;
  context: KnowledgeRef[];
  evidence: { key: TaskKey; sha256: string }[];
}
export interface ControlAssignment {
  attemptId: string;
  missionId: string;
  projectId: ProjectId;
  generation: number;
  task: TaskKey;
  leaseUntil: string;
  version: string;
  input: ControlInput;
}
export const documentHash = (source: string) => createHash('sha256').update(source).digest('hex');
function folded(text: string) {
  return text.normalize('NFC').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
}
function structure(input: ControlInput): JsonObject {
  const lines = input.document.split(/\r?\n/);
  const headings: { line: number; level: number; title: string }[] = [];
  let sectionCount = 0;
  for (const [index, line] of lines.entries()) {
    const match = /^(#{1,6})\s+(.+)/u.exec(line.trim());
    if (match) {
      sectionCount++;
      if (headings.length < 32)
        headings.push({ line: index + 1, level: match[1].length, title: match[2].trim().slice(0, 120) });
    }
  }
  return { sourceSha256: input.sourceSha256, lineCount: lines.length, sectionCount, headings };
}
function coverage(input: ControlInput): JsonObject {
  const lines = input.document.split(/\r?\n/).map(folded);
  const matches = input.criteria.map((criterion) => {
    const wanted = folded(criterion);
    const positions: number[] = [];
    for (let i = 0; i < lines.length && positions.length < 5; i++) {
      if (lines[i].includes(wanted)) positions.push(i + 1);
    }
    return { criterion, lines: positions, covered: positions.length > 0 };
  });
  return { sourceSha256: input.sourceSha256, matches, allCovered: matches.every((item) => item.covered) };
}
function synthesis(input: ControlInput): JsonObject {
  const index = structure(input);
  const findings = coverage(input);
  const verified =
    input.evidence.length === 2 &&
    [
      ['structure', index],
      ['coverage', findings],
    ].every(([key, artifact]) =>
      input.evidence.some((entry) => entry.key === key && entry.sha256 === digestJson(artifact)),
    );
  if (!verified) throw new Error('Empreinte des preuves amont incohérente.');
  return {
    sourceSha256: input.sourceSha256,
    verified,
    verdict: findings.allCovered ? 'PASS' : 'FAIL',
    evidence: input.evidence,
    context: input.context.map((k) => ({ id: k.id, version: k.version, digest: k.digest })),
    rule: 'Chaque expression attendue doit apparaître sur une ligne du document soumis.',
  };
}

/** Receives a bounded document in memory. The adapter has no credential, filesystem or network capability. */
export interface ControlAdapter {
  readonly id: string;
  readonly capability: string;
  execute(input: ControlInput): JsonObject;
}
export const controlAdapters: Record<TaskKey, ControlAdapter> = {
  structure: { id: 'studio-markdown-index-v1', capability: 'document.structure', execute: structure },
  coverage: { id: 'studio-criteria-lines-v1', capability: 'document.coverage', execute: coverage },
  synthesis: { id: 'studio-evidence-verifier-v1', capability: 'evidence.verify', execute: synthesis },
};
export function executeControl(assignment: ControlAssignment): JsonObject {
  if (
    assignment.version !== controlVersion ||
    !Object.hasOwn(controlAdapters, assignment.task) ||
    !assignment.input.document ||
    assignment.input.document.length > 10000 ||
    assignment.input.criteria.length < 1 ||
    assignment.input.criteria.length > 12 ||
    assignment.input.sourceSha256 !== documentHash(assignment.input.document)
  )
    throw new Error('Attribution du Control Room invalide.');
  return controlAdapters[assignment.task].execute(assignment.input);
}
