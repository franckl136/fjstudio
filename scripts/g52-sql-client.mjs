import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempDisposable, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alice, bob, household, list, sqlString } from './g52-sql-lab.mjs';

// Only the native key/value implementation is substituted with atomic local files. The scope,
// durable journal, lease, projections, FIFO, reconciliation and SQL RPC are the mobile source.
export async function runJoinedClients({ client, lab, send, receiptCount }) {
  const directory = await mkdtempDisposable(join(tmpdir(), 'fjg52-clients-'));
  let time = Date.now();
  async function device(who, label) {
    const file = join(directory.path, label + '.json');
    let rejectNextWrite = false;
    const storage = client.nativeCourseStorage({
      async getItem() {
        try {
          return await readFile(file, 'utf8');
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw error;
        }
      },
      async setItem(_key, value) {
        if (rejectNextWrite) {
          rejectNextWrite = false;
          throw new Error('synthetic ACK write failure');
        }
        await writeFile(file + '.pending', value);
        await rename(file + '.pending', file);
      },
    });
    const open = async () => {
      const store = new client.CourseStore(
        { userId: who, householdId: household, listId: list },
        storage,
        { freshId: randomUUID, now: () => time },
      );
      await store.open();
      return store;
    };
    let store = await open();
    return {
      store: () => store,
      visible: () => client.courseItems(store.getSnapshot()),
      restart: async () => {
        store = await open();
      },
      refresh: async () => {
        const sql =
          "select coalesce(jsonb_agg(to_jsonb(i)),'[]') from public.list_items i where i.list_id=" +
          sqlString(list) +
          ' and i.deleted_at is null';
        const rows = JSON.parse(await lab.as(who, sql)).map(client.mapListItemRow);
        assert.ok(await store.acceptSnapshot(store.getSnapshot().revision, rows));
      },
      flush: (transport = send) => client.flushCourses(store, transport, () => true),
      interruptNextCommit: () => {
        rejectNextWrite = true;
      },
    };
  }
  try {
    const a = await device(alice, 'a'),
      b = await device(bob, 'b');
    await Promise.all([a.refresh(), b.refresh()]);
    // Distinct devices have no knowledge of the other's provisional article identity.
    const aAdded = await a
      .store()
      .act({ kind: 'add', fields: { label: 'Essai rigatoni', quantity: '2' } });
    await a
      .store()
      .act({ kind: 'update', itemId: aAdded.item.id, fields: { label: 'Rigatoni renommés' } });
    await a.store().act({ kind: 'toggle', itemId: aAdded.item.id });
    const bAdded = await b
      .store()
      .act({ kind: 'add', fields: { label: 'Essai rigatoni', quantity: '2' } });
    assert.notEqual(aAdded.item.id, bAdded.item.id);
    await a.restart();
    assert.equal(a.store().getSnapshot().pending.length, 3);
    const cold = a.visible().find((row) => row.id === aAdded.item.id);
    assert.equal(cold.label, 'Rigatoni renommés');
    assert.equal(cold.checked, true);
    assert.equal(await b.flush(), 1);
    const canonical = b.visible().find((row) => row.label === 'Essai rigatoni').id;
    await assert.rejects(
      a.flush(async (intent) => {
        const ack = await send(intent);
        assert.equal(ack.canonicalItemId, canonical);
        a.interruptNextCommit();
        return ack;
      }),
      /synthetic ACK write failure/,
    );
    await a.restart();
    assert.equal(a.store().getSnapshot().pending.length, 3);
    assert.equal(a.store().getSnapshot().pending[0].status, 'sending');
    // Restart the actual database between lost local ACK and redelivery of the unaltered operation.
    await lab.crash();
    await lab.start();
    await lab.ready();
    time += 31000;
    const observations = [];
    assert.equal(
      await a.flush(async (intent) => {
        const ack = await send(intent);
        observations.push({
          kind: intent.kind,
          replayed: ack.replayed,
          sameCanonical: ack.canonicalItemId === canonical,
        });
        return ack;
      }),
      3,
    );
    assert.deepEqual(
      observations.map((o) => [o.kind, o.replayed, o.sameCanonical]),
      [
        ['add', true, true],
        ['update', false, true],
        ['check', false, true],
      ],
    );
    assert.equal(await receiptCount(aAdded), 1);
    assert.equal(await receiptCount(bAdded), 1);
    await Promise.all([a.refresh(), b.refresh()]);
    const matches = a.visible().filter((row) => row.id === canonical);
    assert.equal(matches.length, 1);
    assert.deepEqual(
      matches[0],
      b.visible().find((row) => row.id === canonical),
    );
    assert.equal(matches[0].label, 'Rigatoni renommés');
    assert.equal(matches[0].quantity, '4');
    assert.equal(matches[0].checked, true);
    assert.equal(a.store().getSnapshot().pending.length, 0);

    // Replay an add on a fresh client opening after a transport response loss, then repeat the gesture.
    const label = 'Amarante labo';
    const first = await a.store().act({kind:'add',fields:{label,quantity:'2'}});
    assert.equal(await a.flush(intent=>send(intent,{mode:'lost_reply'})),0);
    await a.restart();
    assert.equal(a.store().getSnapshot().pending[0].command.operationId,first.operationId);
    time += 3000;
    assert.equal(await a.flush(),1);
    assert.equal(a.visible().find(row=>row.label===label).quantity,'2');
    const second = await a.store().act({kind:'add',fields:{label,quantity:'2'}});
    assert.notEqual(first.operationId,second.operationId);
    assert.equal(await a.flush(),1);
    const repeated = a.visible().find(row=>row.label===label);
    assert.equal(repeated.quantity,'4');

    // A late ACK from an expired lease arrives after both the retried ACK and the next edit.
    await a.store().act({kind:'toggle',itemId:repeated.id});
    const late = await a.store().claim();
    const held = await send(late.command);
    time += 31000;
    const next = await a.store().claim();
    assert.equal(next.command.operationId,late.command.operationId);
    assert.notEqual(next.lease,late.lease);
    assert.equal(await a.store().acknowledge(await send(next.command),next.lease),true);
    await a.store().act({kind:'update',itemId:repeated.id,fields:{quantity:'6'}});
    assert.equal(await a.flush(),1);
    assert.equal(await a.store().acknowledge(held,late.lease),false);
    assert.equal(a.visible().find(row=>row.id===repeated.id).quantity,'6');

    // Create, edit quantity and delete before any send. The pending references follow the canonical ID.
    const shortLived = await a.store().act({kind:'add',fields:{label:'Article temporaire',quantity:'1'}});
    await a.store().act({kind:'update',itemId:shortLived.item.id,fields:{quantity:'3'}});
    await a.store().act({kind:'delete',itemId:shortLived.item.id});
    assert.ok(!a.visible().some(row=>row.label==='Article temporaire'));
    assert.equal(await a.flush(),3);
    assert.equal(await lab.query("select quantity from list_items where label='Article temporaire' and deleted_at is not null;"),'3');

    // The projection before a network call matches the SQL catalogue, including separators and units.
    await a.store().act({kind:'add',fields:{label:'Crème-test',quantity:'1,5 kg'}});
    await a.store().act({kind:'add',fields:{label:'creme test',quantity:'0,5 kg'}});
    assert.equal(a.visible().find(row=>row.label==='Crème-test').quantity,'2 kg');
    assert.equal(await a.flush(),2);
    assert.equal(await lab.query("select quantity from list_items where label='Crème-test' and deleted_at is null;"), '2 kg');
    return {
      offlineVisible: { label: cold.label, checked: cold.checked },
      pendingAfterFailedAcknowledgment: 3,
      recovered: observations,
      activeCanonicalItems: 1,
      pendingAtEnd: 0,
      distinctAdds: 2,
      quantityAtEnd: '4',
      devicesConverged: true,
      lostResponseAcrossReopen:{receipts:await receiptCount(first),quantityAfterReplay:'2',quantityAfterNewGesture:'4'},
      expiredLeaseACKAccepted:false,
      addUpdateDeleteBeforeSync:{applied:3,tombstoneQuantity:'3'},
      localAndServerMergedQuantity:'2 kg',
    };
  } finally {
    await directory.remove();
  }
}
