import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { backupDatabase } from '../scripts/backup.ts';
import { checkPair } from '../scripts/backup-history.ts';
import { verifyProductBackup } from '../scripts/backup-verify.ts';
import { backupPeriods, productMaintenance } from '../scripts/product-maintenance.ts';
import { composeDatabaseUrl } from '../scripts/postgres-tools.ts';
import { restoreDatabase } from '../scripts/restore.ts';
import { createPool } from '../src/config.ts';
import { Core, migrate } from '../src/core.ts';
import { HumanAccess, totp } from '../src/product-auth.ts';
import { claimControl, completeControl } from '../src/control-room-queue.ts';
import { executeControl } from '../src/control-room-adapters.ts';
import { commandMission, controlDetail, createControlMission } from '../src/control-room.ts';

async function sandbox(t: TestContext) {
  const url = composeDatabaseUrl();
  const admin = createPool(url.href);
  const suffix = randomUUID().replaceAll('-', '');
  const name = 'fjstudio_a1_test_' + suffix;
  const target = 'fjstudio_a1_restore_' + suffix;
  const dir = await mkdtemp(join(tmpdir(), 'fjstudio-recovery-'));
  try {
    await admin.query('CREATE DATABASE ' + name + ' TEMPLATE template0');
  } catch (error) {
    await admin.end();
    throw error;
  }
  url.pathname = '/' + name;
  const db = createPool(url.href);
  const dest = new URL(url);
  dest.pathname = '/' + target;
  const restored = createPool(dest.href);
  t.after(async () => {
    try {
      await Promise.all([db.end(), restored.end()]);
      await admin.query('DROP DATABASE IF EXISTS ' + target);
      await admin.query('DROP DATABASE ' + name);
    } finally {
      await admin.end();
      await rm(dir, { recursive: true, force: true });
    }
  });
  return { url, db, target, restored, dir, name };
}
function decode32(seed: string) {
  const bits = Array.from(seed, (ch) =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch).toString(2).padStart(5, '0'),
  ).join('');
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
}
const actor = { id: 'synthetic-owner', accountRole: 'admin' as const, projectIds: ['a'] };
test('Résilience produit · dump restauré, preuves préservées, sessions et travaux hérités neutralisés', async (t) => {
  const { db, url, restored, target, dir } = await sandbox(t);
  await migrate(db);
  const key = randomBytes(32),
    bootstrap = randomUUID(),
    password = randomBytes(30).toString('base64url');
  const auth = new HumanAccess(db, key);
  const enrolled = await auth.begin(bootstrap, { token: bootstrap, projectIds: ['a'] });
  assert.ok(enrolled.secret);
  const seed = decode32(enrolled.secret);
  const oldSession = await auth.finish(
    enrolled.ticket,
    password,
    totp(seed, Math.floor(Date.now() / 30_000)),
  );
  const unused = await auth.invite(actor, 'pending-invite', 'viewer', ['a']);
  const staged = await auth.begin(await auth.invite(actor, 'staged-invite', 'viewer', ['a']), undefined);
  assert.ok(await auth.actor(oldSession));

  const library = new Core(db).knowledge;
  const doc = await library.propose(actor, 'a', {
    kind: 'document',
    origin: 'observed',
    title: 'Procédure',
    content: 'Mode local',
    scope: 'nominal',
  });
  await library.revise(actor, 'a', doc.id, { action: 'validate', version: 1 });
  const brief = {
    objective: 'Vérifier la reprise locale',
    scope: 'Document synthétique',
    constraints: 'Lecture seule',
    criteria: ['mode local'],
    document: '# Recette\nLe mode local fonctionne.',
    risk: 'normal',
    durationMinutes: 10,
  };
  const { id } = await createControlMission(db, actor, 'a', randomUUID(), brief);
  await commandMission(db, actor, 'a', id, 'plan', randomUUID(), 1);
  const preparer = { id: 'prepare-test', projectId: 'a', role: 'preparer' as const },
    verifier = { ...preparer, id: 'verify-test', role: 'verifier' as const };
  const first = await claimControl(db, preparer);
  assert.ok(first);
  assert.equal(
    await completeControl(db, preparer, first.attemptId, first.generation, executeControl(first)),
    true,
  );
  const active = await claimControl(db, verifier);
  assert.ok(active);
  const before = await controlDetail(db, actor, 'a', id);
  const g5 = randomUUID();
  await db.query(
    `INSERT INTO pilot_runs(id,command_key,project,owner_id,goal,profile,branch,source_commit,context,criteria,policy,status)
     VALUES ($1,$2,'folkandjoy','synthetic-owner','Test de reprise','historical','synthetic',repeat('a',40),'{}','[]','{}','running')`,
    [g5, randomUUID()],
  );
  await db.query(
    `INSERT INTO pilot_tasks(run_id,key,label,role,workspace,dependencies,sources,state,generation,lease_until,worker_id)
     VALUES ($1,'one','Preuve historique','Implementer','synthétique','{}','{}','running',1,now()+interval '1 minute','synthetic-runner')`,
    [g5],
  );
  await db.query(`INSERT INTO product_lab_rules(project_id,source_key,profile,mode,interval_minutes,updated_by)
    VALUES ('a','fixture','structure','interval',60,'synthetic-owner')`);
  const lab = randomUUID();
  await db.query(
    `INSERT INTO product_lab_runs(id,project_id,command_key,source_key,entry_path,commit_sha,source_digest,source_html,
    inventory,profile,profile_version,trigger_kind,actor_id) VALUES ($1,'a',$2,'fixture','fixture.html',repeat('a',40),encode(sha256($3),'hex'),$3,
    '{}','structure','test-v1','manual','synthetic-owner')`,
    [lab, randomUUID(), Buffer.from('<main>Recette</main>')],
  );
  const path = join(dir, 'studio.dump');
  const manifest = await backupDatabase(path, url);
  if (process.platform === 'win32') {
    const verified = execFileSync(
      join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `
      $expected=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544') | Sort-Object -Unique
      foreach ($path in @($env:STUDIO_TEST_ARCHIVE,($env:STUDIO_TEST_ARCHIVE+'.json'))) {
        $acl=[IO.File]::GetAccessControl($path)
        $actual=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | ForEach-Object {$_.IdentityReference.Value} | Sort-Object -Unique)
        if (Compare-Object $expected $actual) {exit 1}
      }
      'verified'
    `,
      ],
      {
        env: { SystemRoot: process.env.SystemRoot, STUDIO_TEST_ARCHIVE: path },
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    assert.equal(verified.trim(), 'verified');
  }
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.studioVersion, pkg.name + '@' + pkg.version);
  assert.equal((await checkPair(path)).sha256, manifest.sha256);
  await restoreDatabase(path, target, undefined, url.href);

  const targetAuth = new HumanAccess(restored, key);
  assert.notEqual(
    (await restored.query("SELECT current_setting('studio.restore_pending',true) AS pending")).rows[0]
      .pending,
    'on',
  );
  assert.equal(await targetAuth.actor(oldSession), null);
  await assert.rejects(targetAuth.begin(unused, undefined), { code: 'identity' });
  await assert.rejects(targetAuth.finish(staged.ticket, password, '000000'), { code: 'identity' });
  assert.equal((await restored.query('SELECT 1 FROM studio_sessions')).rowCount, 0);
  assert.equal(
    (
      await restored.query(
        'SELECT 1 FROM studio_accounts WHERE invite_digest IS NOT NULL OR setup_digest IS NOT NULL OR (enrolled_at IS NULL AND totp_secret IS NOT NULL)',
      )
    ).rowCount,
    0,
  );
  const fresh = await targetAuth.login(enrolled.id, password, totp(seed, Math.floor(Date.now() / 30000) + 1));
  assert.deepEqual((await targetAuth.actor(fresh))?.projectIds, ['a']);
  assert.ok(await auth.actor(oldSession));
  assert.equal((await db.query('SELECT 1 FROM studio_accounts WHERE invite_digest IS NOT NULL')).rowCount, 1);
  assert.deepEqual(
    await new Core(restored).knowledge.detail(actor, 'a', doc.id),
    await library.detail(actor, 'a', doc.id),
  );
  const after = await controlDetail(restored, actor, 'a', id);
  assert.deepEqual(
    after.tasks.find((x) => x.state === 'completed'),
    before.tasks.find((x) => x.state === 'completed'),
  );
  assert.equal(after.mission.status, 'blocked');
  assert.equal(after.mission.reason, 'restored');
  assert.deepEqual(after.events.slice(0, before.events.length), before.events);
  assert.equal(after.attempts.find((x) => x.id === active.attemptId)?.state, 'interrupted');
  assert.equal((await restored.query('SELECT 1 FROM control_contacts')).rowCount, 0);
  assert.deepEqual(
    (await restored.query('SELECT status,verdict FROM pilot_runs WHERE id=$1', [g5])).rows[0],
    { status: 'blocked', verdict: 'BLOCKED' },
  );
  assert.deepEqual(
    (await restored.query('SELECT state,worker_id,lease_until FROM pilot_tasks WHERE run_id=$1', [g5]))
      .rows[0],
    { state: 'interrupted', worker_id: null, lease_until: null },
  );
  assert.equal(
    (await restored.query("SELECT 1 FROM pilot_events WHERE run_id=$1 AND kind='restored_quarantine'", [g5]))
      .rowCount,
    1,
  );
  assert.equal((await restored.query('SELECT 1 FROM product_lab_rules WHERE enabled')).rowCount, 0);
  assert.equal(
    (await restored.query('SELECT verdict FROM product_lab_runs WHERE id=$1', [lab])).rows[0].verdict,
    'NOT QUALIFIED',
  );
  assert.equal(
    (await db.query('SELECT state FROM product_lab_runs WHERE id=$1', [lab])).rows[0].state,
    'queued',
  );
  const receipt = (
    await restored.query('SELECT archive_sha256,verified_table_count FROM restore_receipts WHERE target=$1', [
      target,
    ])
  ).rows[0];
  assert.deepEqual(receipt, {
    archive_sha256: manifest.sha256,
    verified_table_count: manifest.schema!.tables.length,
  });
  const checks = (
    await db.query('SELECT outcome,sha256,detail FROM studio_backup_checks ORDER BY performed_at')
  ).rows;
  assert.equal(checks.length, 2);
  assert.ok(checks.every((c) => c.outcome === 'verified' && c.sha256 === manifest.sha256));
  assert.match(checks[0].detail, /relus/);
  assert.match(checks[1].detail, /Restauration isolée terminée/);
});

