import { createPool } from './config.ts';
import { migrate } from './core.ts';

const pool = createPool();
try {
  await migrate(pool);
  console.log('Schéma A1 et projets synthétiques prêts.');
} finally {
  await pool.end();
}
