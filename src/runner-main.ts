import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { getCredentials, validPort } from './config.ts';

const execute = promisify(execFile);
const task = fileURLToPath(new URL('./runner-task.ts', import.meta.url));
const baseUrl = process.env.A1_BASE_URL ?? `http://127.0.0.1:${validPort(process.env.A1_PORT ?? '3030')}`;
const selectedId = process.env.A1_RUNNER_ID;
const runners = getCredentials().filter(
  credential => credential.kind === 'runner' && (!selectedId || selectedId === credential.id)
);
if (!runners.length) throw new Error('Aucun profil runner local sélectionné.');

let stopped = false;
process.once('SIGTERM', () => { stopped = true; });
process.once('SIGINT', () => { stopped = true; });
console.log(`Worker de confiance : ${runners.map(runner => runner.id).join(', ')}`);

const failing = new Set<string>();
while (!stopped) {
  for (const runner of runners) {
    if (stopped) break;
    try {
      await execute(process.execPath, [task], {
        // Le sous-processus ne reçoit ni les autres identités ni la DSN.
        env: {
          ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
          A1_BASE_URL: baseUrl,
          A1_RUNNER_TOKEN: runner.token,
        },
        timeout: 12_000,
        maxBuffer: 4096,
        windowsHide: true,
      });
      failing.delete(runner.id);
    } catch {
      if (!failing.has(runner.id)) console.error(`Runner ${runner.id} indisponible. Vérifiez le Core local.`);
      failing.add(runner.id);
    }
  }
  if (!stopped) await delay(failing.size ? 1500 : 500);
}
