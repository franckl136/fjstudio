import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { isObject } from '../src/contracts.ts';
import type { DatabaseState } from './backup-state.ts';

type ArchiveMetadata = { id: string; createdAt: string; studioVersion: string; postgresVersion: string; database: string };
export type Manifest = ArchiveMetadata & {
  format: 'fjstudio-backup-v1' | 'fjstudio-backup-v2';
  file: string; bytes: number; sha256: string;
  schema?: DatabaseState;
};
const digestPattern = /^[a-f0-9]{64}$/;

export function localPath(input: string) {
  if (!input || /^(?:\\\\|\/\/)/.test(input)) throw new Error('Choisissez un fichier sur un disque local.');
  const path = resolve(input);
  if (/^(?:\\\\|\/\/)/.test(path)) throw new Error('Choisissez un fichier sur un disque local.');
  if (process.platform === 'win32') {
    const drive = parse(path).root;
    if (!/^[A-Z]:\\$/i.test(drive) || !process.env.SystemRoot) throw new Error('Volume Windows local requis.');
    const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const type = execFileSync(powershell, ['-NoProfile','-NonInteractive','-Command',
      '[IO.DriveInfo]::new($env:FJ_BACKUP_VOLUME).DriveType.ToString()'], {
      env: { SystemRoot: process.env.SystemRoot, FJ_BACKUP_VOLUME: drive }, windowsHide: true,
      timeout: 5000, encoding: 'utf8',
    }).trim();
    if (type !== 'Fixed' && type !== 'Removable') throw new Error('Choisissez un disque local fixe ou amovible.');
  }
  // A redirect inside a local volume can still lead to another machine.
  const ancestors: string[] = [];
  for (let part = path; dirname(part) !== part; part = dirname(part)) ancestors.push(part);
  for (const part of ancestors.reverse()) {
    const entry = lstatSync(part, { throwIfNoEntry: false });
    if (entry?.isSymbolicLink()) throw new Error('Choisissez un chemin direct sans lien ni jonction.');
  }
  return path;
}

export async function fingerprint(file: FileHandle) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of file.createReadStream({start:0,autoClose:false})) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return {bytes,sha256:hash.digest('hex')};
}

function validSchema(schema: unknown) {
  if (!isObject(schema) || !Array.isArray(schema.migrations) || !schema.migrations.length ||
      !Array.isArray(schema.tables) || !schema.tables.length) return false;
  return schema.migrations.every(m => isObject(m) && typeof m.name === 'string' &&
    /^\d+[-_][a-z0-9_-]+\.sql$/.test(m.name) && typeof m.digest === 'string' && digestPattern.test(m.digest)) &&
    schema.tables.every(t => isObject(t) && typeof t.table === 'string' && /^[a-z][a-z0-9_]{0,62}$/.test(t.table) &&
      typeof t.rows === 'number' && Number.isSafeInteger(t.rows) && t.rows >= 0 && typeof t.sha256 === 'string' && digestPattern.test(t.sha256));
}

export async function readManifest(path: string): Promise<Manifest> {
  let value: unknown;
  try {
    const file = await open(localPath(path + '.json'), 'r');
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 256 * 1024) throw new Error();
      value = JSON.parse(await file.readFile('utf8'));
    } finally { await file.close(); }
  } catch { throw new Error('Manifeste absent ou illisible. Une archive A1 historique exige son SHA-256 indépendant.'); }
  if (!isObject(value) || !['fjstudio-backup-v1','fjstudio-backup-v2'].includes(String(value.format)) ||
      value.file !== basename(path) || typeof value.sha256 !== 'string' || !digestPattern.test(value.sha256) ||
      typeof value.bytes !== 'number' || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 ||
      typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/.test(value.id) ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
      typeof value.studioVersion !== 'string' || typeof value.postgresVersion !== 'string' ||
      typeof value.database !== 'string' || !/^fjstudio_a1(?:_(?:restore|test)_[a-z0-9_]{1,40})?$/.test(value.database) ||
      (value.format === 'fjstudio-backup-v2' && !validSchema(value.schema))) {
    throw new Error('Intégrité des métadonnées de sauvegarde incorrecte.');
  }
  return value as Manifest;
}

export async function verifyArchive(path: string, file: FileHandle, legacyDigest?: string) {
  const actual = await fingerprint(file);
  if (legacyDigest) {
    if (!/^[a-f0-9]{64}$/i.test(legacyDigest) || actual.sha256 !== legacyDigest.toLowerCase()) {
      throw new Error('Empreinte historique incorrecte.');
    }
    // The explicit digest supports historical, manifest-less A1 backups.
    // It cannot downgrade a present manifest or suppress its snapshot checks.
    if (!lstatSync(path + '.json', {throwIfNoEntry:false})) return { ...actual, manifest: undefined };
  }
  const manifest = await readManifest(path);
  if (manifest.sha256 !== actual.sha256 || manifest.bytes !== actual.bytes) {
    throw new Error('Intégrité de la sauvegarde incorrecte.');
  }
  return { ...actual, manifest };
}
if (import.meta.main) {
  try {
    const path = localPath(process.argv[2]);
    const file = await open(path, 'r');
    try {
      const {bytes, sha256} = await verifyArchive(path, file, process.argv[3]);
      console.log({bytes, sha256});
    } finally { await file.close(); }
  } catch (err) { console.error((err as Error).message); process.exitCode=1; }
}
