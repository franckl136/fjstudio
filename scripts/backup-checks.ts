import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

type Operation = 'archive' | 'restore';
type Outcome = 'verified' | 'failed';
const details = {
  archive: {
    verified: 'Dump et manifeste relus. SHA-256 et taille vérifiés.',
    failed: 'Création ou vérification du dump local en échec.',
  },
  restore: {
    verified: 'Restauration isolée terminée. Intégrité et quarantaine contrôlées.',
    failed: 'Restauration isolée en échec. Base source conservée.',
  },
};

export async function recordBackupCheck(
  db: Pool | PoolClient,
  operation: Operation,
  outcome: Outcome,
  archive?: { sha256: string; bytes: number },
) {
  // Old Studio schemas can be backed up before migration 012 adds this journal.
  if (!(await db.query("SELECT to_regclass('public.studio_backup_checks') AS relation")).rows[0].relation)
    return;
  await db.query('INSERT INTO studio_backup_checks(id,outcome,sha256,bytes,detail) VALUES($1,$2,$3,$4,$5)', [
    randomUUID(),
    outcome,
    archive?.sha256 ?? null,
    archive?.bytes ?? null,
    details[operation][outcome],
  ]);
}

export async function reconcileArchiveCheck(client: PoolClient, archive: { sha256: string; bytes: number }) {
  // A crash may occur between publishing the manifest and committing its receipt.
  if (!(await client.query("SELECT to_regclass('public.studio_backup_checks') AS relation")).rows[0].relation)
    return;
  const match = await client.query(
    "SELECT 1 FROM studio_backup_checks WHERE sha256=$1 AND bytes=$2 AND outcome='verified' AND detail=$3 LIMIT 1",
    [archive.sha256, archive.bytes, details.archive.verified],
  );
  if (!match.rowCount) await recordBackupCheck(client, 'archive', 'verified', archive);
}
