import pg from 'pg';
import { isObject, isProjectId } from './contracts.ts';
import type { Credential } from './contracts.ts';

export function getCredentials(raw = process.env.A1_CREDENTIALS_JSON): Credential[] {
  let entries: unknown;
  try {
    entries = JSON.parse(raw ?? '');
  } catch {
    throw new Error('A1_CREDENTIALS_JSON manquant ou invalide. Voir npm run setup:local.');
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('A1_CREDENTIALS_JSON doit contenir des identités locales.');
  }
  const tokens = new Set<string>();
  const ids = new Set<string>();
  const credentials: Credential[] = [];
  for (const entry of entries) {
    if (!isObject(entry)) throw new Error('Identité locale invalide.');
    const { token, id } = entry;
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(token) ||
        typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id) || tokens.has(token) || ids.has(id)) {
      throw new Error('Identifiant ou clé locale invalide ou répété.');
    }
    tokens.add(token);
    ids.add(id);
    if (entry.kind === 'operator' && Array.isArray(entry.projectIds) &&
        entry.projectIds.length > 0 && entry.projectIds.every(isProjectId)) {
      credentials.push({ token, id, kind: 'operator', projectIds: entry.projectIds });
    } else if (entry.kind === 'runner' && isProjectId(entry.projectId) &&
               (entry.role === 'preparer' || entry.role === 'verifier')) {
      credentials.push({ token, id, kind: 'runner', projectId: entry.projectId, role: entry.role });
    } else {
      throw new Error('Périmètre de l’identité locale invalide.');
    }
  }
  return credentials;
}

export function validPort(value: string): number {
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('Port local invalide.');
  }
  return port;
}

export function createPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  let url: URL;
  try {
    url = new URL(connectionString ?? '');
  } catch {
    throw new Error('DATABASE_URL doit désigner une base PostgreSQL locale.');
  }
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || !url.port ||
      url.username !== 'fjstudio' || !url.password || url.search || url.hash ||
      !/^\/fjstudio_a1(?:_(?:test|restore)_[a-z0-9_]{1,40})?$/.test(url.pathname)) {
    throw new Error('DATABASE_URL doit désigner une base A1 locale sur 127.0.0.1 avec l’utilisateur fjstudio, sans paramètres.');
  }
  return new pg.Pool({ connectionString, ssl: false, max: 8, connectionTimeoutMillis: 3000 });
}
