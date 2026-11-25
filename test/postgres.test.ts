import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { after, afterEach, before, beforeEach, test } from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Pool } from "pg";
import { composeDatabaseUrl } from "../scripts/postgres-tools.ts";
import { createPool } from "../src/config.ts";
import type { Assignment, Credential, FixtureId, ProjectId } from "../src/contracts.ts";
import { digestJson } from "../src/contracts.ts";
import { deterministicRuntime } from "../src/agent-runtime.ts";
import { capabilityLabels, requireCapability, type Capability } from "../src/agents.ts";
import { Core, migrate, migrationNames } from "../src/core.ts";
import { createServer } from "../src/http.ts";
import { getFixture, prepare, verify } from "../src/plan.ts";
import { runOnce } from "../src/runner.ts";

const credentials: Credential[] = [
  { token: "fake-test-operator-a".padEnd(32, "_"), kind: "operator", id: "operator-a", projectIds: ["a"] },
  { token: "fake-test-operator-b".padEnd(32, "_"), kind: "operator", id: "operator-b", projectIds: ["b"] },
  { token: "fake-test-preparer-a".padEnd(32, "_"), kind: "runner", id: "preparer-a", projectId: "a", role: "preparer" },
  { token: "fake-test-preparer-alt-a".padEnd(32, "_"), kind: "runner", id: "preparer-alt-a", projectId: "a", role: "preparer" },
  { token: "fake-test-verifier-a".padEnd(32, "_"), kind: "runner", id: "verifier-a", projectId: "a", role: "verifier" },
  { token: "fake-test-preparer-b".padEnd(32, "_"), kind: "runner", id: "preparer-b", projectId: "b", role: "preparer" },
  { token: "fake-test-verifier-b".padEnd(32, "_"), kind: "runner", id: "verifier-b", projectId: "b", role: "verifier" },
];
const createdDatabases = new Set<string>();
const lead = "operator-a";
const command = promisify(execFile);
const repository = fileURLToPath(new URL("../", import.meta.url));

let admin: Pool;
let adminUrl: string;
let db: Pool;
let testDatabase: string;
let restoreTarget: string;
let connectionString: string;

before(async () => {
  const setup = composeDatabaseUrl();
  assert.equal(setup.pathname, "/fjstudio_a1", "Use DATABASE_URL from npm run setup:local for the disposable PostgreSQL test databases.");
  adminUrl = setup.href;
  admin = createPool(adminUrl);
});

beforeEach(async () => {
  const suffix = randomUUID().replaceAll("-", "");
  testDatabase = "fjstudio_a1_test_" + suffix;
  restoreTarget = "fjstudio_a1_restore_" + suffix;
  const setup = new URL(adminUrl);
  await admin.query(`CREATE DATABASE ${testDatabase} TEMPLATE template0`);
  createdDatabases.add(testDatabase);
  setup.pathname = "/" + testDatabase;
  connectionString = setup.href;
  db = createPool(connectionString);
  await migrate(db);
});

afterEach(async () => {
  if (db) await db.end();
});

after(async () => {
  if (admin) {
    try {
      for (const name of createdDatabases) await admin.query(`DROP DATABASE ${name}`);
    } finally {
      await admin.end();
    }
  }
});

