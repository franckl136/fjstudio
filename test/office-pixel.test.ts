import test from 'node:test';
import assert from 'node:assert/strict';
import type { Desk } from '../src/product-workspace.ts';
import { officeScene } from '../src/office-scene.ts';

function person(id:string,state:Desk['state'],task?:string):Desk {
  const role=state==='verifying'?'verifier':'preparer';
  const started=new Date('2026-01-01T00:00:00Z');
  return {id,role,state,projectId:'demo',configured:true,lastSeen:started,running:task?1:0,records:task?[{
    id:'attempt',project_id:'demo',runner_id:id,role,mission_id:'mission',task,began:started,finished:null,
    state:'running',live:true,engine:'control',objective:'Recette du loft',
  }]:[]};
}
test('Loft · quatre pièces issues des baux, aucun personnage hors ligne, un seul plateau conserve tous les agents connectés',()=>{
  const data={projects:[{id:'demo',name:'Démo & atelier'}],agents:[
    person('prepare','working','structure'),person('review','verifying','coverage'),person('finish','verifying','synthesis'),
    person('disconnected','offline'),person('never-seen','unseen'),...Array.from({length:5},(_,i)=>person('idle-'+i,'available')),
  ]};
  const render=(query:string)=>officeScene(data,d=>'/station/'+d.id,new URLSearchParams(query));
  const first=render('project=demo');
  for(const [id,role,room] of [['prepare','preparer','desks'],['review','verifier','control'],['finish','verifier','meeting'],['idle-0','preparer','coffee']]) {
    assert.match(first,new RegExp('data-member="demo/'+id+'/'+role+'"\\s+data-area="'+room+'"'));
  }
  assert.doesNotMatch(first,/demo\/(disconnected|never-seen)\//);
  assert.match(first,/data-member="demo\/idle-4\/preparer"/);
  assert.equal((first.match(/data-floor-art/g)??[]).length,1);
  const focus=render('project=demo&salle=cafe&groupe=2');
  assert.match(focus,/data-focus="coffee"/);
  assert.match(focus,/liste=1#postes-locaux/);
  assert.doesNotMatch(focus,/groupe=|Atelier classique/);
  assert.match(render('rendu=classique'),/data-floor-art/);
});

test('Cursor place une session par projet au café et garde les PR fusionnées en historique',()=>{
  const pull={project_id:'demo',repository:'owner/demo',pr_number:9,agent_id:'bc-demo',title:'Mission',
    branch:'cursor/demo',state:'draft' as const,observed_at:new Date()};
  const cursorSessions=[pull,{...pull,pr_number:10},{...pull,agent_id:'bc-old',state:'merged' as const}];
  const html=officeScene({agents:[],projects:[],cursorSessions},()=>'',new URLSearchParams());
  assert.equal(html.split('data-member="cursor/demo/bc-demo"').length-1,1);
  assert.match(html,/data-count="coffee">1</);
  assert.match(html,/data-count="desks">0</);
  assert.doesNotMatch(html,/bc-old/);
});
