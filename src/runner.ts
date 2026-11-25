import { digestJson, isFixtureId, isObject, isProjectId } from './contracts.ts';
import type { Assignment, JsonObject } from './contracts.ts';
import { getFixture, PLAN_VERSION, prepare, verify } from './plan.ts';

type RunnerOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
};

function localOrigin(baseUrl: string): string {
  const url = URL.parse(baseUrl);
  if (url && url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === '[::1]') &&
      !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) {
    return url.origin;
  }
  throw new Error('Le runner A1 accepte uniquement une origine HTTP sur la boucle locale.');
}

function readAssignment(value: unknown): Assignment {
  if (!isObject(value) ||
      typeof value.attemptId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.attemptId) ||
      typeof value.missionId !== 'string' || !value.missionId ||
      typeof value.generation !== 'number' || !Number.isSafeInteger(value.generation) ||
      value.generation < 0 ||
      !isProjectId(value.projectId) || !isFixtureId(value.fixtureId) ||
      (value.role !== 'preparer' && value.role !== 'verifier') ||
      value.planVersion !== PLAN_VERSION ||
      typeof value.leaseUntil !== 'string' || !Number.isFinite(Date.parse(value.leaseUntil)) ||
      !isObject(value.input) ||
      typeof value.inputDigest !== 'string' || digestJson(value.input) !== value.inputDigest) {
    throw new Error('Attribution A1 invalide.');
  }
  return value as Assignment;
}

export async function runOnce({
  baseUrl,
  token,
  fetchImpl = fetch,
}: RunnerOptions): Promise<boolean> {
  const origin = localOrigin(baseUrl);
  if (fetchImpl === fetch && (process.env.NODE_USE_ENV_PROXY === '1' ||
      process.execArgv.includes('--use-env-proxy') ||
      process.env.NODE_OPTIONS?.includes('--use-env-proxy'))) {
    throw new Error('Le runner A1 exige une connexion locale sans proxy.');
  }
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const claim = await fetchImpl(`${origin}/api/runner/claim`, {
    method: 'POST',
    headers,
    body: '{}',
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  if (!claim.ok) throw new Error(`Attribution refusée (HTTP ${claim.status}).`);
  const payload: unknown = await claim.json();
  if (!isObject(payload)) throw new Error('Réponse d’attribution A1 invalide.');
  if (payload.assignment === null) return false;

  const assignment = readAssignment(payload.assignment);
  const deadline = Date.parse(assignment.leaseUntil);
  if (deadline <= Date.now()) throw new Error('Le bail a expiré avant l’exécution.');
  const fixture = getFixture(assignment.projectId, assignment.fixtureId);
  let result: JsonObject;
  if (assignment.role === 'preparer') {
    if (digestJson(fixture) !== assignment.inputDigest) {
      throw new Error('La source du préparateur ne correspond pas au jeu synthétique autorisé.');
    }
    result = prepare(assignment.input);
  } else {
    result = verify(fixture, assignment.input);
  }
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Le bail a expiré avant la remise.');

  const completion = await fetchImpl(`${origin}/api/runner/attempts/${assignment.attemptId}/complete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ generation: assignment.generation, result }),
    redirect: 'error',
    signal: AbortSignal.timeout(Math.min(remaining, 5_000)),
  });
  if (completion.status !== 204) {
    throw new Error(`Remise refusée (HTTP ${completion.status}).`);
  }
  return true;
}
