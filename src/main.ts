import { once } from 'node:events';
import { createPool, getCredentials, validPort } from './config.ts';
import { runProductLabTick } from './product-lab.ts';
import { sweepControl } from './control-room-queue.ts';
import { Core, migrationNames } from './core.ts';
import { createServer } from './http.ts';
import { identityKey, verifyIdentityMode } from './product-auth.ts';

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
  await verifyIdentityMode(pool,process.env.STUDIO_HUMAN_AUTH==='1'?identityKey():undefined);
  const databaseName = (await pool.query('SELECT current_database() AS name')).rows[0].name;
  if (databaseName.includes('_restore_')) {
    const readiness=await pool.query("SELECT current_setting('studio.restore_pending',true) IS DISTINCT FROM 'on' AND EXISTS(SELECT 1 FROM restore_receipts WHERE target=$1) AS ready",[databaseName]);
    if (!readiness.rows[0].ready) throw new Error('La restauration doit être vérifiée avant la remise en service.');
  }
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
    await sweepControl(pool);
  }
  catch { console.error('Réconciliation indisponible. Vérifiez PostgreSQL.'); }
  finally { reconciling = false; }
}, 5000);
timer.unref();
let labActive: Promise<unknown> | null = null;
const labTimer=setInterval(()=> {
  if (!labActive) labActive=runProductLabTick(pool).catch(()=>console.error('Contrôle Lab indisponible.')).finally(()=>{labActive=null;});
},3000);
labTimer.unref();
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  clearInterval(labTimer);
  server.close(error => {
    if (error) process.exitCode = 1;
    void Promise.resolve(labActive).then(()=>pool.end()).catch(() => { process.exitCode = 1; });
  });
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
