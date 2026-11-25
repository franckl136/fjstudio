import { open } from "node:fs/promises";
import { isDeepStrictEqual } from 'node:util';
import { databaseState } from './backup-state.ts';
import { transaction } from '../src/database.ts';
import { AppLab } from '../src/app-lab.ts';
import { createPool } from "../src/config.ts";
import { Core, migrate } from "../src/core.ts";
import { localPath, verifyArchive } from './archive.ts';
import { digestJson } from '../src/contracts.ts';
import { quarantineControl } from '../src/control-room-queue.ts';
import { recordBackupCheck } from './backup-checks.ts';
import { quarantineRestoredProduct, verifyProductEvidence } from './restore-quarantine.ts';
import { composeDatabaseUrl, postgresTool } from "./postgres-tools.ts";

export async function restoreDatabase(
  source: string,
  target: string,
  legacyDigest?: string,
  baseConnectionString = process.env.DATABASE_URL,
): Promise<void> {
  if (!/^fjstudio_a1_restore_[a-z0-9_]{1,40}$/.test(target)) {
    throw new Error("La restauration exige un nouveau nom fjstudio_a1_restore_<nom>.");
  }
  const base = composeDatabaseUrl(baseConnectionString);
  if (base.pathname === '/' + target) throw new Error('Choisissez une base distincte de la source.');
  const journal = createPool(base.href);
  base.pathname = "/" + target;
  const pool = createPool(base.href);
  let archive: Awaited<ReturnType<typeof open>> | undefined;
  let verified: Awaited<ReturnType<typeof verifyArchive>> | undefined;

  try {
    archive = await open(localPath(source), "r");
    const info = await archive.stat();
    const header = Buffer.alloc(5);
    const { bytesRead } = info.isFile() ? await archive.read(header, 0, header.length, 0) : { bytesRead: 0 };
    if (bytesRead !== header.length || header.toString("ascii") !== "PGDMP") {
      throw new Error("L’archive doit être une sauvegarde PostgreSQL A1 au format personnalisé.");
    }

    verified = await verifyArchive(source,archive,legacyDigest);
    await postgresTool("createdb", ["--template=template0", "--", target]);
    try {
      // This cluster-local marker is outside the dump. An inherited historical receipt cannot unlock the new database.
      await journal.query(`ALTER DATABASE "${target}" SET studio.restore_pending TO 'on'`);
      // Only restore trusted A1 backups. PostgreSQL restores SQL objects from the archive.
      await postgresTool(
        "pg_restore", ["--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges", "--dbname", target],
        archive.createReadStream({ start: 0, autoClose: false }),
      );
      const expected = verified.manifest?.format === 'fjstudio-backup-v2' ? verified.manifest.schema : undefined;
      if (expected) {
        const restored = await transaction(pool, databaseState, true);
        if (!isDeepStrictEqual(restored, expected)) {
          throw new Error('La base restaurée diverge du schéma ou des empreintes du snapshot.');
        }
      }
      await migrate(pool);
      const checkpoints=await pool.query('SELECT artifact,digest FROM checkpoints');
      if (checkpoints.rows.some(row=>digestJson(row.artifact)!==row.digest)) throw new Error('Empreinte de checkpoint restauré incohérente.');
      await new Core(pool).recoverRestoredState();
      await new AppLab(pool).revokeRestoredSessions();
      await quarantineControl(pool);
      const receipt = verified;
      await transaction(pool, async client => {
        await verifyProductEvidence(client);
        await quarantineRestoredProduct(client);
        await client.query(`INSERT INTO restore_receipts(target,archive_sha256,checkpoint_count,verified_table_count)
          VALUES ($1,$2,$3,$4)`, [target,receipt.sha256,checkpoints.rowCount,expected?.tables.length ?? null]);
        await recordBackupCheck(client,'restore','verified',receipt);
        await client.query(`ALTER DATABASE "${target}" RESET studio.restore_pending`);
      });
    } catch (error) {
      console.error(`La base ${target} a été créée. Elle est conservée pour diagnostic.`);
      throw error;
    }
    await recordBackupCheck(journal,'restore','verified',verified);
  } catch (error) {
    await recordBackupCheck(journal,'restore','failed',verified).catch(() => {});
    throw error;
  } finally {
    await archive?.close();
    await journal.end();
    await pool.end();
  }
}

async function main(): Promise<void> {
  const [, , source, target, legacyDigest, ...extra] = process.argv;
  if (!source || !target || extra.length) {
    throw new Error("Usage : npm run restore -- fichier.dump fjstudio_a1_restore_<nom>");
  }
  process.loadEnvFile(new URL("../.env.local", import.meta.url));
  await restoreDatabase(source, target, legacyDigest);
  console.log(`Sauvegarde restaurée dans la nouvelle base locale ${target}.`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
