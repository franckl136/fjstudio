import { readFile } from 'node:fs/promises';
import { createPool } from '../src/config.ts';
import { isProjectId } from '../src/contracts.ts';
import { importCursorPulls } from '../src/cursor-sessions.ts';

const [project,repository,file]=process.argv.slice(2);
if(!isProjectId(project) || !repository || !file) throw Error('Arguments attendus : projet, propriétaire/dépôt, fichier JSON de PR.');
const pulls=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
const pool=createPool();
try {
  const linked=await importCursorPulls(pool,project,repository,pulls,new Date());
  console.log(linked+' liaison(s) Cursor relevée(s) pour '+project+'.');
} finally { await pool.end(); }