async function startStudio(
  t: TestContext,
  options: ConstructorParameters<typeof Core>[1] = {},
  connection = connectionString,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const pool = createPool(connection);
  const server = createServer(new Core(pool, options), credentials);
  let closing: Promise<void> | undefined;
  const close = () => (closing ??= closeServer(server).finally(() => pool.end()));
  t.after(close);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  return { baseUrl: `http://127.0.0.1:${address.port}`, close };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

function tokenFor(id: string): string {
  const credential = credentials.find(item => item.id === id);
  assert(credential, "Unknown synthetic test actor");
  return credential.token;
}

async function request(baseUrl: string, path: string, actor?: string, body?: object): Promise<Response> {
  const headers: Record<string, string> = {};
  if (actor) headers.authorization = "Bearer " + tokenFor(actor);
  if (body) headers["content-type"] = "application/json";
  return fetch(baseUrl + path, {
    method: body ? "POST" : "GET",
    headers,
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  });
}

async function responseJson<T>(response: Response, wanted: number): Promise<T> {
  const payload = await response.text();
  assert.equal(response.status, wanted, payload);
  return JSON.parse(payload) as T;
}

async function noContent(response: Response, status = 204): Promise<void> {
  assert.equal(response.status, status, await response.text());
}

async function createMission(baseUrl: string, project: ProjectId = "a", fixtureId: FixtureId = "nominal"): Promise<string> {
  const payload = { commandKey: randomUUID(), fixtureId };
  const created = await responseJson<{ id: string }>(
    await request(baseUrl, `/api/projects/${project}/missions`, `operator-${project}`, payload),
    201,
  );
  assert.match(created.id, /^[0-9a-f-]{36}$/i);
  return created.id;
}

async function claim(baseUrl: string, actor: string): Promise<Assignment | null> {
  const reply = await responseJson<{ assignment: Assignment | null }>(
    await request(baseUrl, "/api/runner/claim", actor, {}),
    200,
  );
  return reply.assignment;
}

function complete(baseUrl: string, actor: string, assignment: Assignment, result: object): Promise<Response> {
  return request(baseUrl, `/api/runner/attempts/${assignment.attemptId}/complete`, actor, {
    generation: assignment.generation, result,
  });
}

async function persisted(missionId: string, pool = db) {
  const mission = await pool.query("SELECT id, project_id, status FROM missions WHERE id = $1", [missionId]);
  assert.equal(mission.rowCount, 1);
  const attempts = await pool.query(
    "SELECT id, generation, role, status FROM attempts WHERE mission_id = $1 ORDER BY role, generation",
    [missionId],
  );
  const checkpoints = await pool.query(
    "SELECT role, artifact, digest, attempt_id FROM checkpoints WHERE mission_id = $1 ORDER BY role",
    [missionId],
  );
  const events = await pool.query(
    "SELECT count(*)::int AS count FROM mission_events WHERE mission_id = $1",
    [missionId],
  );
  return { mission: mission.rows[0], attempts: attempts.rows, checkpoints: checkpoints.rows, events: events.rows[0].count };
}

test("mission nominale, checkpoints et verdict indépendant réellement persistés sans fournisseur IA", async t => {
  const nativeFetch = globalThis.fetch;
  const observed: string[] = [];
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    const target = new URL(input instanceof Request ? input.url : input);
    assert.equal(target.hostname, "127.0.0.1", "A1 only fetches the local Core in this test");
    observed.push(target.pathname);
    return nativeFetch(input, init);
  });

  const { baseUrl } = await startStudio(t);
  const missionId = await createMission(baseUrl);
  assert.equal(await runOnce({ baseUrl, token: tokenFor("preparer-a") }), true);

  const half = await persisted(missionId);
  assert.equal(half.mission.project_id, "a");
  assert.deepEqual(half.attempts.map(row => [row.role, row.status]), [["preparer", "completed"]]);
  assert.equal(half.checkpoints.length, 1);
  assert.equal(half.checkpoints[0].role, "preparer");

  assert.equal(await runOnce({ baseUrl, token: tokenFor("verifier-a") }), true);
  const finished = await persisted(missionId);
  assert.equal(finished.mission.status, "succeeded");
  assert.deepEqual(finished.checkpoints.map(row => row.role), ["preparer", "verifier"]);
  const verified = finished.checkpoints[1].artifact;
  assert.equal(verified.passed, true);
  assert(verified.checks.length > 0 && verified.checks.every((check: { passed: boolean }) => check.passed));
  for (const proof of finished.checkpoints) {
    assert.equal(proof.digest, digestJson(proof.artifact));
    assert.equal(proof.attempt_id, finished.attempts.find(attempt => attempt.role === proof.role).id);
  }
  assert(finished.events > half.events);

  const mission = await responseJson<{ mission: { id: string; status: string } }>(
    await request(baseUrl, `/api/projects/a/missions/${missionId}`, lead),
    200,
  );
  assert.equal(mission.mission.id, missionId);
  assert.equal(mission.mission.status, "succeeded");
  assert(observed.filter(path => path.endsWith("/complete")).length === 2);
});

test("G4.3 · rôles bornés, runtime substituable et historique conservé après perte des contacts", async t => {
  const { baseUrl } = await startStudio(t);
  const missionId = await createMission(baseUrl);
  const controlRoom = async () => (await responseJson<{agents: {
    id:string; project:string; capabilities:Capability[]; activity:{attempts:number;completed:number;last_seen:string|null}|null;
  }[]}>(await request(baseUrl,"/api/agents",lead),200)).agents;
  const initial = await controlRoom();
  assert(initial.every(agent=>agent.project==="a" && !("token" in agent)));
  assert(initial.every(agent=>agent.activity===null));
  assert.equal((await request(baseUrl,"/api/agents","preparer-a")).status,403);
  for (const role of ["preparer","verifier"] as const) {
    const profile = initial.find(agent=>agent.id===role+"-a")!;
    for (const key of Object.keys(capabilityLabels) as Capability[]) {
      if (profile.capabilities.includes(key)) requireCapability(role,key);
      else assert.throws(()=>requireCapability(role,key));
    }
  }
  assert.equal(await claim(baseUrl,"verifier-a"),null);
  let invoked = false;
  await runOnce({baseUrl,token:tokenFor("preparer-a"),runtime:{
    id:"test-local", execute(assignment,signal) {
      invoked=true;
      assert.equal(assignment.missionId,missionId);
      assert.equal(assignment.role,"preparer");
      assert(!("token" in assignment));
      return deterministicRuntime.execute(assignment,signal);
    },
  }});
  assert(invoked);
  await runOnce({baseUrl,token:tokenFor("verifier-a")});
  assert.equal((await persisted(missionId)).mission.status,"succeeded");
  const plan=(await db.query("SELECT plan FROM missions WHERE id=$1",[missionId])).rows[0].plan;
  assert.equal(plan.execution.costCeilingCents,0);
  assert.equal(plan.execution.version,"studio-trusted-v1");
  await db.query("DELETE FROM runner_contacts");
  const recovered = await controlRoom();
  for (const id of ["preparer-a","verifier-a"]) {
    const activity = recovered.find(agent=>agent.id===id)?.activity;
    assert.equal(activity?.completed,1);
    assert.equal(activity?.last_seen,null);
  }
});