test('Maintenance produit · calendrier UTC, exclusivité, reprise de paire incomplète et conservation des archives', async (t) => {
  assert.deepEqual(backupPeriods(new Date('2027-01-03T23:59:59Z')), [
    'daily-2027-01-03',
    'weekly-2026-12-28',
  ]);
  const { db, url, dir, name } = await sandbox(t);
  assert.deepEqual((await productMaintenance(url, 'migrate', dir)).archives, []);
  const periods = backupPeriods((await db.query('SELECT now() AS at')).rows[0].at);
  const [one, two] = await Promise.all([
    productMaintenance(url, 'once', dir),
    productMaintenance(url, 'once', dir),
  ]);
  assert.deepEqual([one.state, two.state].sort(), ['busy', 'verified']);
  const first = (one.state === 'verified' ? one : two).archives;
  assert.equal(first.length, 2);
  assert.ok(first.every((a) => a.action === 'created'));
  const folder = join(dir, name),
    daily = join(folder, periods[0] + '.dump');
  const reset = await productMaintenance(url, 'once', dir);
  assert.ok(reset.archives.every((a) => a.action === 'existing'));
  assert.deepEqual(
    reset.archives.map((a) => a.sha256),
    first.map((a) => a.sha256),
  );
  await writeFile(daily + '.json', 'fragment synthétique');
  const repair = await productMaintenance(url, 'once', dir);
  assert.deepEqual(
    repair.archives.map((a) => a.action),
    ['created', 'existing'],
  );
  assert.notEqual(repair.archives[0].file, first[0].file);
  assert.equal(await readFile(daily + '.json', 'utf8'), 'fragment synthétique');
  assert.equal((await checkPair(join(folder, repair.archives[0].file))).sha256, repair.archives[0].sha256);
  assert.equal((await readdir(folder)).length, 6);
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM studio_backup_checks WHERE outcome='failed'")).rows[0].n,
    1,
  );
  await assert.rejects(verifyProductBackup(daily, url), /Manifeste/);
  assert.equal(
    (await verifyProductBackup(join(folder, repair.archives[0].file), url)).sha256,
    repair.archives[0].sha256,
  );
  assert.deepEqual((await productMaintenance(url, 'migrate', dir)).archives, []);
});

