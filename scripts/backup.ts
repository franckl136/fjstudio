import { createWriteStream } from 'node:fs';
import { link, lstat, mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { fingerprint, localPath, verifyArchive, type Manifest } from './archive.ts';
import { recordBackupCheck } from './backup-checks.ts';
import { databaseState } from './backup-state.ts';
import { windowsPrivate } from './windows-private.ts';
import { createPool } from '../src/config.ts';
import { transaction } from '../src/database.ts';
import { composeDatabaseUrl, postgresTool } from './postgres-tools.ts';

export async function ensureArchiveDirectory(folder: string) {
  const managedRoot = resolve(fileURLToPath(new URL('../backups/',import.meta.url)));
  const child = relative(managedRoot,folder);
  if (process.platform === 'win32' && !isAbsolute(child) && child !== '..' && !child.startsWith('..'+sep)) {
    await mkdir(managedRoot,{recursive:true,mode:0o700});
    windowsPrivate('ProtectBackupRoot',managedRoot);
  }
  await mkdir(folder,{recursive:true,mode:0o700});
}

export async function backupDatabase(destination: string, connection: URL): Promise<Manifest> {
  const pool = createPool(connection.href);
  try {
    const manifest = await publishArchive(destination, connection, pool);
    await recordBackupCheck(pool,'archive','verified',manifest);
    return manifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      await recordBackupCheck(pool,'archive','failed').catch(() => {});
    }
    throw error;
  } finally {
    await pool.end();
  }
}

async function publishArchive(destination: string, connection: URL, pool: ReturnType<typeof createPool>): Promise<Manifest> {
  const database = connection.pathname.slice(1);
  const target = localPath(destination);
  for (const path of [target, target + '.json']) {
    try {
      await lstat(path);
      throw Object.assign(new Error('EEXIST · Nom de sauvegarde déjà réservé.'), {code:'EEXIST'});
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  await ensureArchiveDirectory(dirname(target));
  const scratch = await mkdtemp(join(dirname(target), '.fjstudio-backup-'));
  const temporary = join(scratch, 'database.dump');
  try {
    if (process.platform === 'win32') windowsPrivate('ProtectEmptyScratch',scratch);
    const captured = await transaction(pool, async client => {
      const { rows: [source] } = await client.query<{ snapshot: string; version: string; at: Date }>(
        "SELECT pg_export_snapshot() AS snapshot, current_setting('server_version') AS version, now() AS at",
      );
      const schema = await databaseState(client);
      const output = createWriteStream(temporary, { flags: 'wx', mode: 0o600 });
      try {
        await postgresTool('pg_dump', [
          '--format=custom', '--no-owner', '--no-privileges', '--snapshot', source.snapshot, database,
        ], undefined, output);
      } finally { output.destroy(); }
      return { createdAt: source.at.toISOString(), postgresVersion: source.version, schema };
    }, true);
    const handle = await open(temporary, 'r');
    let integrity;
    try { integrity = await fingerprint(handle); }
    finally { await handle.close(); }
    const {name,version} = JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
    const manifest: Manifest = {
      format: 'fjstudio-backup-v2', id: randomUUID(), studioVersion: name+'@'+version,
      database, file: basename(target), ...captured, ...integrity,
    };
    const metadata = join(scratch, 'manifest.json');
    await writeFile(metadata, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag:'wx' });
    await link(temporary, target);
    // Publish the manifest last; neither hard link replaces an existing file.
    await link(metadata, target + '.json');
    const published = await open(target,'r');
    try {
      const pair = await verifyArchive(target,published);
      if (pair.manifest?.id !== manifest.id) throw new Error('Identité du manifeste publié incohérente.');
      return manifest;
    } finally { await published.close(); }
  } finally {
    await rm(scratch, { recursive:true, force:true });
  }
}
if (import.meta.main) {
  try {
    const [, , destination, ...extra] = process.argv;
    if (!destination || extra.length) throw new Error('Usage : npm run backup -- fichier.dump');
    process.loadEnvFile(new URL('../.env.local', import.meta.url));
    await backupDatabase(destination, composeDatabaseUrl());
    console.log(`Sauvegarde PostgreSQL locale créée · ${basename(destination)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Échec de sauvegarde.');
    process.exitCode = 1;
  }
}