test("une fixture incorrecte produit un véritable échec documenté", async t => {
  const { baseUrl } = await startStudio(t);
  const missionId = await createMission(baseUrl, "a", "incorrect");
  assert(await runOnce({ baseUrl, token: tokenFor("preparer-a") }));
  assert(await runOnce({ baseUrl, token: tokenFor("verifier-a") }));
  const rows = await persisted(missionId);
  assert.equal(rows.mission.status, "failed");
  assert.equal(rows.checkpoints[1].role, "verifier");
  assert.equal(rows.checkpoints[1].artifact.passed, false);
  assert(rows.checkpoints[1].artifact.checks.some((check: { passed: boolean }) => !check.passed));
});

test("redémarrage après checkpoint : le préparateur n’est jamais réattribué", async t => {
  const initial = await startStudio(t);
  const missionId = await createMission(initial.baseUrl);
  assert(await runOnce({ baseUrl: initial.baseUrl, token: tokenFor("preparer-a") }));
  const previous = await persisted(missionId);
  await initial.close();

  const resumed = await startStudio(t);
  assert.equal(await claim(resumed.baseUrl, "preparer-a"), null);
  const assignment = await claim(resumed.baseUrl, "verifier-a");
  assert(assignment);
  assert.equal(assignment.missionId, missionId);
  assert.deepEqual(assignment.input, previous.checkpoints[0].artifact);
  assert.equal(assignment.inputDigest, digestJson(previous.checkpoints[0].artifact));
  const report = verify(getFixture("a", "nominal"), assignment.input);
  await noContent(await complete(resumed.baseUrl, "verifier-a", assignment, report));
  const restored = await persisted(missionId);
  assert.equal(restored.mission.status, "succeeded");
  assert.equal(restored.attempts.filter(row => row.role === "preparer").length, 1);
  assert.deepEqual(restored.checkpoints[0], previous.checkpoints[0]);
});

test("interruption avant checkpoint, bail expiré, remise tardive et doublon refusés", async t => {
  const initial = await startStudio(t, { leaseMs: 1000, maxAttempts: 3 });
  const missionId = await createMission(initial.baseUrl);
  const stale = await claim(initial.baseUrl, "preparer-a");
  assert(stale);
  assert.equal(stale.missionId, missionId);
  await initial.close();
  assert.equal((await persisted(missionId)).checkpoints.length, 0);

  const elapsed = Math.max(0, Date.parse(stale.leaseUntil) - Date.now()) + 60;
  await delay(elapsed);
  const resumed = await startStudio(t);
  const replacement = await claim(resumed.baseUrl, "preparer-a");
  assert(replacement);
  assert.equal(replacement.missionId, missionId);
  assert(replacement.generation > stale.generation);
  await noContent(await complete(resumed.baseUrl, "preparer-a", stale, prepare(stale.input)), 409);
  assert.equal((await persisted(missionId)).checkpoints.length, 0);

  const result = prepare(replacement.input);
  await noContent(await complete(resumed.baseUrl, "preparer-a", replacement, result));
  await noContent(await complete(resumed.baseUrl, "preparer-a", replacement, result), 409);
  const rows = await persisted(missionId);
  assert.deepEqual(rows.attempts.map(row => row.status), ["expired", "completed"]);
  assert.equal(rows.checkpoints.length, 1);
  assert(await runOnce({ baseUrl: resumed.baseUrl, token: tokenFor("verifier-a") }));
});

test("une erreur PostgreSQL avant le commit annule preuve, état et réveil ensemble", async t => {
  const { baseUrl } = await startStudio(t);
  const missionId = await createMission(baseUrl);
  const assignment = await claim(baseUrl, "preparer-a");
  assert(assignment);
  const before = await persisted(missionId);
  await db.query(`
    CREATE FUNCTION test_fail_step_ready() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'interruption synthétique avant commit du checkpoint';
    END;
    $$;
    CREATE TRIGGER test_fail_step_ready BEFORE INSERT ON mission_events
      FOR EACH ROW WHEN (NEW.type = 'step_ready') EXECUTE FUNCTION test_fail_step_ready();
  `);
  try {
    await noContent(await complete(baseUrl, "preparer-a", assignment, prepare(assignment.input)), 503);
    assert.deepEqual(await persisted(missionId), before);
    assert.equal(await claim(baseUrl, "verifier-a"), null);
  } finally {
    await db.query("DROP TRIGGER test_fail_step_ready ON mission_events; DROP FUNCTION test_fail_step_ready()");
  }

  await noContent(await complete(baseUrl, "preparer-a", assignment, prepare(assignment.input)));
  assert.equal((await persisted(missionId)).checkpoints.length, 1);
  assert(await runOnce({ baseUrl, token: tokenFor("verifier-a") }));
});

