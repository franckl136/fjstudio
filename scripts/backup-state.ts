import type { PoolClient } from 'pg';

type QueryClient = Pick<PoolClient, 'query'>;
export type MigrationRecord = { name: string; digest: string };
export type TableFingerprint = { table: string; rows: number; sha256: string };
export type DatabaseState = {
  migrations: MigrationRecord[];
  tables: TableFingerprint[];
};

// The caller supplies one transaction with a stable snapshot. Each row includes
// all columns, including keys, foreign references, structured evidence and dates.
export async function databaseState(client: QueryClient): Promise<DatabaseState> {
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  await client.query("SET LOCAL DateStyle TO 'ISO, YMD'");
  const migrations = await client.query<MigrationRecord>(
    'SELECT name, digest FROM public.schema_migrations ORDER BY name',
  );
  const names = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  const tables: TableFingerprint[] = [];
  for (const { tablename } of names.rows) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(tablename)) {
      throw new Error('Le nom d’une table sort du profil Studio.');
    }
    const { rows: [data] } = await client.query<{ rows: string; sha256: string }>(`
      SELECT count(*) AS rows,
             encode(sha256(convert_to(coalesce(string_agg(row_digest, '' ORDER BY row_digest COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
      FROM (
        SELECT encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') AS row_digest
        FROM public."${tablename}" AS t
      ) AS fingerprints`);
    const count = Number(data.rows);
    if (!Number.isSafeInteger(count)) throw new Error('Taille du jeu de sauvegarde hors profil.');
    tables.push({ table: tablename, rows: count, sha256: data.sha256 });
  }
  return { migrations: migrations.rows, tables };
}
