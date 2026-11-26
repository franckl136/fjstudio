import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { runControlOnce } from '../src/control-room-worker.ts';

if(!process.send) throw new Error('Le binôme est démarré par le Studio.');
const stop=new AbortController();
process.once('disconnect',()=>stop.abort());
const [{origin,tokens}]=await once(process,'message') as [{origin:string;tokens:string[]}];
async function work(token:string) {
  while(!stop.signal.aborted) {
    let wait=4000;
    try { if(await runControlOnce(origin,token,stop.signal)) continue; }
    catch { wait=6000; }
    await delay(wait,undefined,{signal:stop.signal}).catch(()=>{});
  }
}
await Promise.all(tokens.map(work));
