import { once } from 'node:events';
import { createPool, getCredentials, validPort } from './config.ts';
import { Core, migrationNames } from './core.ts';
import { createServer } from './http.ts';

const port = validPort(process.env.A1_PORT ?? '3030');
const credentials = getCredentials();
const pool = createPool();
pool.on('error', () => console.error('Connexion PostgreSQL locale interrompue.'));
const core = new Core(pool);
const server = createServer(core, credentials);
try {
  const required = await migrationNames();
  const applied = await pool.query('SELECT name FROM schema_migrations WHERE name=ANY($1)', [required]);
  if (applied.rowCount !== required.length) throw new Error('Migrations locales requises.');
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
} catch (error) {
  await pool.end();
  throw new Error('Démarrage local impossible. Vérifiez le port et exécutez npm run migrate.', { cause: error });
}
console.log(`Folk & Joy Studio : http://127.0.0.1:${port}`);

let reconciling = false;
const timer = setInterval(async () => {
  if (reconciling) return;
  reconciling = true;
  try {
    await core.sweepExpired();
    await core.appLab.expire();
  }
  catch { console.error('Réconciliation indisponible. Vérifiez PostgreSQL.'); }
  finally { reconciling = false; }
}, 5000);
timer.unref();
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  server.close(error => {
    if (error) process.exitCode = 1;
    void pool.end().catch(() => { process.exitCode = 1; });
  });
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
