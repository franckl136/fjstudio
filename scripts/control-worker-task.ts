import { setTimeout as delay } from 'node:timers/promises';
import { runControlOnce } from '../src/control-room-worker.ts';

const base = process.env.A1_BASE_URL,
  token = process.env.A1_RUNNER_TOKEN;
if (!base || !token || !process.send) throw new Error('Ce processus attend un superviseur local.');
const stop = new AbortController();
process.on('disconnect', () => stop.abort());
process.once('SIGTERM', () => stop.abort());
process.once('SIGINT', () => stop.abort());
let failing = false;
while (!stop.signal.aborted) {
  try {
    const worked = await runControlOnce(base, token, stop.signal);
    if (failing) process.send?.('online');
    failing = false;
    if (worked) continue;
  } catch {
    if (!failing && !stop.signal.aborted) process.send?.('unavailable');
    failing = true;
  }
  await delay(failing ? 3000 : 1200, undefined, { signal: stop.signal }).catch(() => {});
}
