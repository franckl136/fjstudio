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
test('Loft · quatre pièces issues des baux, aucun personnage hors ligne, pagination par pièce',()=>{
  const data={projects:[{id:'demo',name:'Démo & atelier'}],agents:[
    person('prepare','working','structure'),person('review','verifying','coverage'),person('finish','verifying','synthesis'),
    person('disconnected','offline'),person('never-seen','unseen'),...Array.from({length:5},(_,i)=>person('idle-'+i,'available')),
  ]};
  const render=(query:string)=>officeScene(data,d=>'/station/'+d.id,new URLSearchParams(query));
  const first=render('project=demo');
  for(const [id,role,room] of [['prepare','preparer','desks'],['review','verifier','control'],['finish','verifier','meeting'],['idle-0','preparer','coffee']]) {
    assert.match(first,new RegExp('data-member="demo/'+id+'/'+role+'"\\s+data-area="'+room+'"'));
  }
  assert.doesNotMatch(first,/demo\/(disconnected|never-seen|idle-4)\//);
  assert.match(first,/Groupe 1 \/ 2/);
  const second=render('project=demo&salle=cafe&groupe=2');
  assert.match(second,/data-focus="coffee"/);assert.match(second,/data-member="demo\/idle-4\/preparer"/);
  assert.doesNotMatch(second,/demo\/idle-0\/preparer/);
  assert.match(second,/liste=1#postes-locaux/);
  assert.match(render('rendu=classique'),/Voir le loft pixel/);
});
