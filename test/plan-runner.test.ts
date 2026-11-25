import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digestJson } from '../src/contracts.ts';
import type { Assignment } from '../src/contracts.ts';
import { getFixture, PLAN_VERSION, prepare, verify } from '../src/plan.ts';
import { runOnce } from '../src/runner.ts';

test('the preparer is deterministic and the rubric rejects both incorrect fixtures', () => {
  for (const projectId of ['a', 'b'] as const) {
    const nominal = getFixture(projectId, 'nominal');
    const candidate = prepare(nominal);
    assert.equal(candidate.projectId, projectId);
    assert.deepEqual(candidate, prepare(getFixture(projectId, 'nominal')));
    assert.equal(verify(nominal, candidate).passed, true);

    const incorrect = getFixture(projectId, 'incorrect');
    const wrongCandidate = prepare(incorrect);
    const report = verify(incorrect, wrongCandidate);
    assert.equal(report.passed, false);
    assert.equal(report.artifactDigest, digestJson(wrongCandidate));
    assert.ok(Array.isArray(report.checks));
    assert.deepEqual(report.checks.filter((check) => !check.passed).map((check) => check.id), ['estimates']);
  }
});

test('the verifier checks source provenance and recomputes totals', () => {
  const sourceA = getFixture('a', 'nominal');
  const sourceB = getFixture('b', 'nominal');
  const resultA = prepare(sourceA);
  assert.equal(verify(sourceB, resultA).passed, false);
  assert.equal(verify(sourceA, { ...resultA, totalMinutes: 1, passed: true }).passed, false);
});

const baseUrl = 'http://127.0.0.1:3030';
const token = 'synthetic-test-token';

function assignmentForVerifier(): Assignment {
  const input = prepare(getFixture('b', 'incorrect'));
  return {
    attemptId: 'attempt-local',
    generation: 2,
    missionId: 'mission-local',
    projectId: 'b',
    role: 'verifier',
    fixtureId: 'incorrect',
    leaseUntil: new Date(Date.now() + 10_000).toISOString(),
    input,
    inputDigest: digestJson(input),
    planVersion: PLAN_VERSION,
  };
}

test('the runner submits the verifier report within the assignment scope', async () => {
  const assignment = assignmentForVerifier();
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async (input, options) => {
    assert.equal(options?.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer ' + token);
    paths.push(new URL(String(input)).pathname);
    if (paths.length === 1) {
      assert.deepEqual(JSON.parse(String(options.body)), {});
      return Response.json({ assignment });
    }
    assert.deepEqual(JSON.parse(String(options.body)), {
      generation: 2,
      result: verify(getFixture('b', 'incorrect'), assignment.input),
    });
    return new Response(null, { status: 204 });
  };
  assert.equal(await runOnce({ baseUrl, token, fetchImpl }), true);
  assert.deepEqual(paths, ['/api/runner/claim', '/api/runner/attempts/attempt-local/complete']);
});

test('the runner never submits a stale or corrupted assignment', async () => {
  for (const [changes, error] of [
    [{ inputDigest: 'corrupted' }, /Attribution A1 invalide/],
    [{ leaseUntil: new Date(0).toISOString() }, /bail a expiré/],
  ] as const) {
    let requests = 0;
    const assignment = { ...assignmentForVerifier(), ...changes };
    const fetchImpl: typeof fetch = async () => {
      requests += 1;
      return Response.json({ assignment });
    };
    await assert.rejects(runOnce({ baseUrl, token, fetchImpl }), error);
    assert.equal(requests, 1);
  }
});

test('un runtime qui atteint son échéance ne remet aucun résultat', async () => {
  const assignment = {...assignmentForVerifier(),leaseUntil:new Date(Date.now()+150).toISOString()};
  let requests = 0;
  const fetchImpl: typeof fetch = async () => {
    requests++;
    return Response.json({assignment});
  };
  const runtime = { id:'test-delayed', async execute(_: Assignment, signal: AbortSignal) {
    const {setTimeout} = await import('node:timers/promises');
    await setTimeout(300,undefined,{signal});
    return {};
  }};
  await assert.rejects(runOnce({baseUrl,token,fetchImpl,runtime}), /abort|expir/i);
  assert.equal(requests,1);
});

test('the preparer refuses another project fixture even if the digest is valid', async () => {
  const input = getFixture('a', 'incorrect');
  const assignment: Assignment = {
    ...assignmentForVerifier(),
    role: 'preparer',
    input,
    inputDigest: digestJson(input),
  };
  let requests = 0;
  const fetchImpl: typeof fetch = async () => {
    requests += 1;
    return Response.json({ assignment });
  };
  await assert.rejects(runOnce({ baseUrl, token, fetchImpl }), /jeu synthétique autorisé/);
  assert.equal(requests, 1);
});

test('the runner refuses a non-loopback origin before sending its token', async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return Response.json({ assignment: null });
  };
  await assert.rejects(runOnce({ baseUrl: 'http://example.invalid', token, fetchImpl }), /boucle locale/);
  assert.equal(called, false);
  assert.equal(await runOnce({ baseUrl, token, fetchImpl }), false);
});
