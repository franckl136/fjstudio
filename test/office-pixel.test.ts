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

test('Les sessions Cursor restent dans le répertoire et les liens de PR sont groupés par projet et session',()=>{
  const pull={project_id:'demo',repository:'owner/demo',pr_number:9,agent_id:'bc-demo',title:'Mission',
    branch:'cursor/demo',state:'draft' as const,observed_at:new Date()};
  const cursorSessions=[pull,{...pull,pr_number:10},{...pull,agent_id:'bc-old',state:'merged' as const}];
  const html=officeScene({agents:[],projects:[],cursorSessions},()=>'',new URLSearchParams());
  assert.doesNotMatch(html,/data-member="cursor/);
  assert.match(html,/data-count="coffee">0</);
  assert.match(html,/data-metric="historical">1</);
  assert.match(html,/data-metric="unknown">1</);
  assert.equal(html.split('data-provider="Cursor"').length-1,2);
  assert.match(html,/pull\/10/);
});

test('Le bureau accueille les sessions Codex avec signal récent, les tours terminés et inconnus restent traçables',()=>{
  const codex=[
    {id:'one',project:'demo',name:'Zelf',state:'working' as const},
    {id:'two',project:'demo',name:'Zelf',state:'finished' as const},
    {id:'three',project:'demo',name:'<Agent>',state:'recent' as const},
  ];
  const html=officeScene({agents:[],projects:[]},()=>'',new URLSearchParams(),codex);
  assert.equal((html.match(/data-member="codex\//g)??[]).length,1);
  assert.match(html,/data-metric="connected">0</);
  assert.match(html,/data-metric="busy">0</);
  assert.match(html,/data-metric="paused">Non renseigné</);
  assert.match(html,/data-count="desks">1</);
  assert.match(html,/&lt;Agent&gt;/);
});

test('Un bail encore valide sur un contact expiré reste consultable hors scène',()=>{
  const lost={...person('lost','working','structure'),contactFresh:false};
  const live={...person('ready','available'),contactFresh:true};
  const html=officeScene({agents:[lost,live],projects:[]},d=>'/office?station='+d.id+'#poste',new URLSearchParams('salle=cafe'));
  assert.match(html,/data-metric="connected">1</);
  assert.match(html,/data-metric="busy">1</);
  assert.match(html,/data-metric="offline">1</);
  assert.match(html,/data-count="coffee">1</);
  assert.doesNotMatch(html,/data-member="demo\/lost/);
  assert.match(html,/Bail en cours · contact expiré/);
  assert.match(html,/data-ambient-count>0</);
  assert.match(html,/href="\/projects\/demo\/control\/mission"/);
  assert.match(html,/href="\/office\?station=lost#poste"/);
});
