import { createWriteStream } from "node:fs";
import { link, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { composeDatabaseUrl, postgresTool } from "./postgres-tools.ts";

async function backupDatabase(destination: string, database = "fjstudio_a1"): Promise<void> {
  if (database !== "fjstudio_a1" && !/^fjstudio_a1_(?:test|restore)_[a-z0-9_]{1,40}$/.test(database)) {
    throw new Error("La sauvegarde est limitée aux bases PostgreSQL locales A1.");
  }
  const target = resolve(destination);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const scratch = await mkdtemp(join(dirname(target), ".fjstudio-backup-"));
  const temporary = join(scratch, "database.dump");

  try {
    const output = createWriteStream(temporary, { flags: "wx", mode: 0o600 });
    try {
      await postgresTool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", database], undefined, output);
    } finally {
      output.destroy();
    }
    await link(temporary, target);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const [, , destination, ...extra] = process.argv;
  if (!destination || extra.length) throw new Error("Usage : npm run backup -- fichier.dump");
  process.loadEnvFile(new URL("../.env.local", import.meta.url));
  await backupDatabase(destination, composeDatabaseUrl().pathname.slice(1));
  console.log(`Sauvegarde PostgreSQL locale : ${resolve(destination)}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
