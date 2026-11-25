import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createPool } from '../src/config.ts';
import { migrate } from '../src/core.ts';
import { checkPair, inventory } from '../scripts/backup-history.ts';
import { composeDatabaseUrl } from '../scripts/postgres-tools.ts';

const command = promisify(execFile);
const root = fileURLToPath(new URL('../',import.meta.url));

test('G3.1 · première configuration Windows privée et republication sans écrasement', {
  skip:process.platform !== 'win32',
}, async t => {
  const dir = await mkdtemp(join(tmpdir(),'fjstudio-private-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const setup = join(root,'scripts','setup-local.ts');
  const {stdout} = await command(process.execPath,[setup],{cwd:dir});
  assert.match(stdout,/créé/);
  const path = join(dir,'.env.local');
  const first = await readFile(path);
  const again = await command(process.execPath,[setup],{cwd:dir});
  assert.match(again.stdout,/existe déjà/);
  assert.deepEqual(await readFile(path),first);
  const powershell = join(process.env.SystemRoot!,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const rights = await command(powershell,['-NoProfile','-NonInteractive','-Command',`
    $acl=[IO.File]::GetAccessControl([IO.Path]::Combine($pwd.Path,'.env.local'))
    if (!$acl.AreAccessRulesProtected) { exit 1 }
    $expected=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544') | Sort-Object
    $actual=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | ForEach-Object { $_.IdentityReference.Value } | Sort-Object)
    if (Compare-Object $expected $actual) {exit 1}; 'private'
  `],{cwd:dir});
  assert.match(rights.stdout,/private/);
});

test('G3.1 · manifeste v2 lié au snapshot, divergence restaurée refusée, paire incomplète visible', async t => {
  const dir = await mkdtemp(join(tmpdir(),'fjstudio-manifest-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const archive = join(dir,'schema.dump');
  const suffix = randomUUID().replaceAll('-','');
  const sourceName = 'fjstudio_a1_test_'+suffix;
  const targetName = 'fjstudio_a1_restore_'+suffix;
  const base = composeDatabaseUrl();
  const admin = createPool(base.href);
  const url = new URL(base.href);
  url.pathname='/'+sourceName;
  const source = createPool(url.href);
  const invoke = (script:string,args:string[])=>command(process.execPath,['scripts/'+script+'.ts',...args],{
    cwd:root,env:{...process.env,DATABASE_URL:url.href},timeout:30000,
  });
  let sourceCreated = false, targetAttempted = false;
  try {
    await admin.query('CREATE DATABASE '+sourceName+' TEMPLATE template0');
    sourceCreated=true;
    await migrate(source);
    await writeFile(archive+'.json','orphan',{flag:'wx'});
    assert.equal((await inventory(dir))[0].path,archive);
    await assert.rejects(checkPair(archive));
    await assert.rejects(invoke('backup',[archive]),/EEXIST/);
    assert.equal(await readFile(archive+'.json','utf8'),'orphan');
    await rm(archive+'.json');
    await invoke('backup',[archive]);
    const manifest=await checkPair(archive);
    assert.equal(manifest.format,'fjstudio-backup-v2');
    assert.equal(manifest.schema?.tables.find(r=>r.table==='projects')?.rows,2);
    const versions=await source.query('SELECT name,digest FROM schema_migrations ORDER BY name');
    assert.deepEqual(manifest.schema?.migrations,versions.rows);
    assert(manifest.schema);
    const row=manifest.schema.tables.find(item=>item.table==='projects')!;
    row.rows++;
    await writeFile(archive+'.json',JSON.stringify(manifest));
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[targetName])).rowCount,0);
    targetAttempted=true;
    await assert.rejects(invoke('restore',[archive,targetName]),/diverge/);
    const targetUrl=new URL(base.href);
    targetUrl.pathname='/'+targetName;
    const target=createPool(targetUrl.href);
    try { assert.equal((await target.query('SELECT * FROM restore_receipts')).rowCount,0); }
    finally { await target.end(); }
  } finally {
    await source.end();
    try {
      if (targetAttempted) await admin.query('DROP DATABASE IF EXISTS '+targetName);
      if (sourceCreated) await admin.query('DROP DATABASE '+sourceName);
    } finally { await admin.end(); }
  }
});
