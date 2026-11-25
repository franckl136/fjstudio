import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { composeArguments } from './postgres-tools.ts';

const action = process.argv[2];
if (action !== 'up' && action !== 'stop') throw new Error('Utiliser npm run db:up ou npm run db:stop.');
const args = action === 'up' ? ['up', '-d', '--wait', 'db'] : ['stop', 'db'];
const result = spawnSync('docker', [...composeArguments(), ...args], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
