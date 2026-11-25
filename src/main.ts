import { once } from 'node:events';
import { createPool, getCredentials, validPort } from './config.ts';
import { Core } from './core.ts';
import { createServer } from './http.ts';

const port = validPort(process.env.A1_PORT ?? '3030');
const credentials = getCredentials();
const pool = createPool();
pool.on('error', () => console.error('Connexion PostgreSQL locale interrompue.'));
const server = createServer(new Core(pool), credentials);
try {
  await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
} catch (error) {
  await pool.end();
  throw new Error('Démarrage local impossible. Vérifiez le port et exécutez npm run migrate.', { cause: error });
}
console.log(`Folk & Joy Studio : http://127.0.0.1:${port}`);

let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  server.close(error => {
    if (error) process.exitCode = 1;
    void pool.end().catch(() => { process.exitCode = 1; });
  });
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
