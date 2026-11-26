import assert from 'node:assert/strict';

export async function checkAcademy(operator,viewer,origin) {
  await operator.goto(origin+'/academy');
  assert.equal(await operator.locator('h1').innerText(),'Studio Academy');
  await operator.getByRole('link',{name:'Découvrir Studio',exact:true}).click();
  await operator.getByRole('button',{name:'Commencer l’exercice'}).click();
  await operator.getByLabel('App Lab',{exact:true}).check();
  await operator.getByRole('button',{name:'Valider ma réponse'}).click();
  await operator.getByRole('alert').waitFor();
  await operator.getByLabel('Command Center',{exact:true}).check();
  await operator.getByRole('button',{name:'Valider ma réponse'}).click();
  await operator.locator('#preuve').waitFor();
  await operator.reload();
  assert.equal(await operator.locator('#preuve h2').innerText(),'Compétence validée');
  await operator.goto(origin+'/academy/projets');
  await operator.getByRole('button',{name:'Commencer l’exercice'}).click();
  await operator.getByLabel('Atelier Papier',{exact:true}).check();
  await operator.getByRole('button',{name:'Valider ma réponse'}).click();
  assert.match(await operator.locator('#preuve').innerText(),/Atelier Papier/);
  await operator.goto(origin+'/academy/mission');
  await operator.getByRole('button',{name:'Commencer l’exercice'}).click();
  await operator.getByLabel('Objectif du brief').selectOption('controle');
  await operator.getByLabel('Le lot ambre est vérifié.',{exact:true}).check();
  await operator.getByRole('button',{name:'Valider ma réponse'}).click();
  await operator.goto(origin+'/academy');
  assert.match(await operator.locator('#carnet').innerText(),/Contrôler le dossier du lot ambre · Brouillon/);
  await operator.goto(origin+'/academy/relations');
  assert.match(await operator.locator('#exercice').innerText(),/travaux\.atelier_id → ateliers\.id/);
  await viewer.goto(origin+'/academy/projets');
  assert.equal(await viewer.locator('#preuve').count(),0);
  assert.equal(await viewer.getByRole('button',{name:'Commencer l’exercice'}).count(),0);
  assert(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await viewer.goto(origin+'/academy?q=bail#aide');
  assert(await viewer.locator('#aide').getByRole('link',{name:'Lire le bail du runner'}).count());
  for(const [guide,expected] of [['/mission','/espaces/control'],['/mission?project=a','/projects/a/control'],['/donnees','/database'],['/donnees?project=a','/projects/a/database'],['/pilotage?project=a','/workspace?project=a#attention']]){
    await viewer.goto(origin+'/academy'+guide);
    assert.equal(await viewer.getByRole('link',{name:'Consulter cet espace du Studio'}).getAttribute('href'),expected);
  }
  await viewer.goto(origin+'/academy?project=a&q=Command%20Center#aide');
  await viewer.locator('#aide').getByRole('link',{name:'Command Center et Agent Office',exact:true}).first().click();
  assert.equal(new URL(viewer.url()).searchParams.get('project'),'a');
  await viewer.getByRole('link',{name:'Revue des changements',exact:true}).click();
  assert.equal(new URL(viewer.url()).pathname,'/academy/docs/review');
  assert.equal(new URL(viewer.url()).searchParams.get('project'),'a');
  assert.equal(await viewer.getByRole('link',{name:'Recherche documentaire',exact:false}).getAttribute('href'),'/academy?project=a#aide');
  return {moduleScope:true,documentScope:true,wrongAnswer:true,resume:true,practicalProject:true,foreignKey:true,privateProgress:true,readOnlyMobile:true};
}
