import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { windowsPrivate } from './windows-private.ts';

const path = resolve('.env.human.local');
const contents = 'STUDIO_HUMAN_AUTH=1\nSTUDIO_TOTP_MASTER=' + randomBytes(32).toString('base64url') + '\n';
try {
  if (process.platform === 'win32') windowsPrivate('PublishConfig', path, contents);
  else writeFileSync(path, contents, {flag:'wx', mode:0o600});
  console.log('La configuration privée des comptes est prête.');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  console.log('La clé existante des comptes est conservée.');
}
