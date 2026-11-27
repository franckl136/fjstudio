import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observedState } from '../src/codex-office.ts';

test('Codex Office distinguishes recent work, completed turns and stale signals',()=>{
  const now=Date.now();
  const event=(type:string,age=0)=>JSON.stringify({type:'event_msg',timestamp:new Date(now-age),payload:{type}});
  assert.equal(observedState([event('task_started')],now),'working');
  assert.equal(observedState([event('task_started'),event('task_complete'),'partial'],now),'finished');
  assert.equal(observedState([event('turn_aborted')],now),'finished');
  assert.equal(observedState([event('item_completed',100000)],now),'recent');
  assert.equal(observedState([],now),'recent');
});

test('Fin de tour conservée après télémétrie, date future et source indisponible restent inconnues',()=>{
  const now=Date.now();
  const event=(type:string,at=now)=>JSON.stringify({type:'event_msg',payload:{type},timestamp:new Date(at)});
  assert.equal(observedState([event('task_complete'),event('token_count')],now),'finished');
  assert.equal(observedState([event('task_started',now+30000)],now),'recent');
  assert.equal(observedState(['broken JSON'],now),'recent');
  assert.equal(observedState([event('task_started',now-90000)],now),'recent');
});

test('Le lecteur local borne les projets, les dates et le répertoire des journaux',async t=>{
  const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');
  const {join}=await import('node:path');
  const {tmpdir}=await import('node:os');
  const {DatabaseSync}=await import('node:sqlite');
  const {readCodexAgents}=await import('../src/codex-office.ts');
  const home=await mkdtemp(join(tmpdir(),'office-codex-test-'));
  t.after(()=>rm(home,{recursive:true,force:true}));
  const sessions=join(home,'sessions'),project=join(home,'repo');
  await mkdir(sessions);
  const now=Date.now(),iso=new Date(now).toISOString();
  const body=JSON.stringify({type:'event_msg',timestamp:iso,payload:{type:'task_started'}});
  const journal=join(sessions,'demo.jsonl'),outside=join(home,'outside.jsonl');
  await Promise.all([writeFile(journal,body),writeFile(outside,body)]);
  const db=new DatabaseSync(join(home,'state_5.sqlite'));
  try {
    db.exec('CREATE TABLE threads(id TEXT,agent_nickname TEXT,rollout_path TEXT,cwd TEXT,archived INTEGER,updated_at INTEGER)');
    const insert=db.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?)'),seconds=Math.floor(now/1000);
    for(const [i,dir,path,archived,age] of [
      [1,project,journal,0,0],[2,project,outside,0,0],[3,project,journal,1,0],
      [4,join(home,'different'),journal,0,0],[5,project,journal,0,90000],
    ] as const)insert.run('00000000-0000-0000-0000-00000000000'+i,'Demo '+i,path,dir,archived,seconds-age);
  } finally {db.close();}
  const people=readCodexAgents(home,project,'demo',now);
  assert.equal(people.length,2);
  assert.equal(people.find(a=>a.name==='Demo 1')?.observedAt,iso);
  assert.equal(people.find(a=>a.name==='Demo 1')?.state,'working');
  assert.equal(people.find(a=>a.name==='Demo 2')?.state,'recent');
  assert.equal(readCodexAgents(home,project,'demo',now+91000).find(a=>a.name==='Demo 1')?.state,'recent');
});