test("un bail expiré pendant l’attente d’un verrou ne valide aucun résultat", async t => {
  const { baseUrl } = await startStudio(t, { leaseMs: 1500 });
  const missionId = await createMission(baseUrl);
  const assignment = await claim(baseUrl, "preparer-a");
  assert(assignment);
  const lock = await db.connect();
  let pending: Promise<Response> | undefined;
  let blocked = false;

  try {
    await lock.query("BEGIN");
    const pid = (await lock.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await lock.query("SELECT id FROM missions WHERE id = $1 FOR UPDATE", [missionId]);
    pending = complete(baseUrl, "preparer-a", assignment, prepare(assignment.input));
    pending.catch(() => { /* Always release the synthetic lock before awaiting the request. */ });

    for (let i = 0; i < 30; i++) {
      const match = await db.query(
        `SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND $1::int = ANY(pg_blocking_pids(pid))
        ) AS blocked`,
        [pid],
      );
      if (match.rows[0].blocked) {
        blocked = true;
        break;
      }
      await delay(20);
    }
    const remaining = Date.parse(assignment.leaseUntil) - Date.now();
    assert(remaining > 0, "The completion must have reached PostgreSQL before the lease expired");
    await delay(remaining + 50);
  } finally {
    await lock.query("ROLLBACK").finally(() => lock.release());
  }

  assert(blocked && pending);
  await noContent(await pending, 409);
  assert.equal((await persisted(missionId)).checkpoints.length, 0);
  await noContent(await request(baseUrl, `/api/projects/a/missions/${missionId}/cancel`, lead, {}));
  assert.equal((await persisted(missionId)).mission.status, "cancelled");
});

test("deux workers concurrents PostgreSQL obtiennent un seul bail, et les remises en course un seul checkpoint", async t => {
  const first = await startStudio(t);
  const second = await startStudio(t);
  const missionId = await createMission(first.baseUrl);
  const claims = await Promise.all([claim(first.baseUrl, "preparer-a"), claim(second.baseUrl, "preparer-alt-a")]);
  const admitted = claims.filter(item => item !== null);
  assert.equal(admitted.length, 1);
  const winner = admitted[0];
  assert.equal(winner.missionId, missionId);
  assert.deepEqual((await persisted(missionId)).attempts.map(item => [item.id, item.status]), [[winner.attemptId, "active"]]);

  const actor = claims[0] ? "preparer-a" : "preparer-alt-a";
  const result = prepare(winner.input);
  const receipts = await Promise.all([
    complete(first.baseUrl, actor, winner, result),
    complete(second.baseUrl, actor, winner, result),
  ]);
  assert.deepEqual(receipts.map(response => response.status).sort(), [204, 409]);
  await Promise.all(receipts.map(response => response.text()));
  assert.equal((await persisted(missionId)).checkpoints.length, 1);
  assert(await runOnce({ baseUrl: first.baseUrl, token: tokenFor("verifier-a") }));
});

test("accès croisés et utilisations de rôles interdits refusés", async t => {
  const { baseUrl } = await startStudio(t);
  const a = await createMission(baseUrl, "a");
  const b = await createMission(baseUrl, "b");
  const bProjects = await responseJson<{ projects: { id: string }[] }>(
    await request(baseUrl, "/api/projects", "operator-b"),
    200,
  );
  assert.deepEqual(bProjects.projects.map(project => project.id), ["b"]);
  assert.equal((await request(baseUrl, "/api/projects")).status, 401);
  for (const path of ["/api/projects/a", `/api/projects/a/missions/${a}`, `/api/projects/b/missions/${a}`]) {
    assert([403, 404].includes((await request(baseUrl, path, "operator-b")).status));
  }
  assert([403, 404].includes((await request(baseUrl, "/api/projects/a/missions", "operator-b", {
    commandKey: randomUUID(), fixtureId: "nominal",
  })).status));
  assert.equal((await request(baseUrl, "/api/runner/claim", "operator-a", {})).status, 403);
  await noContent(await request(baseUrl, "/api/projects/a/missions", "operator-a", {
    fixtureId: "nominal", commandKey: randomUUID(), customCommand: "ignored",
  }), 400);
  await noContent(await request(baseUrl, "/api/projects/a/missions", "operator-a", {
    fixtureId: "outside-catalogue", commandKey: randomUUID(),
  }), 400);
  await assert.rejects(runOnce({
    baseUrl: "https://invalid.example",
    token: tokenFor("preparer-a"),
    fetchImpl: async () => assert.fail("Runner attempted external network access"),
  }), /boucle locale/);
  const bAssignment = await claim(baseUrl, "preparer-b");
  const aAssignment = await claim(baseUrl, "preparer-a");
  assert(bAssignment && aAssignment);
  assert.deepEqual([bAssignment.projectId, bAssignment.missionId], ["b", b]);
  assert.deepEqual([aAssignment.projectId, aAssignment.missionId], ["a", a]);
  assert.notDeepEqual(aAssignment.input, bAssignment.input);
  await assert.rejects(
    db.query(
      "INSERT INTO checkpoints(project_id, mission_id, role, attempt_id, artifact, digest) VALUES ($1,$2,$3,$4,$5,$6)",
      ["b", a, "preparer", aAssignment.attemptId, {}, digestJson({})],
    ),
    { code: "23503" },
  );

  for (const impersonator of ["preparer-b", "verifier-a", "preparer-alt-a"]) {
    const denied = await complete(baseUrl, impersonator, aAssignment, prepare(aAssignment.input));
    assert([403, 404, 409].includes(denied.status));
    await denied.text();
  }
  assert.equal((await persisted(a)).checkpoints.length, 0);
  assert.equal((await persisted(b)).checkpoints.length, 0);
  await noContent(await complete(baseUrl, "preparer-a", aAssignment, prepare(aAssignment.input)));
  assert([403, 404].includes((await request(baseUrl, `/api/projects/b/missions/${a}`, "operator-b")).status));
  await noContent(await complete(baseUrl, "preparer-b", bAssignment, prepare(bAssignment.input)));
  assert(await runOnce({ baseUrl, token: tokenFor("verifier-a") }));
  assert(await runOnce({ baseUrl, token: tokenFor("verifier-b") }));
});

test("sauvegarder puis restaurer dans une base vierge préserve les preuves et retire les anciens baux", async t => {
  const { baseUrl } = await startStudio(t);
  const library = new Core(db).knowledge;
  const actor = {id:lead,projectIds:["a"] as const};
  const item = await library.propose(actor,"a",{kind:"document",origin:"observed",title:"Note de restauration",content:"Fiche synthétique",scope:"nominal"});
  await library.revise(actor,"a",item.id,{action:"validate",version:1});
  const finishedId = await createMission(baseUrl);
  assert(await runOnce({ baseUrl, token: tokenFor("preparer-a") }));
  assert(await runOnce({ baseUrl, token: tokenFor("verifier-a") }));
  const finished = await persisted(finishedId);
  const runningId = await createMission(baseUrl);
  const old = await claim(baseUrl, "preparer-a");
  assert(old);
  assert.equal(old.missionId, runningId);
  assert.equal((await complete(baseUrl,"preparer-a",old,prepare(old.input))).status,422);
  await noContent(await complete(baseUrl, "preparer-a", old, prepare(old.input,old.context)));
  const victim = await claim(baseUrl, "verifier-a");
  assert(victim);
  assert.equal(victim.missionId, runningId);
  const sourceHalf = await persisted(runningId);

  const folder = await mkdtemp(join(tmpdir(), "fjs-a1-test-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const archive = join(folder, "checkpoint.dump");
  const commandOptions = {
    cwd: repository,
    env: { ...process.env, DATABASE_URL: connectionString },
    timeout: 15_000,
  };
  const backupArgs = ["scripts/backup.ts", archive];
  const restoreArgs = ["scripts/restore.ts", archive, restoreTarget];
  await command(process.execPath, backupArgs, commandOptions);
  const archiveInfo = await stat(archive);
  assert(archiveInfo.size > 0);
  if (process.platform !== "win32") assert.equal(archiveInfo.mode & 0o077, 0);
  await assert.rejects(command(process.execPath, backupArgs, commandOptions), /EEXIST/);
  const metadata = await readFile(archive+".json","utf8");
  assert.equal(JSON.parse(metadata).bytes,archiveInfo.size);
  await writeFile(archive+".json",metadata.replace(/"sha256": "[a-f0-9]+"/,'"sha256": "incorrect"'));
  await assert.rejects(command(process.execPath, restoreArgs, commandOptions),/Intégrité/);
  assert.equal((await admin.query("SELECT 1 FROM pg_database WHERE datname=$1",[restoreTarget])).rowCount,0);
  await writeFile(archive+".json",metadata);

  try {
    await command(process.execPath, restoreArgs, commandOptions);
    await assert.rejects(
      command(process.execPath, restoreArgs, commandOptions),
      /already exists/,
    );
  } finally {
    const dbExists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [restoreTarget]);
    if (dbExists.rowCount) createdDatabases.add(restoreTarget);
  }
  const target = new URL(connectionString);
  target.pathname = "/" + restoreTarget;
  const targetPool = createPool(target.href);
  t.after(() => targetPool.end());

  assert.deepEqual(await persisted(finishedId, targetPool), finished);
  const receipt=(await targetPool.query("SELECT * FROM restore_receipts WHERE target=$1",[restoreTarget])).rows[0];
  assert.equal(receipt.archive_sha256,JSON.parse(metadata).sha256);
  assert.deepEqual(await new Core(targetPool).knowledge.detail(actor,"a",item.id),await library.detail(actor,"a",item.id));
  assert.equal((await new Core(targetPool).getMission(actor,"a",finishedId)).context[0].version,2);
  const restoredHalf = await persisted(runningId, targetPool);
  assert.deepEqual(restoredHalf.checkpoints, sourceHalf.checkpoints);
  assert.equal(restoredHalf.attempts.find(row => row.id === victim.attemptId).status, "expired");

  const resumed = await startStudio(t, {}, target.href);
  const verdict = verify(getFixture("a", "nominal"), victim.input);
  await noContent(await complete(resumed.baseUrl, "verifier-a", victim, verdict), 409);
  assert.equal(await claim(resumed.baseUrl, "preparer-a"), null);
  assert(await runOnce({ baseUrl: resumed.baseUrl, token: tokenFor("verifier-a") }));
  assert.equal((await persisted(runningId, targetPool)).mission.status, "succeeded");
  assert.equal((await persisted(runningId)).mission.status, sourceHalf.mission.status);
});

const proposal = {kind:"rule",origin:"agent",title:"Durée synthétique",confidence:"medium",validity:"Plan A1",content:"Note du préparateur A.",scope:"nominal",reference:"Proposition synthétique S-17"};
test("G3 · provenance, recherche, révisions concurrentes, arbitrage et retrait", async t => {
  const {baseUrl}=await startStudio(t);
  const root="/api/projects/a/knowledge";
  const created=await responseJson<{id:string}>(await request(baseUrl,root,lead,proposal),201);
  const path=root+"/"+created.id;
  const decide=(action:string,version:number)=>request(baseUrl,path,lead,{action,version,confirm:"yes"});
  const first=(await (await request(baseUrl,path,lead)).json()).item;
  assert.equal(first.status,"proposed"); assert.equal(first.author,lead); assert.equal(first.origin,"agent");
  assert.equal(first.reference,proposal.reference);
  assert.equal(first.confidence,"medium"); assert.equal(first.validity,"Plan A1");
  assert.equal((await request(baseUrl,path,lead,{action:"validate",version:1})).status,400);
  const outcomes=await Promise.all([decide("validate",1),decide("validate",1)]);
  assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,409]);
  assert.equal((await (await request(baseUrl,root+"?q=S-17&kind=rule&status=validated",lead)).json()).items.length,1);
  assert.equal((await request(baseUrl,path,lead,{action:"edit",version:2,title:"Révisée",content:"Règle révisée",scope:"both"})).status,200);
  assert.equal((await decide("reject",3)).status,200);
  assert.equal((await decide("validate",4)).status,409);
  assert.equal((await request(baseUrl,path,lead,{action:"edit",version:4,title:"Finale",content:"Référence test",scope:"both"})).status,200);
  assert.equal((await decide("validate",5)).status,200);
  assert.equal((await decide("obsolete",6)).status,200);
  assert.equal((await decide("revoke",7)).status,200);
  assert.equal((await decide("validate",8)).status,409);
  const detail=await (await request(baseUrl,path,lead)).json();
  assert.equal(detail.history.length,8); assert.equal(detail.item.status,"revoked"); assert.equal(detail.history.at(-1).content,proposal.content);
  assert.equal((await (await request(baseUrl,root+"?q=Finale&status=validated",lead)).json()).items.length,0);
});

