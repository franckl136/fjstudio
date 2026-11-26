import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { createPool } from '../src/config.ts';
import { Core,migrate } from '../src/core.ts';
import { createServer } from '../src/http.ts';
import { commandMission,controlDetail } from '../src/control-room.ts';
import { projectTeams,startProjectTeams } from '../src/project-team.ts';
import { projectTeamBrief } from '../src/project-team-brief.ts';

test('Binôme projet · passation et contrôle négatif sur un relevé figé, travailleur isolé et preuves',async()=>{
  const url=new URL(process.env.DATABASE_URL!);
  const admin=createPool(url.href),name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  await admin.query('CREATE DATABASE '+name+' TEMPLATE template0');url.pathname='/'+name;
  const pool=createPool(url.href), actor={id:'recette',projectIds:['atelier']};
  const stop=new AbortController();
  let work:Promise<unknown>|undefined,server:ReturnType<typeof createServer>|undefined;
  try {
    await migrate(pool);
    await pool.query("INSERT INTO projects(id,name,context) VALUES('atelier','Atelier','{}')");
    await pool.query("INSERT INTO project_repositories(project_id,repository_key,remote_url,registered_by) VALUES ('atelier','disk-atelier','','recette'),('a','fixture','','recette')");
    const shot=randomUUID();
    await pool.query(`INSERT INTO repository_observations(id,project_id,repository_key,observed_at,observed_by,operation,local_commit,branch,worktree)
      VALUES($1,'atelier','disk-atelier',now(),'recette','local',repeat('a',40),'main','{"staged":1,"unstaged":0,"untracked":0}')`,[shot]);
    const pair=await projectTeams(pool,'a,atelier');
    assert.deepEqual(pair.map(p=>p.projectId),['atelier','atelier']);
    assert.equal(new Set(pair.map(p=>p.token)).size,2);
    const owner={kind:'operator' as const,id:'recette-admin',token:randomBytes(32).toString('base64url'),projectIds:['a','atelier']};
    server=createServer(new Core(pool),[...pair,owner],undefined,false,['a','b']);
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
    const read=async(path:string)=>(await fetch(base+path,{headers:{authorization:'Bearer '+owner.token}})).json();
    assert.deepEqual((await read('/api/projects')).projects.map((p:{id:string})=>p.id),['atelier']);
    assert.deepEqual((await read('/api/workspace/archives')).projects.map((p:{id:string})=>p.id),['a']);
    assert.equal((await read('/api/projects/a')).project.id,'a');
    const denied=await fetch(base+'/api/runner/claim',{method:'POST',headers:{authorization:'Bearer '+pair[0].token,'content-type':'application/json'},body:'{}'});
    assert.equal(denied.status,403);
    const missions=[];
    for(const kind of ['handoff','clean']){
      const key=randomUUID(),m=await projectTeamBrief(pool,actor,'atelier',shot,kind,key);
      assert.equal((await projectTeamBrief(pool,actor,'atelier',shot,kind,key)).id,m.id);
      await commandMission(pool,actor,'atelier',m.id,'plan',randomUUID(),1);
      missions.push(m.id);
    }
    await assert.rejects(projectTeamBrief(pool,actor,'a',shot,'handoff',randomUUID()),{status:404});
    await assert.rejects(projectTeamBrief(pool,{...actor,accountRole:'viewer'},'atelier',shot,'handoff',randomUUID()),{status:403});
    work=startProjectTeams(pair,base,stop.signal);
    for(let i=0;i<120;i++) {
      const count=await pool.query("SELECT id FROM control_missions WHERE id=ANY($1::uuid[]) AND status IN ('completed','failed')",[missions]);
      if(count.rowCount===2) break;
      await delay(180);
    }
    for(const [i,id] of missions.entries()){
      const d=await controlDetail(pool,actor,'atelier',id);
      assert.equal(d.mission.status,i===0?'completed':'failed');
      assert.deepEqual(d.tasks.map(t=>t.state),['completed','completed','completed']);
      assert.equal(d.tasks[2].result.verdict,i===0?'PASS':'FAIL');
      assert.deepEqual(new Set(d.attempts.map(a=>a.runner_id)),new Set(pair.map(p=>p.id)));
    }
  } finally {
    stop.abort();await work;
    if(server) {server.closeAllConnections();await new Promise<void>(done=>server!.close(()=>done()));}
    await pool.end();try{await admin.query('DROP DATABASE '+name);}finally{await admin.end();}
  }
});
