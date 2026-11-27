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
