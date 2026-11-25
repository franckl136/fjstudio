import { fork } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { getCredentials, validPort } from '../src/config.ts';
import type { Credential } from '../src/contracts.ts';

const endpoint = process.env.A1_BASE_URL ?? 'http://127.0.0.1:' + validPort(process.env.A1_PORT ?? '3030');
const identities = getCredentials().filter(
  (r) => r.kind === 'runner' && (!process.env.A1_RUNNER_ID || process.env.A1_RUNNER_ID === r.id),
);
if (!identities.length) throw new Error('Aucun runner configuré pour le Control Room.');
const stop = new AbortController();
process.once('SIGINT', () => stop.abort());
process.once('SIGTERM', () => stop.abort());
async function supervise(identity: Credential) {
  while (!stop.signal.aborted) {
    const child = fork(fileURLToPath(new URL('./control-worker-task.ts', import.meta.url)), [], {
      env: {
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        A1_BASE_URL: endpoint,
        A1_RUNNER_TOKEN: identity.token,
      },
      execArgv: ['--max-old-space-size=64'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      windowsHide: true,
    });
    const shutdown = () => {
      if (child.connected) child.disconnect();
    };
    stop.signal.addEventListener('abort', shutdown, { once: true });
    child.on('message', (message) => {
      if (message === 'online' || message === 'unavailable')
        console.info(JSON.stringify({ event: 'control.runner.' + message, runner: identity.id }));
    });
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.once('error', () => resolve());
    });
    stop.signal.removeEventListener('abort', shutdown);
    if (!stop.signal.aborted) await delay(1500);
  }
}
console.info(JSON.stringify({ event: 'control.worker.started', runners: identities.map((r) => r.id) }));
await Promise.all(identities.map(supervise));
