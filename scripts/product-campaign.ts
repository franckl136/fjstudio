import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createPool } from '../src/config.ts';
import { CampaignCounters, saveCampaign, type Campaign, type Stage } from '../src/product-campaign.ts';
import { composeDatabaseUrl } from './postgres-tools.ts';

const root = realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const required = createRequire(import.meta.url);
const onWindows = process.platform==='win32';
function output(executable:string,args:string[]) {
  const command=spawnSync(executable,args,{cwd:root,encoding:'utf8',timeout:15000,windowsHide:true,
    maxBuffer:4*1024*1024,stdio:['ignore','pipe','ignore']});
  if (command.status!==0) throw Error('command');
  return command.stdout.trimEnd();
}
const git = (...args:string[]) => output('git',['-c','core.fsmonitor=false','--no-optional-locks',...args]);
function tree() {
  const head=git('rev-parse','--verify','HEAD^{commit}');
  if (!/^[a-f0-9]{40}$/.test(head)) throw Error('commit');
  const status=git('status','--porcelain=v1','-z','--untracked-files=all','--ignore-submodules=none');
  return {head,clean:status.length===0};
}
function npmPath() {
  const dir=dirname(realpathSync(process.execPath));
  const paths=[join(dir,'node_modules/npm/bin/npm-cli.js'),join(dir,'../lib/node_modules/npm/bin/npm-cli.js'),'/usr/share/nodejs/npm/bin/npm-cli.js'];
  const cli=paths.find(existsSync);
  if (!cli) throw Error('npm');
  return realpathSync(cli);
}

async function runNpm(npm:string, args:string[], counters?:CampaignCounters):Promise<Stage> {
  const started=Date.now();
  const env={...process.env,NO_COLOR:'1',npm_config_color:'false',npm_config_ignore_scripts:'true',
    npm_config_offline:'true',npm_config_update_notifier:'false',NODE_OPTIONS:''};
  const child=spawn(process.execPath,[npm,...args],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true,detached:!onWindows});
  const stdout=createHash('sha256');
  const stderr=createHash('sha256');
  child.stdout.on('data',(chunk:Buffer)=>{stdout.update(chunk);counters?.feed(chunk);});
  child.stderr.on('data',(chunk:Buffer)=>stderr.update(chunk));
  let expired=false;
  const timer=setTimeout(()=>{
    expired=true;
    if (!child.pid) return;
    if (onWindows) {
      spawnSync(join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],
        {stdio:'ignore',windowsHide:true,timeout:10000});
    } else {
      try { process.kill(-child.pid,'SIGKILL'); } catch { /* Already stopped. */ }
    }
  },30*60*1000);
  try {
    const exit=await new Promise<number|null>(resolve=>{
      child.once('error',()=>resolve(null));child.once('close',code=>resolve(code));
    });
    counters?.finish();
    return {exitCode:expired?null:exit,elapsedMs:Date.now()-started,stdoutSha256:stdout.digest('hex'),stderrSha256:stderr.digest('hex')};
  } finally {clearTimeout(timer);}
}

async function main() {
  if (process.argv.length!==2) throw Error('arguments');
  if (relative(root,realpathSync(git('rev-parse','--show-toplevel')))!=='') throw Error('root');
  if (!/^(?:https:\/\/github\.com\/|git@github\.com:)franckl136\/fjstudio(?:\.git)?$/i.test(git('remote','get-url','origin'))) throw Error('studio');
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  if (pkg.name!=='folk-and-joy-studio' || pkg.scripts?.typecheck!=='tsc --noEmit' ||
    pkg.scripts?.test!=='node --env-file-if-exists=.env.local --test --test-concurrency=1 test/*.test.ts') throw Error('scripts');
  const npm=npmPath();
  const versions={node:process.versions.node,npm:output(process.execPath,[npm,'--version']),
    git:git('--version').replace(/^git version /,''),typescript:String(required('typescript/package.json').version)};
  const admin=composeDatabaseUrl();
  if (admin.pathname!=='/fjstudio_a1') throw Error('database');
  const pool=createPool(admin.href);
  const db=await pool.connect();
  try {
    const lock=await db.query("SELECT pg_try_advisory_lock(hashtext('studio-product-campaign')) AS locked");
    if (!lock.rows[0].locked) throw Error('active');
    const before=tree();
    if (!before.clean) throw Error('dirty');
    const startedAt=new Date().toISOString();
    process.stdout.write('Campagne Studio · npm run typecheck\n');
    const typecheck=await runNpm(npm,['run','typecheck']);
    process.stdout.write('Campagne Studio · npm test\n');
    const counters=new CampaignCounters();
    const tests=await runNpm(npm,['test'],counters);
    let after:ReturnType<typeof tree>|undefined;
    try {after=tree();} catch { /* An unreadable final tree invalidates the verdict. */ }
    const report:Campaign={profile:'studio-npm-v1',startedAt,finishedAt:new Date().toISOString(),commitBefore:before.head,treeBefore:'clean',
      commitAfter:after?.head??null,treeAfter:after?(after.clean?'clean':'changed'):'unknown',versions,typecheck,tests,counts:counters.value};
    const receipt=await saveCampaign(db,report);
    process.stdout.write(JSON.stringify({...receipt,commit:before.head,counts:report.counts})+'\n');
    if (receipt.verdict!=='PASS') process.exitCode=1;
  } finally {db.release(true); await pool.end();}
}

main().catch((error:unknown)=>{
  const messages:Record<string,string>={dirty:'Le checkout du Studio doit être propre avant le départ.',active:'Une campagne est déjà active.',
    scripts:'Les scripts npm diffèrent du profil approuvé.',studio:'Le dépôt de cette commande doit être celui du Studio.',
    arguments:'La commande locale ne prend aucun paramètre.'};
  process.stderr.write((error instanceof Error && Object.hasOwn(messages,error.message)?messages[error.message]:'Campagne indisponible. Vérifier le checkout, les versions et PostgreSQL local.')+'\n');
  process.exitCode=1;
});
