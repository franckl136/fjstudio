import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after,before,test } from 'node:test';
import type { Pool } from 'pg';
import { createPool } from '../src/config.ts';
import { Core,migrate } from '../src/core.ts';
import { transaction } from '../src/database.ts';
import { activityFilter,activityItem,activityPreview,activityResults,readActivity } from '../src/activity.ts';
import { readWorkspace } from '../src/product-workspace.ts';
import { workspacePage } from '../src/product-workspace-views.ts';
import { composeDatabaseUrl } from '../scripts/postgres-tools.ts';

const operator={id:'recette-journal',projectIds:['a'],accountRole:'operator' as const};
let manager:Pool, pool:Pool, created='';
before(async()=>{
  const url=composeDatabaseUrl();
  assert.equal(url.pathname,'/fjstudio_a1');
  manager=createPool(url.href);
  const name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  await manager.query('CREATE DATABASE '+name+' TEMPLATE template0');
  created=name;url.pathname='/'+name;pool=createPool(url.href);
  await migrate(pool);
  await pool.query(`INSERT INTO project_repositories(project_id,repository_key,remote_url,registered_by)
    VALUES ('a','recette-a','','test'),('b','recette-b','','test')`);
  await pool.query(`INSERT INTO repository_observations(id,project_id,repository_key,observed_at,observed_by,operation,local_commit,branch,worktree)
    SELECT gen_random_uuid(),p,'recette-'||p,now()-make_interval(mins=>n),'test','local',repeat('a',40),'main','{}'
    FROM generate_series(1,23) n CROSS JOIN (VALUES ('a'),('b')) AS projects(p)`);
  await pool.query(`INSERT INTO project_profile_history(project_id,revision,actor,at,profile) VALUES
    ('a',1,'test',now()-interval '2 days','{"name":"Révision de recette"}')`);
  await pool.query(`INSERT INTO studio_backup_checks(id,performed_at,outcome,detail)
    VALUES(gen_random_uuid(),now()-interval '3 days','failed','Exemple isolé')`);
});
after(async()=>{
  try {await pool?.end();if(created)await manager.query('DROP DATABASE '+created);}
  finally {await manager?.end();}
});
test('Journal · comptage et pages cohérents, liens historiques uniques, filtres conservés et isolation',async()=>{
  const params=new URLSearchParams({project:'a',type:'git',days:'1'});
  const read=(page:number)=>readActivity(pool,operator,'a',{...activityFilter(params),page});
  const pages=await Promise.all([read(1),read(2),read(3),read(87)]);
  assert.deepEqual(pages.map(p=>[p.total,p.page,p.pages,p.events.length,p.more]),
    [[23,1,3,10,true],[23,2,3,10,true],[23,3,3,3,false],[23,3,3,3,false]]);
  const hrefs=pages.slice(0,3).flatMap(p=>p.events.map(e=>e.href));
  assert.equal(new Set(hrefs).size,23);
  assert(hrefs.every(h=>h.startsWith('/projects/a/repository?observation=')));
  const projects=[{id:'a',name:'Atelier A'}];
  const first=pages[0].events[0];
  const item=activityItem(first,projects);
  const [card,details]=item.split('<details>');
  assert.match(card,/^<li><a href="[^"]+"><strong>Relevé Git actualisé<\/strong><\/a> · <a href="\/projects\/a">Atelier A/);
  assert.match(card,/<time datetime="/);
  assert.doesNotMatch(card.replaceAll(/href="[^"]+"/g,''),/main|aaaaaa|test|[a-f0-9]{8}-/);
  assert.match(details,/<summary>Détails techniques<\/summary>/);
  for(const value of ['test','main',first.href.split('=').pop(),'a'.repeat(40)])assert(details.includes('<dd>'+value+'</dd>'));
  const preview=await transaction(pool,c=>activityPreview(c,operator,'a'),true);
  assert.equal(activityItem(preview.find(e=>e.family==='git')!,projects),item);
  const html=activityResults(pages[1],projects,params);
  assert(html.indexOf('Pagination en haut')<html.indexOf('class="event-feed"'));
  assert.match(html,/Résultats 11 à 20 sur 23 · Page 2 sur 3/);
  assert.match(html,/project=a&amp;type=git&amp;days=1&amp;page=3/);
  assert.match(html,/Pagination en bas/);
  await assert.rejects(readActivity(pool,operator,'b',activityFilter(params)),{status:404});
  const empty=await readActivity(pool,operator,undefined,activityFilter(new URLSearchParams('type=backup')));
  assert.deepEqual([empty.total,empty.pages,empty.events.length],[0,0,0]);
  const emptyHtml=activityResults(empty,[],new URLSearchParams());
  assert.match(emptyHtml,/0 résultat/);assert.doesNotMatch(emptyHtml,/Page 1 sur 0/);
  assert.throws(()=>activityFilter(new URLSearchParams('page=-1')),{status:400});
});
test('Accueil · un incident prime sur les relevés répétitifs et seuls les comptes habilités le voient',async()=>{
  const admin={...operator,accountRole:'admin' as const};
  const global=await transaction(pool,c=>activityPreview(c,admin),true);
  assert.equal(global[0].kind,'failed');
  assert.equal(global.filter(e=>e.family==='git').length,1);
  assert(global.every(e=>e.project_id!=='b'));
  const scoped=await transaction(pool,c=>activityPreview(c,admin,'a'),true);
  assert(scoped.every(e=>e.family!=='backup'));
  const visible=await transaction(pool,c=>activityPreview(c,operator),true);
  assert(visible.every(e=>e.family!=='backup'));
  const adminLogs=await readActivity(pool,admin,undefined,activityFilter(new URLSearchParams('type=backup')));
  assert.equal(adminLogs.total,1);
  const core=new Core(pool);
  for(let n=1;n<=6;n++){
    await core.knowledge.propose(operator,'a',{kind:'decision',origin:'human',scope:'reference',title:'Élément '+n,
      content:'Exercice de classement du journal.',reference:''});
  }
  const top=await transaction(pool,c=>activityPreview(c,admin),true);
  assert.equal(top.length,5);
  assert.equal(top[0].kind,'failed');
  assert(top.slice(1).every(item=>item.kind==='knowledge_proposed'));
});

test('Journal · la provenance de chaque passage Lab accompagne son résultat',async()=>{
  await pool.query(`INSERT INTO product_lab_runs(id,project_id,command_key,source_key,entry_path,commit_sha,source_digest,source_html,inventory,
    profile,profile_version,trigger_kind,actor_id)
    SELECT gen_random_uuid(),'a',gen_random_uuid(),k,'recette.html',repeat('b',40),encode(sha256('synthetic'::bytea),'hex'),
    'synthetic'::bytea,'{}','structure','essai','manual','test' FROM unnest(ARRAY['studio-sample','studio-types','atelier']) AS k`);
  const data=await readActivity(pool,operator,'a',activityFilter(new URLSearchParams('type=quality')));
  assert.equal(data.total,3);
  assert.equal(data.events.filter(item=>item.source.includes('Exemple synthétique')).length,2);
  assert.equal(data.events.filter(item=>item.source.includes('Source autorisée du projet')).length,1);

  const inspect = async(key:string,verdict:string) => {
    await pool.query(`UPDATE product_lab_runs SET created_at=now(),finished_at=now(),state='finished',verdict=$2,result='{}',result_sha=repeat('a',64)
      WHERE source_key=$1`,[key,verdict]);
    const overview=await readWorkspace(pool,operator,[],'a');
    assert.equal(overview.labs[0].source_key,key);
    return workspacePage(overview,operator,'a',[],new URLSearchParams());
  };
  const demo=await inspect('studio-types','FAIL');
  assert.match(demo,/FAIL<\/a><small>Exemple synthétique du Studio/);
  assert.match(demo,/Exemple synthétique du Studio<\/a><\/li>/);
  assert.match(demo,/Dernier passage sur exemple/);
  assert.doesNotMatch(demo,/Dernier contrôle à examiner/);
  const project=await inspect('atelier','PASS');
  assert.match(project,/PASS<\/a><small>Source autorisée du projet/);
  assert.match(project,/Dernier contrôle réussi/);
});
