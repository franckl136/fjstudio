import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { windowsPrivate } from './windows-private.ts';
import { validPort } from '../src/config.ts';
import type { Credential, ProjectId, Role } from '../src/contracts.ts';

const dbPort = validPort(process.env.A1_DB_PORT ?? '55432');
const webPort = validPort(process.env.A1_PORT ?? '3030');
if (dbPort === webPort) throw new Error('Choisir deux ports locaux différents.');
const token = () => randomBytes(24).toString('base64url');
const password = token();
const credentials: Credential[] = [
  { kind: 'operator', id: 'operator-local', projectIds: ['a', 'b'], token: token() },
  { kind: 'operator', id: 'observer-a', projectIds: ['a'], token: token() },
];
for (const projectId of ['a', 'b'] as ProjectId[]) {
  for (const role of ['preparer', 'verifier'] as Role[]) {
    credentials.push({ kind: 'runner', id: `${projectId}-${role}`, projectId, role, token: token() });
  }
}

try {
  const contents = [
    `POSTGRES_PASSWORD=${password}`,
    `A1_DB_PORT=${dbPort}`,
    `A1_PORT=${webPort}`,
    `DATABASE_URL=postgresql://fjstudio:${password}@127.0.0.1:${dbPort}/fjstudio_a1`,
    "A1_CREDENTIALS_JSON='" + JSON.stringify(credentials) + "'",
    '',
  ].join('\n');
  if (process.platform === 'win32') windowsPrivate('PublishConfig', resolve('.env.local'), contents);
  else writeFileSync('.env.local', contents, { flag: 'wx', mode: 0o600 });
  console.log('.env.local créé. Utilisez npm run access:local pour consulter la clé de connexion.');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  console.log('.env.local existe déjà. Les identités existantes sont conservées.');
}
