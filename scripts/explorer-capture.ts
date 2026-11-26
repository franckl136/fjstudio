import { createPool } from '../src/config.ts';
import { captureInternal } from '../src/explorer-store.ts';
const pool=createPool();
try {
  const result=await captureInternal(pool);
  console.log('Photographie du catalogue Studio · '+result.id);
} finally {await pool.end();}
