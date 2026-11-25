import { basename } from 'node:path';
import { createPool } from '../src/config.ts';
import { checkPair } from './backup-history.ts';
import { recordBackupCheck } from './backup-checks.ts';
import { composeDatabaseUrl } from './postgres-tools.ts';

export async function verifyProductBackup(path: string, connection: URL) {
  const pool = createPool(connection.href);
  try {
    const archive = await checkPair(path);
    if (archive.database !== connection.pathname.slice(1))
      throw new Error('Le manifeste désigne une autre base source.');
    await recordBackupCheck(pool, 'archive', 'verified', archive);
    return archive;
  } catch (error) {
    await recordBackupCheck(pool, 'archive', 'failed').catch(() => {});
    throw error;
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  try {
    const [path, ...extra] = process.argv.slice(2);
    if (!path || extra.length) throw new Error('Indiquer le chemin du dump à vérifier.');
    const archive = await verifyProductBackup(path, composeDatabaseUrl());
    console.log(
      JSON.stringify({
        event: 'backup.verified',
        file: basename(path),
        bytes: archive.bytes,
        sha256: archive.sha256,
      }),
    );
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
