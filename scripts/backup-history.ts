import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/config.ts';
import { localPath, verifyArchive } from './archive.ts';
import { composeDatabaseUrl } from './postgres-tools.ts';

export const backupRoot = fileURLToPath(new URL('../backups/',import.meta.url));
export async function inventory(folder: string) {
  const root = localPath(folder);
  const pairs = new Map<string, number>();
  for (const item of await readdir(root, { withFileTypes:true })) {
    if (!item.isFile() && !item.isSymbolicLink()) continue;
    const archive = item.name.endsWith('.json') ? item.name.slice(0,-5) : item.name;
    const path = join(root,archive);
    // Keep broken pairs visible. A link itself is never opened as an archive.
    const touched = item.isSymbolicLink() ? Date.now() : (await stat(join(root,item.name))).mtimeMs;
    pairs.set(path,Math.max(touched,pairs.get(path) ?? 0));
  }
  return Array.from(pairs,([path,mtime])=>({path,mtime})).sort((a,b)=>b.mtime-a.mtime || a.path.localeCompare(b.path));
}

export async function checkPair(path: string) {
  const file = await open(localPath(path),'r');
  try {
    if (!(await file.stat()).isFile()) throw new Error('Fichier de sauvegarde attendu.');
    const {manifest} = await verifyArchive(path,file);
    if (!manifest) throw new Error('Manifeste requis.');
    return manifest;
  } finally { await file.close(); }
}
type RestoreReceipt = { target: string; hash: string; checkpoints: number; tables: number | null; restored: Date };
export async function restoreHistory(base: URL) {
  const admin = createPool(base.href);
  let targets: string[];
  try {
    targets = (await admin.query<{datname:string}>(
      "SELECT datname FROM pg_database WHERE datname ~ '^fjstudio_a1_restore_[a-z0-9_]{1,40}$' AND datallowconn ORDER BY datname",
    )).rows.map(r => r.datname);
  } finally { await admin.end(); }

  const receipts: RestoreReceipt[] = [];
  const incomplete: string[] = [];
  for (const name of targets) {
    const address = new URL(base.href);
    address.pathname = '/' + name;
    const db = createPool(address.href);
    try {
      const result = await db.query<RestoreReceipt>(`SELECT target, archive_sha256 AS hash, checkpoint_count AS checkpoints,
        (to_jsonb(r)->>'verified_table_count')::integer AS tables, completed_at AS restored
        FROM public.restore_receipts r WHERE target=current_database() ORDER BY id DESC LIMIT 1`);
      if (result.rows[0]) receipts.push(result.rows[0]);
      else incomplete.push(name);
    } catch { incomplete.push(name); }
    finally { await db.end(); }
  }
  receipts.sort((a,b)=>b.restored.getTime()-a.restored.getTime());
  return {receipts,incomplete};
}

if (import.meta.main) {
  try {
    const files = await inventory(process.argv[2] ?? backupRoot);
    for (const entry of files) {
      try {
        const m = await checkPair(entry.path);
        const version = m.schema?.migrations.at(-1)?.name ?? 'inventaire du schéma absent (v1)';
        console.log(`${m.createdAt} · ${m.file} · ${m.studioVersion} · ${version} · ${m.bytes} octets · SHA-256 vérifié`);
      } catch {
        // An original A1 archive may legitimately have no manifest. Its independent hash is required.
        console.log(`Paire non vérifiée · ${entry.path}`);
      }
    }
    const {receipts,incomplete} = await restoreHistory(composeDatabaseUrl());
    for (const r of receipts) {
      const coverage = r.tables === null ? 'comparaison intégrale non enregistrée' : r.tables+' tables comparées';
      console.log(`${r.restored.toISOString()} · ${r.target} · ${r.hash} · ${r.checkpoints} checkpoints · ${coverage}`);
    }
    for (const target of incomplete) console.log(`Aucun reçu exploitable · ${target}`);
  } catch (err) { console.error((err as Error).message); process.exitCode = 1; }
}
