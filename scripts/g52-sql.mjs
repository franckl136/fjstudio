// node scripts/g52-sql.mjs <mobile worktree> <new JSON receipt path> [full mobile commit]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { join, resolve } from 'node:path';
import {
  alice,
  bob,
  household,
  image,
  list,
  readyWhen,
  sha,
  sqlString,
  startLab,
} from './g52-sql-lab.mjs';
import { runJoinedClients } from './g52-sql-client.mjs';

const [repoArgument, output, revision] = process.argv.slice(2);
assert.ok(repoArgument && output, 'Usage: node scripts/g52-sql.mjs <mobile> <new-receipt.json>');
const repo = resolve(repoArgument);
const baseTree = '5d6838cb9f52374a83a4e68dfec8e1266ca5d45c';
const compatibleBases = [
  '40a1f657bee0b54b533f4336920d43b26ee787d3',
  'a0b3ef3c00cbdda9dc60e2de13c4c0daf33e22ab',
];
const harness = 'supabase/tests/harness/';
const newMigrations = [
  '20261126090000_check_operation_receipts.sql',
  '20261126090100_courses_operation_ledger.sql',
];
const suites = {
  run_rls_isolation: 'ALL RLS TESTS PASSED',
  run_l0_courses_stocks: 'ALL L0 TESTS PASSED',
  run_s12_tenant_guards: 'ALL S12 TESTS PASSED',
  run_shopping_catalog: 'ALL CATALOG TESTS PASSED',
  run_courses_operations: 'ALL COURSES OPERATION TESTS PASSED',
};
function git(...args) {
  return execFileSync('git', ['--no-replace-objects', '--no-optional-locks', '-C', repo, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).replaceAll('\r\n', '\n');
}
if (revision) assert.match(revision,/^[a-f0-9]{40}$/);
const commit = git('rev-parse','--verify',(revision ?? 'HEAD')+'^{commit}').trim();
const base = compatibleBases.find((ref) => {
  try {
    return git('rev-parse', '--verify', ref + '^{tree}').trim() === baseTree;
  } catch {
    return false;
  }
});
assert.ok(base, 'La base G5.2 publique ou locale et son arbre vérifié sont requis.');
const inputs = [];
async function source(path) {
  let committed;
  try {
    committed = git('cat-file', 'blob', commit + ':' + path);
  } catch {
    if(revision) throw new Error('Source absente du commit choisi : '+path);
  }
  const body=revision ? committed : (await readFile(join(repo,path),'utf8')).replaceAll('\r\n','\n');
  const matchesCommit = body===committed;
  inputs.push({ path, sha256: sha(body), matchesCommit });
  return body;
}
const files=revision ? git('ls-tree','--name-only',commit+':supabase/migrations').trim().split('\n') : await readdir(join(repo, 'supabase/migrations'));
const migrations = files
  .filter((name) => name.endsWith('.sql'))
  .sort();
assert.deepEqual(migrations.slice(-2), newMigrations);
const auth = await source(harness + '00_auth_stub.sql');
const oldGrants = git('cat-file', 'blob', base + ':' + harness + '01_grants.sql');
const sql = new Map();
for (const file of migrations) sql.set(file, await source('supabase/migrations/' + file));
const grants = await source(harness + '01_grants.sql');
const suiteBodies = new Map();
for (const suite of Object.keys(suites))
  suiteBodies.set(suite, await source(harness + suite + '.sql'));
const dataModules = [
  'courses-rpc',
  'list-items-map',
  'rpc-errors',
  'courses-local',
  'courses-quantity',
  'courses-sync',
  'courses-storage',
];
const domainModules = [
  'index',
  'types',
  'normalize',
  'parseShoppingQuantity',
  'ports',
  'categories',
  'faits',
  'smart-add',
  'shopping-catalog',
];
const modules = [
  ...dataModules.map((name) => 'packages/data/src/' + name + '.ts'),
  ...domainModules.map((name) => 'packages/domain/src/' + name + '.ts'),
];
// Load exactly the identified bytes, even if another process edits the working tree mid-test.
const moduleURL = (path) => 'g52-mobile://source/'+path;
const moduleSources=new Map();
for (const path of modules) moduleSources.set(moduleURL(path),await source(path));
const wrapperURL = moduleURL(modules[0]);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if(moduleSources.has(specifier)) return {url:specifier,shortCircuit:true};
    if (moduleSources.has(context.parentURL)) {
      const url =
        specifier === '@homeos/domain'
          ? moduleURL('packages/domain/src/index.ts')
          : new URL(specifier + '.ts', context.parentURL).href;
      if (moduleSources.has(url)) return { url, shortCircuit: true };
      if (specifier === './supabase')
        return {
          url: 'data:text/javascript,export function getSupabaseClient(){throw Error("explicit local transport required")}',
          shortCircuit: true,
        };
      throw new Error('Unreviewed transport dependency: ' + specifier);
    }
    return nextResolve(specifier, context);
  },
  load(url,context,nextLoad) {
    if(moduleSources.has(url)) return {format:'module',source:stripTypeScriptTypes(moduleSources.get(url)),shortCircuit:true};
    return nextLoad(url,context);
  },
});
let applyCourseCommand, client;
try {
  ({ applyCourseCommand } = await import(wrapperURL));
  const loadData = (name) => import(moduleURL('packages/data/src/' + name + '.ts'));
  const [
    { CourseStore, courseItems },
    { flushCourses },
    { nativeCourseStorage },
    { mapListItemRow },
  ] = await Promise.all(
    ['courses-local', 'courses-sync', 'courses-storage', 'list-items-map'].map(loadData),
  );
  client = { CourseStore, courseItems, flushCourses, nativeCourseStorage, mapListItemRow };
} finally {
  hooks.deregister();
}

