import { mkdtemp, mkdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDirectHttp } from '../src/runner.ts';
import { getCredentials, validPort, createPool } from '../src/config.ts';
import { composeDatabaseUrl, postgresTool } from './postgres-tools.ts';
import { migrationNames } from '../src/core.ts';
import { backupRoot, checkPair, inventory, restoreHistory } from './backup-history.ts';

async function probe(label: string, work: () => Promise<string>) {
  try { console.log('OK · '+label+' · '+await work()); }
  catch { console.error('À vérifier · '+label); process.exitCode=1; }
}
await probe('PostgreSQL, port Compose et schéma', async () => {
  const db=createPool(composeDatabaseUrl().href);
  try {
    const applied = (await db.query<{name:string}>('SELECT name FROM schema_migrations ORDER BY name')).rows.map(r=>r.name);
    const required = await migrationNames();
    if (applied.length !== required.length || required.some((name,i)=>applied[i]!==name)) throw new Error();
    return composeDatabaseUrl().pathname.slice(1)+' · '+applied.at(-1);
  } finally { await db.end(); }
});
const roles=getCredentials();
const operator=roles.find(c=>c.kind==='operator' && c.id==='operator-local');
await probe('Core authentifié et appels des runners supervisés',async()=>{
  if (!operator || operator.kind!=='operator') throw new Error();
  assertDirectHttp();
  const port=validPort(process.env.A1_PORT??'3030');
  const res=await fetch('http://127.0.0.1:'+port+'/api/command',{
    headers:{authorization:'Bearer '+operator.token},redirect:'error',signal:AbortSignal.timeout(4000)});
  if (!res.ok) throw new Error();
  const data=await res.json();
  const expected=roles.filter(c=>c.kind==='runner' && operator.projectIds.includes(c.projectId));
  const absent=expected.filter(c=>!data.contacts.some((r:{runner_id:string;fresh:boolean})=>r.runner_id===c.id && r.fresh));
  if (absent.length) { console.error('Contacts absents ou anciens · '+absent.map(c=>c.id).join(', ')); throw new Error(); }
  return expected.length+' identités observées';
});
await probe('Création et relecture d’un fichier de sauvegarde local',async()=>{
  const root=fileURLToPath(new URL('../backups/',import.meta.url));
  await mkdir(root,{recursive:true});
  const dir=await mkdtemp(join(root,'.probe-'));
  const dest=join(dir,'write.check');
  try {
    await writeFile(dest,'studio',{flag:'wx',mode:0o600});
    if ((await readFile(dest,'utf8'))!=='studio') throw new Error();
  } finally { try { await unlink(dest); } finally { await rmdir(dir); } }
  return 'écriture et lecture réussies';
});
await probe('Lecture des artefacts et capacité pg_dump',async()=>{
  const db=createPool(composeDatabaseUrl().href);
  try {
    await db.query('SELECT digest FROM checkpoints LIMIT 1');
    await postgresTool('pg_dump',['--schema-only','--no-owner',composeDatabaseUrl().pathname.slice(1)]);
  } finally { await db.end(); }
  return 'schéma exporté par PostgreSQL';
});
await probe('Lecture et intégrité de la dernière paire locale par date de fichier',async()=>{
  const [latest] = await inventory(backupRoot);
  if (!latest) {
    console.log('Non démontré · aucune sauvegarde locale détectée');
    throw new Error();
  }
  const manifest = await checkPair(latest.path);
  return manifest.file+' · SHA-256 '+manifest.sha256;
});
await probe('Lecture des reçus de restauration',async()=>{
  const {receipts,incomplete} = await restoreHistory(composeDatabaseUrl());
  if (incomplete.length) console.log('Cibles sans reçu exploitable · '+incomplete.join(', '));
  const recent = receipts[0];
  if (!recent) return 'aucune restauration enregistrée';
  return recent.target+' · '+recent.restored.toISOString()+' · '+recent.checkpoints+
    ' checkpoints · '+(recent.tables===null?'comparaison intégrale non enregistrée':recent.tables+' tables comparées');
});
