import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';
import { createPool } from '../src/config.ts';
import { Core, migrate } from '../src/core.ts';
import { createServer } from '../src/http.ts';
import { digestJson, type Credential, type Runner } from '../src/contracts.ts';
import {
  claimControl,
  completeControl,
  heartbeatControl,
  quarantineControl,
  sweepControl,
} from '../src/control-room-queue.ts';
import { commandMission, controlDetail, createControlMission } from '../src/control-room.ts';
import { executeControl } from '../src/control-room-adapters.ts';
import { runControlOnce } from '../src/control-room-worker.ts';

const actor = { id: 'operator-demo', projectIds: ['a'] as const };
const preparer: Runner = { id: 'control-preparer', projectId: 'a', role: 'preparer' };
const verifier: Runner = { id: 'control-verifier', projectId: 'a', role: 'verifier' };
const brief = {
  objective: 'Qualifier le mode local',
  scope: 'La note fournie pour la recette.',
  constraints: 'Lecture du document fourni.',
  document: '# Installation\nUtiliser la boucle locale.\n\n## Reprise\nLes points de contrôle sont vérifiés.',
  criteria: ['boucle locale', 'points de contrôle'],
  risk: 'normal',
  durationMinutes: 10,
};
let admin: Pool, db: Pool, name: string, created: boolean;
beforeEach(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  admin = createPool(url.href);
  name = 'fjstudio_a1_test_' + randomUUID().replaceAll('-', '');
  created = false;
  await admin.query('CREATE DATABASE ' + name + ' TEMPLATE template0');
  created = true;
  url.pathname = '/' + name;
  db = createPool(url.href);
  await migrate(db);
});
afterEach(async () => {
  try {
    if (db) await db.end();
    if (created) await admin.query('DROP DATABASE ' + name);
  } finally {
    await admin?.end();
  }
});
async function start(risk = 'normal', criteria = brief.criteria) {
  const { id } = await createControlMission(db, actor, 'a', randomUUID(), { ...brief, risk, criteria });
  await commandMission(db, actor, 'a', id, 'plan', randomUUID(), 1);
  return id;
}
async function issue(runner: Runner) {
  const a = await claimControl(db, runner);
  assert.ok(a);
  return a;
}
test('Control Room · décision, périmètre révisé et commande idempotente en concurrence', async () => {
  await assert.rejects(
    createControlMission(db, { ...actor, accountRole: 'viewer' }, 'a', randomUUID(), brief),
    /lecture/,
  );
  const key = randomUUID();
  const [first, replay] = await Promise.all(
    [1, 2].map(() => createControlMission(db, actor, 'a', key, brief)),
  );
  assert.equal(first.id, replay.id);
  await assert.rejects(createControlMission(db, actor, 'a', key, { ...brief, objective: 'Autre' }), /clé/);
  const id = first.id;
  await commandMission(db, actor, 'a', id, 'edit', randomUUID(), 1, { ...brief, risk: 'review' });
  await assert.rejects(commandMission(db, actor, 'a', id, 'plan', randomUUID(), 1), /changé/);
  const planKey = randomUUID();
  await commandMission(db, actor, 'a', id, 'plan', planKey, 2);
  await commandMission(db, actor, 'a', id, 'plan', planKey, 2);
  const pending = await controlDetail(db, actor, 'a', id);
  assert.equal(pending.mission.status, 'needs_approval');
  assert.equal(await claimControl(db, preparer), null);
  assert.equal(pending.events.filter((e) => e.event_type === 'plan.frozen').length, 1);
  await commandMission(db, actor, 'a', id, 'reject', randomUUID(), 3);
  const replayKey = randomUUID();
  const fork = await commandMission(db, actor, 'a', id, 'relaunch', replayKey, 4);
  assert.notEqual(id, fork.id);
  const child = await controlDetail(db, actor, 'a', fork.id);
  assert.equal(child.mission.parent_id, id);
  assert.equal(child.mission.status, 'draft');
  await assert.rejects(controlDetail(db, { ...actor, projectIds: ['b'] }, 'a', id), /introuvable/);
});
test('Control Room · quotas du projet, du runner et du poste pendant des demandes concurrentes', async () => {
  await db.query("INSERT INTO projects(id,name,context) VALUES('c','Troisième projet de test','{}')");
  for (const project of ['a', 'b', 'c']) {
    const account = { id: actor.id, projectIds: [project] };
    for (let i = 0; i < 2; i++) {
      const { id } = await createControlMission(db, account, project, randomUUID(), brief);
      await commandMission(db, account, project, id, 'plan', randomUUID(), 1);
    }
  }
  const first: Runner[] = [
    { id: 'a1', projectId: 'a', role: 'preparer' },
    { id: 'a2', projectId: 'a', role: 'verifier' },
  ];
  assert.ok((await Promise.all(first.map((r) => claimControl(db, r)))).every(Boolean));
  assert.equal(await claimControl(db, { id: 'a3', projectId: 'a', role: 'preparer' }), null);
  assert.equal(await claimControl(db, first[0]), null);
  const extra: Runner[] = ['b', 'c'].flatMap((p) => [
    { id: p + '1', projectId: p, role: 'preparer' as const },
    { id: p + '2', projectId: p, role: 'verifier' as const },
  ]);
  assert.equal((await Promise.all(extra.map((r) => claimControl(db, r)))).filter(Boolean).length, 2);
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM control_attempts WHERE state='running'")).rows[0].n,
    4,
  );
});
test('Control Room · deux baux simultanés, dépendances, vérification des preuves et clôture unique', async () => {
  const id = await start('review');
  await commandMission(db, actor, 'a', id, 'approve', randomUUID(), 2);
  const [index, coverage] = await Promise.all([issue(preparer), issue(verifier)]);
  assert.equal(index.missionId, id);
  assert.equal(index.task, 'structure');
  assert.equal(coverage.task, 'coverage');
  assert.equal(
    (await controlDetail(db, actor, 'a', id)).attempts.filter((a) => a.state === 'running').length,
    2,
  );
  assert.equal(await claimControl(db, verifier), null);
  await assert.rejects(
    heartbeatControl(db, { ...preparer, projectId: 'b' }, index.attemptId, index.generation),
    /introuvable/,
  );
  await assert.rejects(
    completeControl(db, preparer, coverage.attemptId, coverage.generation, {}),
    /introuvable/,
  );
  const until = await heartbeatControl(db, preparer, index.attemptId, index.generation);
  assert.ok(+until > Date.now());
  const ic = executeControl(index),
    cc = executeControl(coverage);
  await completeControl(db, verifier, coverage.attemptId, coverage.generation, cc);
  assert.equal(await claimControl(db, verifier), null);
  await completeControl(db, preparer, index.attemptId, index.generation, ic);
  await completeControl(db, preparer, index.attemptId, index.generation, ic);
  const synth = await issue(verifier);
  assert.equal(synth.task, 'synthesis');
  assert.equal(synth.input.evidence.length, 2);
  const result = executeControl(synth);
  assert.equal(result.verdict, 'PASS');
  assert.equal(await completeControl(db, verifier, synth.attemptId, synth.generation, result), true);
  const final = await controlDetail(db, actor, 'a', id);
  assert.equal(final.mission.status, 'completed');
  assert.equal(final.events.filter((e) => e.event_type === 'checkpoint.accepted').length, 3);
  assert.equal(
    final.tasks.every((t) => t.sha256 === digestJson(t.result)),
    true,
  );
  const cmp = final.tasks.find((t) => t.task_key === 'coverage')!;
  assert.deepEqual(
    cmp.result.matches.map((m: { lines: number[] }) => m.lines),
    [[2], [5]],
  );
});
test('Control Room · pause, attribution périmée, annulation et mise en quarantaine après restauration', async () => {
  const id = await start();
  const a = await issue(preparer);
  await commandMission(db, actor, 'a', id, 'pause', randomUUID(), 3);
  await assert.rejects(completeControl(db, preparer, a.attemptId, a.generation, executeControl(a)), /bail/);
  assert.equal(await claimControl(db, preparer), null);
  await commandMission(db, actor, 'a', id, 'resume', randomUUID(), 4);
  const b = await issue(preparer);
  assert.equal(b.generation, 2);
  assert.equal(await quarantineControl(db), 1);
  const frozen = await controlDetail(db, actor, 'a', id);
  assert.equal(frozen.mission.reason, 'restored');
  assert.equal(frozen.mission.status, 'blocked');
  assert.equal(await claimControl(db, preparer), null);
  const fork = await commandMission(db, actor, 'a', id, 'relaunch', randomUUID(), frozen.mission.revision);
  await commandMission(db, actor, 'a', fork.id, 'cancel', randomUUID(), 1);
  assert.equal((await controlDetail(db, actor, 'a', fork.id)).mission.status, 'cancelled');
});
test('Control Room · reprise bornée des baux, remise non conforme et échéance de mission', async () => {
  const id = await start();
  for (let i = 1; i <= 3; i++) {
    const a = await issue(preparer);
    assert.equal(a.generation, i);
    if (i === 1) {
      await db.query(
        "UPDATE control_attempts SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
        [a.attemptId],
      );
      await sweepControl(db);
    } else {
      assert.equal(await completeControl(db, preparer, a.attemptId, i, { invented: true }), false);
    }
  }
  const exhausted = await controlDetail(db, actor, 'a', id);
  assert.equal(exhausted.mission.reason, 'attempt_limit');
  assert.equal(
    exhausted.tasks.some((t) => t.sha256 !== null),
    false,
  );
  const overdue = await start();
  await db.query(
    "UPDATE control_missions SET deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [overdue],
  );
  await sweepControl(db);
  assert.equal((await controlDetail(db, actor, 'a', overdue)).mission.reason, 'deadline');
});
test('Control Room · chemin public HTTP, runner local, rapport FAIL vérifiable et séparation des identités', async (t) => {
  const token = (s: string) => s.padEnd(40, 'x');
  const credentials: Credential[] = [
    { kind: 'operator', id: actor.id, projectIds: ['a'], token: token('fixture-operator') },
    { kind: 'runner', ...preparer, token: token('fixture-preparer') },
    { kind: 'runner', ...verifier, token: token('fixture-verifier') },
  ];
  const server = createServer(new Core(db), credentials);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  );
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const path = base + '/api/projects/a/control';
  const headers = { authorization: 'Bearer ' + credentials[0].token, 'content-type': 'application/json' };
  const response = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...brief, criteria: ['terme volontairement absent'], commandKey: randomUUID() }),
  });
  assert.equal(response.status, 201);
  const { id } = (await response.json()) as { id: string };
  assert.equal(
    (
      await fetch(path + '/' + id + '/plan', {
        method: 'POST',
        headers,
        body: JSON.stringify({ revision: 1, commandKey: randomUUID() }),
      })
    ).status,
    200,
  );
  assert.equal(
    (await fetch(path + '/' + id, { headers: { authorization: 'Bearer ' + credentials[1].token } })).status,
    403,
  );
  assert.equal(
    (await fetch(base + '/api/runner/control/claim', { method: 'POST', headers, body: '{}' })).status,
    403,
  );
  assert.deepEqual(await Promise.all(credentials.slice(1).map((r) => runControlOnce(base, r.token))), [
    true,
    true,
  ]);
  assert.equal(await runControlOnce(base, credentials[2].token), true);
  const summary = await fetch(path + '/' + id + '/report', { headers });
  assert.match(summary.headers.get('content-disposition') ?? '', /attachment/);
  const report = (await summary.json()) as Awaited<ReturnType<typeof controlDetail>>;
  assert.equal(report.mission.status, 'failed');
  assert.equal(report.tasks.at(-1)?.result.verdict, 'FAIL');
});
test('Control Room · le superviseur réel mène une mission jusqu’au verdict en deux processus de rôles distincts', async () => {
  const id = await start();
  const identities: Credential[] = [preparer, verifier].map((r) => ({
    ...r,
    kind: 'runner',
    token: randomUUID().replaceAll('-', ''),
  }));
  const server = createServer(new Core(db), identities);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../scripts/control-worker.ts', import.meta.url))],
    {
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        A1_BASE_URL: base,
        A1_CREDENTIALS_JSON: JSON.stringify(identities),
      },
    },
  );
  const stopped = once(child, 'exit');
  try {
    const until = Date.now() + 12000;
    let state = await controlDetail(db, actor, 'a', id);
    while (state.mission.status !== 'completed' && Date.now() < until && child.exitCode === null) {
      await delay(100);
      state = await controlDetail(db, actor, 'a', id);
    }
    assert.equal(state.mission.status, 'completed');
    assert.deepEqual(new Set(state.attempts.map((a) => a.runner_id)), new Set([preparer.id, verifier.id]));
    assert.equal(state.tasks.at(-1)?.result.verdict, 'PASS');
  } finally {
    if (child.exitCode === null) child.kill();
    await stopped;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
