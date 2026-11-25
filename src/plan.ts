import { digestJson, isFixtureId, isObject, isProjectId } from './contracts.ts';
import type { FixtureId, JsonObject, ProjectId } from './contracts.ts';

export const PLAN_VERSION = 'a1-requirements-v1';
export const RUBRIC_VERSION = 'a1-quality-v1';

export const PLAN: JsonObject = {
  version: PLAN_VERSION,
  input: 'synthetic-requirements-v1',
  aiBudgetCents: 0,
  parameters: { execution: 'trusted-local', externalEffects: false },
  steps: [
    {
      role: 'preparer',
      dependsOn: [],
      input: 'synthetic-requirements-v1',
      output: 'a1-prepared-requirements-v1',
      criterion: 'Remise du livrable lié à la source épinglée.',
      retry: 'Réattribuer après perte du bail si aucun checkpoint n’est enregistré.',
    },
    {
      role: 'verifier',
      dependsOn: ['preparer'],
      input: 'a1-prepared-requirements-v1',
      output: 'a1-quality-report-v1',
      criterion: 'Appliquer le référentiel qualité à la source et au checkpoint du préparateur.',
      rubricVersion: RUBRIC_VERSION,
      retry: 'Réutiliser le checkpoint du préparateur après interruption.',
    },
  ],
};

type Requirement = Readonly<{ id: string; title: string; minutes: number }>;

const REQUIREMENTS: Record<ProjectId, readonly Requirement[]> = {
  a: [
    { id: 'A-03', title: 'Confirmer la réservation fictive', minutes: 45 },
    { id: 'A-01', title: 'Consulter les créneaux fictifs', minutes: 30 },
    { id: 'A-02', title: 'Choisir un créneau fictif', minutes: 60 },
  ],
  b: [
    { id: 'B-02', title: 'Comptabiliser les colis fictifs', minutes: 55 },
    { id: 'B-01', title: 'Classer les arrivages fictifs', minutes: 25 },
  ],
};

type Source = Readonly<{
  projectId: ProjectId;
  fixtureId: FixtureId;
  requirements: readonly Requirement[];
}>;

function readSource(input: JsonObject): Source {
  const { projectId, fixtureId } = input;
  if (input.kind !== 'synthetic-requirements-v1' ||
      !isProjectId(projectId) || !isFixtureId(fixtureId) ||
      !isRequirementList(input.requirements)) {
    throw new Error('Source synthétique A1 invalide.');
  }
  return { projectId, fixtureId, requirements: input.requirements };
}

function isRequirementList(value: unknown): value is Requirement[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 20 &&
    value.every((row: unknown) => {
      if (!isObject(row)) return false;
      const { id, title, minutes } = row;
      return Object.keys(row).length === 3 &&
        typeof id === 'string' && /^[AB]-[0-9]{2}$/.test(id) &&
        typeof title === 'string' && title.length > 0 && title.length <= 120 &&
        typeof minutes === 'number' && Number.isSafeInteger(minutes) &&
        minutes >= -1_000 && minutes <= 1_000;
    });
}

export function getFixture(projectId: ProjectId, fixtureId: FixtureId): JsonObject {
  if (!isProjectId(projectId) || !isFixtureId(fixtureId)) {
    throw new Error('Jeu synthétique A1 inconnu.');
  }
  return {
    kind: 'synthetic-requirements-v1',
    projectId,
    fixtureId,
    requirements: REQUIREMENTS[projectId].map((row, index) => ({
      ...row,
      minutes: fixtureId === 'incorrect' && index === 0 ? 0 : row.minutes,
    })),
  };
}

export function prepare(input: JsonObject): JsonObject {
  const { projectId, fixtureId, requirements } = readSource(input);
  const ordered = requirements.map((row) => ({ ...row })).sort((a, b) => (
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  ));
  return {
    kind: 'a1-prepared-requirements-v1',
    planVersion: PLAN_VERSION,
    projectId,
    fixtureId,
    sourceDigest: digestJson(input),
    requirements: ordered,
    totalMinutes: ordered.reduce((total, row) => total + row.minutes, 0),
  };
}

// Fixed Quality Lab limits. The preparer formats the input without applying these rules.
const MIN_MINUTES = 15;
const MAX_MINUTES = 120;
const MAX_TOTAL_MINUTES = 240;

type Check = { id: string; label: string; passed: boolean; detail: string };

export function verify(fixture: JsonObject, artifact: Readonly<JsonObject>): JsonObject {
  const source = readSource(fixture);
  const sourceDigest = digestJson(fixture);
  const rows = isRequirementList(artifact.requirements) ? artifact.requirements : null;
  const byId = new Map(rows?.map((row) => [row.id, row]));
  const total = rows?.reduce((sum, row) => sum + row.minutes, 0);
  const declaredTotal = typeof artifact.totalMinutes === 'number' ? artifact.totalMinutes : 'invalide';
  const matchingRows = rows?.length === source.requirements.length &&
    byId.size === source.requirements.length &&
    source.requirements.every((expected) => {
      const actual = byId.get(expected.id);
      return actual?.title === expected.title && actual.minutes === expected.minutes;
    });
  const invalidEstimates = rows?.filter((row) => (
    row.minutes < MIN_MINUTES || row.minutes > MAX_MINUTES
  )) ?? [];
  const checks: Check[] = [
    {
      id: 'format',
      label: 'Format du livrable',
      passed: artifact.kind === 'a1-prepared-requirements-v1' && rows !== null &&
        Number.isSafeInteger(artifact.totalMinutes),
      detail: 'Livrable typé, liste d’exigences et total entier.',
    },
    {
      id: 'provenance',
      label: 'Source et plan',
      passed: artifact.planVersion === PLAN_VERSION && artifact.projectId === source.projectId &&
        artifact.fixtureId === source.fixtureId && artifact.sourceDigest === sourceDigest,
      detail: 'Projet, jeu synthétique, version du plan et empreinte de la source.',
    },
    {
      id: 'requirements',
      label: 'Exigences de la source',
      passed: matchingRows === true,
      detail: 'Une exigence par identifiant, avec le titre et l’estimation de la source.',
    },
    {
      id: 'estimates',
      label: 'Bornes des estimations',
      passed: rows !== null && invalidEstimates.length === 0,
      detail: invalidEstimates.length > 0
        ? invalidEstimates.map((row) => `${row.id} : ${row.minutes} min, attendu ${MIN_MINUTES}–${MAX_MINUTES} min.`).join(' ')
        : `Chaque exigence doit être estimée entre ${MIN_MINUTES} et ${MAX_MINUTES} minutes.`,
    },
    {
      id: 'total',
      label: 'Total des estimations',
      passed: total !== undefined && artifact.totalMinutes === total && total <= MAX_TOTAL_MINUTES,
      detail: total === undefined
        ? 'Impossible de recalculer le total sans une liste valide.'
        : `Total annoncé : ${declaredTotal}. Total recalculé : ${total} min. Maximum : ${MAX_TOTAL_MINUTES} min.`,
    },
  ];
  return {
    kind: 'a1-quality-report-v1',
    planVersion: PLAN_VERSION,
    projectId: source.projectId,
    fixtureId: source.fixtureId,
    rubricVersion: RUBRIC_VERSION,
    sourceDigest,
    artifactDigest: digestJson(artifact),
    passed: checks.every((check) => check.passed),
    checks,
  };
}