test("G3.2 · désaccord entre révisions, recherche française, sources figées et cloisonnement", async t => {
  const {baseUrl} = await startStudio(t);
  const core = new Core(db);
  const actor = {id: lead, projectIds: ["a"] as const};
  const base = { ...proposal, title:"Seuil des réservations", content:"Les réservations sont plafonnées.",
    claimKey:"durée maximale", claimValue:"60 minutes", validity:"A1" };
  const first = await core.knowledge.propose(actor,"a",base);
  await core.knowledge.revise(actor,"a",first.id,{action:"validate",version:1});
  const second = await core.knowledge.propose(actor,"a",{...base,claimValue:"90 minutes",relatedId:first.id});
  const conflicts = (await core.knowledge.detail(actor,"a",first.id)).conflicts;
  assert.equal(conflicts.length,1);
  assert.equal(conflicts[0].reason,"assertion");
  assert.equal((await core.knowledge.detail(actor,"a",second.id)).item.status,"proposed");
  const search = await core.knowledge.list(actor,"a","réservation plafonner","","","agent",first.id);
  assert.deepEqual(search.map(r=>r.id),[second.id]);
  await assert.rejects(core.knowledge.detail(actor,"b",first.id),{status:404});
  await assert.rejects(core.knowledge.propose(actor,"a",{...base,claimKey:""}),{status:400});
  const mission = await createMission(baseUrl);
  const original = await core.getMission(actor,"a",mission);
  assert.equal(original.contextSources[0].origin,"agent");
  assert.equal(original.contextSources[0].status,"validated");
  assert(original.contextSources[0].selected_at instanceof Date);
  await core.knowledge.revise(actor,"a",first.id,{action:"revoke",version:2});
  assert.equal((await core.knowledge.detail(actor,"a",second.id)).conflicts.length,0);
  assert.deepEqual((await core.getMission(actor,"a",mission)).contextSources,original.contextSources);
  await core.knowledge.revise(actor,"a",second.id,{action:"validate",version:1});
  const oldMission = await createMission(baseUrl);
  await core.knowledge.revise(actor,"a",second.id,{
    action:"edit",version:2,title:base.title,content:"Règle révisée.",scope:"both",claimValue:"100 minutes",
  });
  const pendingMission = await createMission(baseUrl);
  assert.equal((await core.getMission(actor,"a",pendingMission)).context.length,0);
  await core.knowledge.revise(actor,"a",second.id,{action:"validate",version:3});
  const newMission = await createMission(baseUrl);
  assert.equal((await core.getMission(actor,"a",oldMission)).context[0].version,2);
  const revised = (await core.getMission(actor,"a",newMission)).context[0];
  assert.equal(revised.version,4);
  assert.equal(revised.content,"Règle révisée.");
});

