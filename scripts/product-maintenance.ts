import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { PoolClient } from 'pg';
import { createPool } from '../src/config.ts';
import { captureInternal } from '../src/explorer-store.ts';
import { migrate, migrationNames } from '../src/core.ts';
import { localPath } from './archive.ts';
import { backupDatabase, ensureArchiveDirectory } from './backup.ts';
import { backupRoot, checkPair } from './backup-history.ts';
import { reconcileArchiveCheck, recordBackupCheck } from './backup-checks.ts';
import { composeDatabaseUrl } from './postgres-tools.ts';

export function backupPeriods(date: Date) {
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return ['daily-' + date.toISOString().slice(0, 10), 'weekly-' + monday.toISOString().slice(0, 10)];
}

async function ensurePeriod(client: PoolClient, connection: URL, folder: string, period: string) {
  const names = await readdir(folder);
  const expected = period + '.dump';
  const pairs = new Set(
    names
      .map((n) => (n.endsWith('.json') ? n.slice(0, -5) : n))
      .filter((n) => n === expected || (n.startsWith(period + '-') && n.endsWith('.dump'))),
  );
  for (const name of Array.from(pairs).sort().reverse()) {
    let archive;
    try {
      archive = await checkPair(join(folder, name));
    } catch {
      continue; // Broken pairs stay available for diagnosis.
    }
    if (
      archive.format === 'fjstudio-backup-v2' &&
      archive.database === connection.pathname.slice(1) &&
      backupPeriods(new Date(archive.createdAt)).includes(period)
    ) {
      await reconcileArchiveCheck(client, archive);
      return { action: 'existing', file: name, sha256: archive.sha256, bytes: archive.bytes };
    }
  }
  if (pairs.size) await recordBackupCheck(client, 'archive', 'failed');
  const name = pairs.size ? period + '-' + randomUUID() + '.dump' : expected;
  const archive = await backupDatabase(join(folder, name), connection);
  return { action: 'created', file: name, sha256: archive.sha256, bytes: archive.bytes };
}

export async function productMaintenance(connection: URL, mode: 'once' | 'migrate', root = backupRoot) {
  const pool = createPool(connection.href);
  const client = await pool.connect();
  try {
    // Session lock spans the external pg_dump process and publication. Releasing this connection releases the lock.
    const lock = (await client.query(`SELECT pg_try_advisory_lock(8442,21) AS acquired`)).rows[0];
    if (!lock.acquired) {
      if (mode === 'migrate') throw new Error('Une maintenance Studio est déjà en cours.');
      return { state: 'busy', archives: [] };
    }
    const now: Date = (await client.query('SELECT clock_timestamp() AS instant')).rows[0].instant;
    const folder = localPath(join(root, connection.pathname.slice(1)));
    if (mode === 'migrate') {
      const existing = (await client.query("SELECT to_regclass('public.schema_migrations') AS relation"))
        .rows[0].relation;
      if (
        !existing &&
        (await client.query("SELECT 1 FROM pg_tables WHERE schemaname='public' LIMIT 1")).rowCount
      ) {
        throw new Error('Cette base contient déjà des tables sans historique de migration Studio.');
      }
      const applied = existing
        ? (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name)
        : [];
      const pending = (await migrationNames()).filter((n) => !applied.includes(n));
      const archives = [];
      let before;
      const hasJournal = applied.includes('012-human-access.sql');
      if (existing && pending.length) {
        const name = 'before-migration-' + now.toISOString().slice(0, 10) + '-' + randomUUID() + '.dump';
        before = await backupDatabase(join(folder, name), connection);
        archives.push({ action: 'created', file: name, sha256: before.sha256, bytes: before.bytes });
      }
      await migrate(pool);
      // A failed catalogue snapshot can be retried independently of the migration.
      try { await captureInternal(pool); }
      catch { console.error('Catalogue Studio indisponible. Relancez la capture de maintenance.'); }
      if (before && !hasJournal) await recordBackupCheck(client, 'archive', 'verified', before);
      return { state: 'migrated', archives };
    }
    await ensureArchiveDirectory(folder);
    const archives = [];
    for (const period of backupPeriods(now))
      archives.push(await ensurePeriod(client, connection, folder, period));
    return { state: 'verified', archives };
  } finally {
    client.release(true);
    await pool.end();
  }
}

if (import.meta.main) {
  const [mode, ...rest] = process.argv.slice(2);
  if (!['once', 'watch', 'migrate'].includes(mode) || rest.length) {
    throw new Error('Utiliser le mode once, watch ou migrate.');
  }
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort());
  process.once('SIGTERM', () => stop.abort());
  do {
    try {
      const result = await productMaintenance(composeDatabaseUrl(), mode === 'migrate' ? 'migrate' : 'once');
      console.log(
        JSON.stringify({
          event: 'maintenance.' + result.state,
          archives: result.archives.map((a) => ({
            file: basename(a.file),
            action: a.action,
            bytes: a.bytes,
          })),
        }),
      );
    } catch (error) {
      console.error(
        mode === 'watch'
          ? 'Maintenance locale en échec. Nouvelle tentative dans une heure.'
          : (error as Error).message,
      );
      if (mode !== 'watch') process.exitCode = 1;
    }
    if (mode === 'watch' && !stop.signal.aborted)
      await delay(60 * 60 * 1000, undefined, { signal: stop.signal }).catch(() => {});
  } while (mode === 'watch' && !stop.signal.aborted);
}