const report = {
  version: 1,
  startedAt: new Date().toISOString(),
  commit,
  source:revision?'immutable git objects':'working tree',
  base,
  baseTree,
  image,
  transport:
    'Product TypeScript adapter -> local psql socket as authenticated, local auth.uid() stub',
  network: 'none',
  publishedPorts: 0,
  migrations: migrations.length,
  oldGrantsSha256: sha(oldGrants),
  inputs,
  cases: [],
};
async function scenario(id, description, run) {
  const observed = await run();
  report.cases.push({ id, description, status: 'passed', observed });
  console.log(id + ' PASS');
}
const q = sqlString;
const command = (who, kind, itemId, payload) => ({
  operationId: randomUUID(),
  userId: who,
  householdId: household,
  listId: list,
  itemId,
  kind,
  payload,
});
function rpcStatement(p) {
  const args = [
    p.p_operation_id,
    p.p_actor_id,
    p.p_household_id,
    p.p_list_id,
    p.p_item_id,
    p.p_kind,
    JSON.stringify(p.p_payload),
  ];
  return 'select public.apply_course_command(' + args.map(q).join(',') + ')';
}
const initial = [auth, ...migrations.slice(0, -2).map((file) => sql.get(file)), oldGrants].join(
  '\n',
);
const lab = await startLab({ sql: initial });
function send(intent, { who = intent.userId, mode = 'normal', name = 'g52_cmd' } = {}) {
  return applyCourseCommand(intent, {
    async rpc(rpcName, params) {
      assert.equal(rpcName, 'apply_course_command');
      if (mode === 'no_send') return { error: new Error('network unavailable'), data: null };
      const statement =
        rpcStatement(params) + (mode === 'during_tx' ? '; select pg_sleep(120)' : '');
      let data;
      try {
        data = JSON.parse(await lab.as(who, statement, name));
      } catch (error) {
        const code = /ERROR:\s+([A-Z0-9]{5}):/.exec(error.message)?.[1];
        return {
          data: null,
          error: code ? { code, message: error.message } : new Error('network unavailable'),
        };
      }
      if (mode === 'lost_reply')
        return { error: new Error('network timeout after commit'), data: null };
      if (mode === 'invalid_ack') data.operationId = randomUUID();
      return { data, error: null };
    },
  });
}
const count = async (table, condition) =>
  Number(await lab.query('select count(*) from ' + table + ' where ' + condition + ';'));
const receiptCount = (op) =>
  count('public.course_operation_receipts', 'operation_id=' + q(op.operationId));
const readRow = async (id) =>
  JSON.parse(
    await lab.query('select to_jsonb(i) from public.list_items i where id=' + q(id) + ';'),
  );
const checkOld = async (who, id, value, key) =>
  JSON.parse(
    await lab.as(
      who,
      'select public.apply_list_item_check(' + q(id) + ',' + value + ',' + q(key) + ')',
    ),
  );
