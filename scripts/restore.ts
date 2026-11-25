import { open } from "node:fs/promises";
import { createPool } from "../src/config.ts";
import { Core } from "../src/core.ts";
import { composeDatabaseUrl, postgresTool } from "./postgres-tools.ts";

async function restoreDatabase(
  source: string,
  target: string,
  baseConnectionString = process.env.DATABASE_URL,
): Promise<void> {
  if (!/^fjstudio_a1_restore_[a-z0-9_]{1,40}$/.test(target)) {
    throw new Error("La restauration exige un nouveau nom fjstudio_a1_restore_<nom>.");
  }
  const base = composeDatabaseUrl(baseConnectionString);
  base.pathname = "/" + target;
  const archive = await open(source, "r");
  const pool = createPool(base.href);

  try {
    const info = await archive.stat();
    const header = Buffer.alloc(5);
    const { bytesRead } = info.isFile() ? await archive.read(header, 0, header.length, 0) : { bytesRead: 0 };
    if (bytesRead !== header.length || header.toString("ascii") !== "PGDMP") {
      throw new Error("L’archive doit être une sauvegarde PostgreSQL A1 au format personnalisé.");
    }

    await postgresTool("createdb", ["--template=template0", "--", target]);
    try {
      // Only restore trusted A1 backups. PostgreSQL restores SQL objects from the archive.
      await postgresTool(
        "pg_restore", ["--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges", "--dbname", target],
        archive.createReadStream({ start: 0, autoClose: false }),
      );
      await new Core(pool).recoverRestoredState();
    } catch (error) {
      console.error(`La base ${target} a été créée. Elle est conservée pour diagnostic.`);
      throw error;
    }
  } finally {
    await archive.close();
    await pool.end();
  }
}

async function main(): Promise<void> {
  const [, , source, target, ...extra] = process.argv;
  if (!source || !target || extra.length) {
    throw new Error("Usage : npm run restore -- fichier.dump fjstudio_a1_restore_<nom>");
  }
  process.loadEnvFile(new URL("../.env.local", import.meta.url));
  await restoreDatabase(source, target);
  console.log(`Sauvegarde restaurée dans la nouvelle base locale ${target}.`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