test("G3 · contexte borné et figé, révocation et preuves du runner réel", async t => {
  const {baseUrl}=await startStudio(t);
  const core=new Core(db), actor={id:lead,projectIds:["a"] as const};
  const eligible:string[]=[];
  for (let i=0;i<7;i++) {
    const {id}=await core.knowledge.propose(actor,"a",{...proposal,title:"Fiche "+i,scope:i===0?"both":"nominal"});
    await core.knowledge.revise(actor,"a",id,{action:"validate",version:1}); eligible.push(id);
  }
  await core.knowledge.propose(actor,"a",{...proposal, title:"Proposition non admissible"});
  const id=await createMission(baseUrl);
  const initial=(await core.getMission(actor,"a",id)).context;
  assert.equal(initial.length,5);
  assert.deepEqual(initial.map(x=>x.id).sort(),eligible.slice(-5).sort());
  const revoked=initial[0].id;
  await core.knowledge.revise(actor,"a",revoked,{action:"revoke",version:2});
  const next=await createMission(baseUrl);
  assert(!(await core.getMission(actor,"a",next)).context.some(x=>x.id===revoked));
  assert.deepEqual((await core.getMission(actor,"a",id)).context,initial);
  assert.deepEqual((await core.knowledge.detail(actor,"a",revoked)).uses,[{mission_id:id,version:2}]);
  assert(await runOnce({baseUrl,token:tokenFor("preparer-a")}));
  assert(await runOnce({baseUrl,token:tokenFor("verifier-a")}));
  const report=await (await request(baseUrl,"/api/projects/a/missions/"+id+"/report",lead)).json();
  assert.equal(report.mission.status,"succeeded"); assert.equal(report.mission.steps[0].checkpoint.artifact.knowledgeReferences.length,5);
  assert(report.quality.checks.every((c:{state:string;expected:string})=>c.state==="passed" && c.expected.length>0));
  assert.equal(report.quality.runnerId,"verifier-a");
  assert.equal(report.quality.evidence.sha256, report.mission.steps[1].checkpoint.digest);
  assert.equal(report.quality.evidence.candidateSha256, report.mission.steps[0].checkpoint.digest);
  assert(Number.isFinite(Date.parse(report.quality.recordedAt)));
});