test('Migration produit · une base A1 existante est sauvegardée intégralement avant la mise à niveau', async (t) => {
  const { db, url, dir, name } = await sandbox(t);
  const initial = await readFile(new URL('../migrations/001-a1.sql', import.meta.url), 'utf8');
  const hash = createHash('sha256').update(initial.replaceAll('\r\n', '\n')).digest('hex');
  await db.query(
    'CREATE TABLE schema_migrations(name text PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())',
  );
  await db.query(initial);
  await db.query('INSERT INTO schema_migrations(name,digest) VALUES($1,$2)', ['001-a1.sql', hash]);
  await db.query("UPDATE projects SET name='Projet synthétique historique' WHERE id='a'");
  const result = await productMaintenance(url, 'migrate', dir);
  assert.equal(result.archives.length, 1);
  const manifest = await checkPair(join(dir, name, result.archives[0].file));
  assert.deepEqual(manifest.schema?.migrations, [{ name: '001-a1.sql', digest: hash }]);
  assert.ok(manifest.schema?.tables.some((t) => t.table === 'projects' && t.rows === 2));
  assert.ok(!manifest.schema?.tables.some((t) => t.table === 'studio_backup_checks'));
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM studio_backup_checks WHERE sha256=$1 AND outcome='verified'",
        [manifest.sha256],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("SELECT name FROM projects WHERE id='a'")).rows[0].name,
    'Projet synthétique historique',
  );
});

test('Restauration produit · une divergence reste en quarantaine malgré un reçu historique hérité', async (t) => {
  const { db, url, restored, target, dir } = await sandbox(t);
  await migrate(db);
  await db.query(
    "INSERT INTO restore_receipts(target,archive_sha256,checkpoint_count) VALUES($1,repeat('d',64),0)",
    [target],
  );
  const path = join(dir, 'historical.dump');
  const manifest = await backupDatabase(path, url);
  manifest.schema!.tables.find((x) => x.table === 'projects')!.rows++;
  await writeFile(path + '.json', JSON.stringify(manifest));
  await assert.rejects(restoreDatabase(path, target, undefined, url.href), /diverge/);
  assert.equal(
    (await restored.query("SELECT current_setting('studio.restore_pending',true) AS pending")).rows[0]
      .pending,
    'on',
  );
  assert.equal(
    (await restored.query('SELECT 1 FROM restore_receipts WHERE target=$1', [target])).rowCount,
    1,
  );
  assert.equal((await db.query("SELECT 1 FROM studio_backup_checks WHERE outcome='failed'")).rowCount, 1);
});