const add = (who, label, quantity) => command(who, 'add', randomUUID(), { label, quantity });
let legacyId, inherited, added, addedAck, removed, secondRemove;
try {
  report.database = await lab.query('show server_version;');
  await scenario(
    'M01',
    'Upgrade on legacy data and rollback before the new ledger commits',
    async () => {
      const legacy = JSON.parse(
        await lab.as(
          alice,
          'select item from public.add_shopping_article(' +
            q(list) +
            ",'Flocons ancien',null,null)",
        ),
      );
      legacyId = legacy.id;
      inherited = command(alice, 'check', legacy.id, { checked: true });
      await checkOld(alice, legacyId, true, inherited.operationId);
      await checkOld(bob, legacyId, false, randomUUID());
      const before = await readRow(legacyId);
      assert.equal(before.checked, false);
      assert.equal(before.quantity, null);
      const [fix, ledger] = newMigrations.map((file) => sql.get(file));
      await lab.query(fix);
      assert.match(ledger, /commit;\s*$/i);
      // The psql session ends at EOF with uncommitted DDL. A separate session verifies recovery.
      await lab.query(ledger.replace(/commit;\s*$/i, ''));
      assert.equal(
        await lab.query("select to_regclass('public.course_operation_receipts') is null;"),
        't',
      );
      assert.deepEqual(await readRow(legacyId), before);
      await lab.query(ledger + '\n' + grants);
      assert.deepEqual(await readRow(legacyId), before);
      return {
        legacyRowSha256: sha(JSON.stringify(before)),
        afterMirrorsBefore: true,
        interruptedLedgerVisible: false,
        interruption: 'client disconnected with DDL transaction open',
      };
    },
  );
  await scenario(
    'L01',
    'Legacy check receipt after another member has unchecked the item',
    async () => {
      const ack = await send(inherited);
      assert.equal(ack.replayed, true);
      assert.equal(ack.payload.checked, true);
      assert.equal(ack.item.checked, false);
      const older = await checkOld(alice, legacyId, true, inherited.operationId);
      assert.equal(older.idempotent, true);
      assert.equal(older.checked, true);
      const toggles = await count('public.list_item_mutations', 'list_item_id=' + q(legacyId));
      assert.equal(toggles, 2);
      const next = await send(command(alice, 'check', legacyId, { checked: true }));
      assert.equal(next.item.checked, true);
      const purchases = Number(
        await lab.query(
          "select purchase_count from public.item_history where label_normalized='flocons ancien';",
        ),
      );
      assert.equal(purchases, 2);
      return {
        legacyRowsBeforeNewCheck: toggles,
        bridgedReceipts: await receiptCount(inherited),
        purchasesAfterRecheck: purchases,
      };
    },
  );
  await scenario(
    'A01',
    'No send, lost response, two replays, changed payload and separate add gesture',
    async () => {
      added = add(alice, 'Graines recette', '2');
      await assert.rejects(send(added, { mode: 'no_send' }), { rpcClass: 'transient' });
      assert.equal(await receiptCount(added), 0);
      await assert.rejects(send(added, { mode: 'lost_reply' }), { rpcClass: 'transient' });
      addedAck = await send(added);
      assert.equal(addedAck.replayed, true);
      assert.notEqual(addedAck.canonicalItemId, added.itemId);
      assert.equal((await send(added)).item.quantity, '2');
      await assert.rejects(send({ ...added, payload: { ...added.payload, quantity: '7' } }), {
        code: '22023',
      });
      const other = await send(add(bob, 'graines RECETTE', '2'));
      assert.equal(other.canonicalItemId, addedAck.canonicalItemId);
      assert.equal(other.item.quantity, '4');
      return {
        afterThreeDeliveries: '2',
        afterDistinctIntent: '4',
        firstIntentReceipts: await receiptCount(added),
        canonicalMapping: true,
      };
    },
  );
  await scenario(
    'D01',
    'Two concurrent deliveries by separate sessions reuse one operation UUID',
    async () => {
      const cmd = add(alice, 'Graines recette', '3');
      const release = await lab.holdRow(addedAck.canonicalItemId);
      const requests = Promise.allSettled([
        send(cmd, { name: 'g52_concurrent_one' }),
        send(cmd, { name: 'g52_concurrent_two' }),
      ]);
      try {
        await readyWhen(
          async () =>
            Number(
              await lab.query(
                "select count(*) from pg_stat_activity where application_name like 'g52_concurrent_%' and wait_event_type='Lock';",
              ),
            ) === 2,
          'two PostgreSQL requests awaiting locks',
        );
      } finally {
        await release();
      }
      const results = await requests;
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
      }
      assert.deepEqual(results.map((result) => result.value.replayed).sort(), [false, true]);
      const row = await readRow(addedAck.canonicalItemId);
      assert.equal(row.quantity, '7');
      assert.equal(await receiptCount(cmd), 1);
      const two = await Promise.all([
        send(add(alice, 'AXE synthétique', '2')),
        send(add(bob, 'axe synthetique', '3')),
      ]);
      assert.equal(two[0].canonicalItemId, two[1].canonicalItemId);
      const combined = await readRow(two[0].canonicalItemId);
      assert.equal(combined.quantity, '5');
      return {
        waitingSessions: 2,
        sharedUUID: { receipts: 1, startingQuantity: '4', endingQuantity: row.quantity },
        distinctIntents: { canonicalItems: 1, endingQuantity: combined.quantity },
      };
    },
  );
  await scenario(
    'D02',
    'Independent fields merge, divergent quantity remains a conflict, same desired value accepted',
    async () => {
      const id = addedAck.canonicalItemId;
      const label = command(alice, 'update', id, {
        label: 'Graines entières',
        expected: { label: 'Graines recette' },
      });
      const quantity = command(bob, 'update', id, { quantity: '9', expected: { quantity: '7' } });
      await Promise.all([send(label), send(quantity)]);
      const row = await readRow(id);
      assert.equal(row.label, 'Graines entières');
      assert.equal(row.quantity, '9');
      const stale = command(alice, 'update', id, { quantity: '5', expected: { quantity: '7' } });
      await assert.rejects(send(stale), { code: 'P0001' });
      assert.equal(await receiptCount(stale), 0);
      const sameGoal = await send(
        command(alice, 'update', id, { quantity: '9', expected: { quantity: '7' } }),
      );
      assert.equal(sameGoal.item.quantity, '9');
      assert.equal((await send(quantity)).replayed, true);
      return {
        label: row.label,
        quantity: row.quantity,
        divergentCode: 'P0001',
        divergentReceipts: 0,
        sameGoalAccepted: true,
      };
    },
  );
  await scenario(
    'Q01',
    'Malformed ACK after commit and an older check reply after the opposite check',
    async () => {
      const id = addedAck.canonicalItemId;
      const intent = command(alice, 'check', id, { checked: true });
      await assert.rejects(send(intent, { mode: 'invalid_ack' }), { rpcClass: 'terminal_parse' });
      assert.equal(await receiptCount(intent), 1);
      await send(command(bob, 'check', id, { checked: false }));
      const retried = await send(intent);
      assert.equal(retried.replayed, true);
      assert.equal(retried.payload.checked, true);
      assert.equal(retried.item.checked, false);
      return {
        originalChecked: true,
        currentChecked: false,
        receipts: await receiptCount(intent),
        replayed: true,
      };
    },
  );
  await scenario(
    'D03',
    'Deletion wins over late pending check/edit, explicit re-add and generation-bound undo',
    async () => {
      const id = addedAck.canonicalItemId;
      removed = command(bob, 'delete', id, {});
      const deleted = await send(removed);
      assert.ok(deleted.item.deletedAt);
      assert.equal((await send(removed)).replayed, true);
      for (const [kind, payload] of [
        ['update', { label: 'Retard',expected:{label:'Graines entières'} }],
        ['check', { checked: true }],
      ]) {
        const late = command(alice, kind, id, payload);
        await assert.rejects(send(late), { code: 'P0002' });
        assert.equal(await receiptCount(late), 0);
      }
      const readded = await send(add(alice, 'Graines entières', '1'));
      assert.notEqual(readded.canonicalItemId, id);
      const restore = command(bob, 'restore', id, { deleteOperationId: removed.operationId });
      const undo = await send(restore);
      assert.equal(undo.item.deletedAt, null);
      secondRemove = command(bob, 'delete', id, {});
      await send(secondRemove);
      const oldUndo = await send(restore);
      assert.ok(oldUndo.replayed && oldUndo.item.deletedAt);
      const staleUndo = command(bob, 'restore', id, { deleteOperationId: removed.operationId });
      await assert.rejects(send(staleUndo), { code: 'P0001' });
      await assert.rejects(send(command(bob, 'restore', id, {})), { code: 'P0001' });
      const currentUndo = await send(
        command(bob, 'restore', id, { deleteOperationId: secondRemove.operationId }),
      );
      assert.equal(currentUndo.item.deletedAt, null);
      return {
        peerLateCode: 'P0002',
        newCanonical: true,
        replayedUndoPreservedTombstone: true,
        staleUndoCode: 'P0001',
        correctUndoApplied: true,
      };
    },
  );
  await scenario(
    'R01',
    'PostgreSQL killed before commit, recovery and retry with same UUID',
    async () => {
      const cmd = add(bob, 'Après reprise', '1');
      const call = send(cmd, { mode: 'during_tx', name: 'g52_crash' }).then(
        () => false,
        () => true,
      );
      await readyWhen(
        async () =>
          Number(
            await lab.query(
              "select count(*) from pg_stat_activity where application_name='g52_crash' and wait_event='PgSleep';",
            ),
          ) === 1,
        'uncommitted data in PostgreSQL',
      );
      assert.equal(await receiptCount(cmd), 0);
      await lab.crash();
      assert.equal(await call, true);
      await lab.start();
      await lab.ready();
      assert.equal(await receiptCount(cmd), 0);
      assert.equal(await count('public.list_items', "label='Après reprise'"), 0);
      assert.equal(await receiptCount(added), 1);
      const result = await send(cmd);
      assert.equal(result.replayed, false);
      assert.equal((await send(cmd)).replayed, true);
      return {
        committedReferenceSurvived: true,
        partialReceipts: 0,
        partialItems: 0,
        postRetryReceipts: await receiptCount(cmd),
      };
    },
  );
  await scenario('S01', 'Receipt privacy, actor mismatch and membership revocation', async () => {
    const foreign = await lab.as(
      bob,
      'select count(*) from public.course_operation_receipts where actor_id=' + q(alice),
    );
    assert.equal(foreign, '0');
    await assert.rejects(send(added, { who: bob }), { code: '42501' });
    const wrongScope={...add(alice,'Essai portée','1'),householdId:randomUUID()};
    await assert.rejects(send(wrongScope),{code:'P0002'});
    assert.equal(await receiptCount(wrongScope),0);
    const privacy = await lab.query(
      'select bool_and(input_payload is null and octet_length(payload_digest)=32) from public.course_operation_receipts;',
    );
    assert.equal(privacy, 't');
    assert.equal(
      await lab.query(
        "select has_column_privilege('authenticated','course_operation_receipts','canonical_item_id','insert') or has_table_privilege('authenticated','course_operation_receipts','delete');",
      ),
      'f',
    );
    await lab.query(
      "update public.household_members set status='revoked' where user_id=" +
        q(bob) +
        ' and household_id=' +
        q(household) +
        ';',
    );
    assert.equal(await lab.as(bob, 'select count(*) from public.course_operation_receipts'), '0');
    await assert.rejects(send(secondRemove), { code: 'P0002' });
    return {
      otherActorReceipts: 0,
      revokedActorVisibleReceipts: 0,
      actorMismatch: '42501',
      mismatchedListHousehold: 'P0002',
      revokedScope: 'P0002',
      payloadStored: false,
    };
  });
  await lab.query(
    "update public.household_members set status='active' where user_id=" +
      q(bob) +
      ' and household_id=' +
      q(household) +
      ';',
  );
  await scenario(
    'I01',
    'Two durable client stores plus real adapter and PostgreSQL, including a failed local ACK commit',
    () => runJoinedClients({ client, lab, send, receiptCount }),
  );
  for (const [suite, marker] of Object.entries(suites)) {
    await scenario(
      'SQL/' + suite,
      'Unmodified SQL test entrypoint with synthetic fixture',
      async () => {
        const result = await lab.query(suiteBodies.get(suite));
        assert.ok(result.includes(marker), marker);
        return { marker };
      },
    );
  }
} finally {
  await lab.close();
}
report.finishedAt = new Date().toISOString();
report.passed = report.cases.length;
report.allSourcesMatchCommit = inputs.every((file) => file.matchesCommit);
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