test("G3 · cloisonnement serveur des fiches, relations, import, contexte, export et journaux", async t => {
  const {baseUrl}=await startStudio(t);
  const a="/api/projects/a/knowledge", b="/api/projects/b/knowledge";
  const foreign=await responseJson<{id:string}>(await request(baseUrl,b,"operator-b",{...proposal,content:"MARQUEUR_PROJET_B"}),201);
  assert.equal((await request(baseUrl,b+"/"+foreign.id,lead)).status,404);
  assert.equal((await request(baseUrl,a+"/"+foreign.id,lead)).status,404);
  assert.equal((await request(baseUrl,b+"/"+foreign.id,lead,{action:"validate",version:1,confirm:"yes"})).status,404);
  assert.equal((await request(baseUrl,a,lead,{...proposal,relatedId:foreign.id})).status,404);
  assert.equal((await request(baseUrl,b+"/import",lead,{})).status,404);
  assert.equal((await request(baseUrl,a+"/import",lead,{path:"../b.md"})).status,400);
  const imported=await responseJson<{id:string}>(await request(baseUrl,a+"/import",lead,{}),201);
  assert.deepEqual(await responseJson(await request(baseUrl,a+"/import",lead,{}),201),imported);
  assert.equal((await request(baseUrl,a,lead,{...proposal,origin:"imported"})).status,400);
  const source=await (await request(baseUrl,a+"/"+imported.id,lead)).json();
  assert.match(source.item.reference,/docs\/projects\/a\.md · Git [a-f0-9]+ · SHA-256 [a-f0-9]+/);
  assert.equal((await request(baseUrl,a,"preparer-a",proposal)).status,403);
  const mission=await createMission(baseUrl);
  const other=await createMission(baseUrl,"b");
  assert.equal((await request(baseUrl,"/api/projects/a/missions/"+other+"/report",lead)).status,404);
  assert.equal((await request(baseUrl,"/api/projects/b/missions/"+other+"/report",lead)).status,404);
  assert.equal((await request(baseUrl,"/api/projects/a/missions",lead,{fixtureId:"nominal",commandKey:"unexpected",context:[foreign.id]})).status,400);
  await assert.rejects(db.query("INSERT INTO mission_context VALUES ('a',$1,$2,1)",[mission,foreign.id]),{code:"23503"});
  for (const path of [a+"?q=MARQUEUR_PROJET_B","/api/command","/api/projects/a/missions/"+mission+"/report"]) {
    const text=await (await request(baseUrl,path,lead)).text();
    for (const secret of ["MARQUEUR_PROJET_B",foreign.id,other,tokenFor(lead)]) assert(!text.includes(secret));
  }
  const log=t.mock.method(console,"error",()=>{});
  await db.query("ALTER TABLE checkpoints RENAME TO unavailable_checkpoints");
  const failed=await request(baseUrl,"/api/projects/a/missions/"+mission+"/report",lead);
  assert.equal(failed.status,503);
  const recorded=JSON.stringify(log.mock.calls.map(c=>c.arguments));
  assert.match(recorded,/42P01/);
  for (const secret of [tokenFor(lead),foreign.id,"MARQUEUR_PROJET_B",connectionString]) assert(!recorded.includes(secret));
});

