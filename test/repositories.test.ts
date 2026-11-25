import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { composeDatabaseUrl } from '../scripts/postgres-tools.ts';
import { createPool } from '../src/config.ts';
import { Core, migrate } from '../src/core.ts';
import { transaction } from '../src/database.ts';
import { DomainError } from '../src/contracts.ts';
import { readMissionRepository, Repositories } from '../src/repositories.ts';

const execute=promisify(execFile);
const owner={id:'operator-fixture',projectIds:['b'] as const};
const foreign={id:'operator-outside',projectIds:['a'] as const};
const denied=(err: unknown)=>err instanceof DomainError && err.status===404;

test('G4.1 · origine autorisée, état local isolé, rapport de mission figé et cloisonnement',async t=>{
  const url=composeDatabaseUrl();
  assert.equal(url.pathname,'/fjstudio_a1');
  const admin=createPool(url.href);
  const database='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  await admin.query('CREATE DATABASE '+database+' TEMPLATE template0');
  url.pathname='/'+database;
  const pool=createPool(url.href);
  const folder=await mkdtemp(join(tmpdir(),'studio-git-fixture-'));
  const directory=join(folder,'source');
  const previous=process.env.STUDIO_GIT_REPOSITORIES;
  t.after(async()=>{
    if (previous===undefined) delete process.env.STUDIO_GIT_REPOSITORIES;
    else process.env.STUDIO_GIT_REPOSITORIES=previous;
    await pool.end();
    try { await admin.query('DROP DATABASE '+database); } finally { await admin.end(); }
    await rm(folder,{recursive:true,force:true});
  });
  await migrate(pool);
  await mkdir(directory);
  await writeFile(join(folder,'empty'),'');
  const env={
    PATH:process.env.PATH, SystemRoot:process.env.SystemRoot, HOME:folder,
    GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:join(folder,'empty'), GIT_TERMINAL_PROMPT:'0',
  };
  const git=async (...args:string[])=>(await execute('git',
    ['-c','core.hooksPath='+join(folder,'no-hooks'),'-c','user.name=Fixture','-c','user.email=fixture@invalid',...args],
    {cwd:directory,env,windowsHide:true,timeout:10000})).stdout.trim();
  const remote='https://github.com/franckl136/fjstudio.git';
  await git('init','--template=','-b','main');
  await writeFile(join(directory,'note.md'),'fixture\n');
  await git('add','note.md');
  await git('commit','-m','synthetic');
  const head=await git('rev-parse','HEAD');
  await git('remote','add','origin',remote);
  process.env.STUDIO_GIT_REPOSITORIES=JSON.stringify([{project:'b',key:'fixture',directory,remote}]);
  const registry=new Repositories(pool);
  const core=new Core(pool);
  const historical=await core.createMission(owner,'b','nominal','before');
  await assert.rejects(registry.register(owner,'b','fjstudio'),denied);
  await assert.rejects(registry.register(foreign,'b','fixture'),denied);
  assert.equal((await registry.register(owner,'b','fixture')).target?.remote_url,remote);

  // This synthetic executable only records whether the source filesystem monitor was invoked.
  // Git for Windows runs hook scripts through its own sh, also available on Unix Git hosts.
  const marker=join(directory,'.git','monitor-invoked');
  const monitor=join(directory,'monitor.sh');
  await writeFile(monitor,'#!/bin/sh\nprintf called > .git/monitor-invoked\nexit 1\n',{mode:0o700});
  await git('config','core.fsmonitor',monitor);
  await git('config','core.hooksPath',join(directory,'hooks'));
  await writeFile(join(directory,'note.md'),'fixture changed\n');
  const originalIndex=await readFile(join(directory,'.git','index'));
  const first=await registry.observe(owner,'b','local');
  assert.equal(first.local_commit,head);
  assert.equal(first.branch,'main');
  assert.equal(first.remote_state,null);
  assert.equal(first.worktree.unstaged,1);
  assert.equal(first.worktree.untracked,1);
  assert.deepEqual(await readFile(join(directory,'.git','index')),originalIndex);
  await assert.rejects(readFile(marker),{code:'ENOENT'});

  const mission=await core.createMission(owner,'b','nominal','pinned');
  const read=async(id:string)=>transaction(pool,client=>readMissionRepository(client,'b',id),true);
  assert.equal(await read(historical.id),null);
  assert.equal((await read(mission.id))?.observation_id,first.id);
  const second=await registry.observe(owner,'b','local');
  assert.notEqual(second.id,first.id);
  assert.equal((await read(mission.id))?.observation_id,first.id);
  assert.equal((await registry.state(foreign,'a')).observations.length,0);
  await assert.rejects(registry.state(foreign,'b'),denied);
  await assert.rejects(registry.observe(owner,'b','fetch','../main'),{code:'git_branch'});
  await git('remote','set-url','origin','https://example.invalid/other.git');
  await assert.rejects(registry.observe(owner,'b','fetch','main'),{code:'repository_configuration'});
  assert.equal((await registry.state(owner,'b')).observations.length,2);
});