test("G3 · pause aux frontières de checkpoint, reprise et inspection sans écriture", async t => {
  const {baseUrl}=await startStudio(t);
  const id=await createMission(baseUrl), path="/api/projects/a/missions/"+id;
  const change=(action:string)=>request(baseUrl,path+"/"+action,lead,{});
  assert.equal((await change("resume")).status,409);
  assert.equal((await change("pause")).status,204);
  assert.equal(await claim(baseUrl,"preparer-a"),null);
  assert.equal((await change("resume")).status,204);
  const task=await claim(baseUrl,"preparer-a"); assert(task);
  assert.equal((await change("pause")).status,409);
  await noContent(await complete(baseUrl,"preparer-a",task,prepare(task.input)));
  assert.equal((await change("pause")).status,204);
  assert.equal(await claim(baseUrl,"verifier-a"),null);
  const board=await (await request(baseUrl,"/api/command",lead)).json();
  assert.equal(board.counts.find((x:{status:string})=>x.status==="paused").count,1);
  assert(board.contacts.some((x:{fresh:boolean})=>x.fresh));
  await db.query("UPDATE runner_contacts SET last_seen=now()-interval '1 minute'");
  assert((await (await request(baseUrl,"/api/command",lead)).json()).contacts.every((x:{fresh:boolean})=>!x.fresh));
  assert.equal((await change("resume")).status,204);
  const v=await claim(baseUrl,"verifier-a"); assert(v);
  await db.query("UPDATE attempts SET lease_until=now()-interval '1 second' WHERE id=$1",[v.attemptId]);
  const beforeRead=await persisted(id);
  const inspection=await (await request(baseUrl,path+"/report",lead)).json();
  assert(inspection.quality.checks.every((c:{state:string})=>c.state==="not_run"));
  assert.deepEqual(await persisted(id),beforeRead);
  await new Core(db).sweepExpired();
  const replace=await claim(baseUrl,"verifier-a"); assert(replace && replace.generation>v.generation);
  await noContent(await change("cancel"));
  assert.equal((await change("resume")).status,409);
  assert.equal((await persisted(id)).checkpoints.length,1);
});

test("G3 · relance idempotente et liée à une mission terminale du même projet",async t=>{
  const {baseUrl}=await startStudio(t);
  const id=await createMission(baseUrl), path="/api/projects/a/missions/"+id;
  const commandKey=randomUUID();
  const replay=()=>request(baseUrl,path+"/relaunch",lead,{confirm:"yes",commandKey});
  assert.equal((await replay()).status,409);
  await noContent(await request(baseUrl,path+"/cancel",lead,{}));
  const before=await persisted(id);
  const child=await responseJson<{id:string}>(await replay(),201);
  assert.notEqual(child.id,id); assert.deepEqual(await responseJson(await replay(),201),child);
  assert.deepEqual(await persisted(id),before);
  assert.equal((await request(baseUrl,"/api/projects/a/missions",lead,{commandKey,fixtureId:"nominal"})).status,409);
  const report=await (await request(baseUrl,"/api/projects/a/missions/"+child.id+"/report",lead)).json();
  assert.equal(report.mission.events[0].details.relaunchOf,id);
});

test("G3 · migrations rejouables et divergence de contenu refusée",async()=>{
  await migrate(db);
  const {rows}=await db.query("SELECT name,digest FROM schema_migrations ORDER BY name");
  assert.deepEqual(rows.map(r=>r.name), await migrationNames());
  assert(rows.some(r=>r.name === '003-qualification.sql'));
  await db.query("UPDATE schema_migrations SET digest=repeat('0',64) WHERE name=$1",[rows[0].name]);
  await assert.rejects(migrate(db),/Migration modifiée/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM projects")).rows[0].n,2);
});

test("interface locale : session, origine des formulaires et lancement idempotent", async t => {
  const { baseUrl } = await startStudio(t);
  const loginForm = await fetch(baseUrl);
  assert.equal(loginForm.status, 200);
  // Chromium applique cette politique lors du POST d'un formulaire local.
  assert.equal(loginForm.headers.get("referrer-policy"), "same-origin");
  assert.match(await loginForm.text(), /Clé opérateur/);

  const form = new URLSearchParams({ token: tokenFor("operator-a") });
  const wrongOrigin = await fetch(baseUrl + "/login", {
    method: "POST", body: form, headers: { origin: "http://example.invalid" },
  });
  assert.equal(wrongOrigin.status, 403);
  const login = await fetch(baseUrl + "/login", {
    method: "POST", body: form, headers: { origin: baseUrl }, redirect: "manual",
  });
  assert.equal(login.status, 303);
  const issued = login.headers.get("set-cookie");
  assert(issued);
  assert(issued.includes("HttpOnly") && issued.includes("SameSite=Strict"));
  const cookie = issued.split(";")[0];
  const selected = await fetch(baseUrl + "/projects/a", { headers: { cookie } });
  const markup = await selected.text();
  assert.equal(selected.status, 200);
  assert.doesNotMatch(markup, /Projet synthétique B/);
  const key = /name="commandKey" value="([^"]+)"/.exec(markup)?.[1];
  assert(key);
  const launch = () => fetch(baseUrl + "/projects/a/missions", {
    method: "POST", headers: { cookie, origin: baseUrl }, redirect: "manual",
    body: new URLSearchParams({ commandKey: key, fixtureId: "nominal" }),
  });
  const created = await launch();
  const repeated = await launch();
  assert.equal(created.status, 303);
  assert.equal(repeated.status, 303);
  const destination = created.headers.get("location");
  assert(destination && destination === repeated.headers.get("location"));
  const missionId = destination.split("/").at(-1)!;
  assert.equal((await persisted(missionId)).attempts.length, 0);
  assert(await runOnce({ baseUrl, token: tokenFor("preparer-a") }));
  assert(await runOnce({ baseUrl, token: tokenFor("verifier-a") }));
  const detail = await fetch(baseUrl + destination, { headers: { cookie } });
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /Contrôles réussis/);
});
