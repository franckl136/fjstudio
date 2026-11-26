import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { composeDatabaseUrl } from './postgres-tools.ts';
import { createPool } from '../src/config.ts';
import { Core, migrate } from '../src/core.ts';
import { createServer } from '../src/http.ts';
import { HumanAccess, totp } from '../src/product-auth.ts';
import { humanCookie } from '../src/product-auth-routes.ts';

const url=composeDatabaseUrl();
assert.equal(url.port,'55453','Utiliser PostgreSQL de recette du Studio sur le port 55453.');
assert.equal(url.pathname,'/fjstudio_a1');
const name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
const maintenance=createPool(url.href), key=randomBytes(32);
const temp=await realpath(tmpdir());
const captures=await mkdtemp(join(temp,'fjstudio-recette-saisies-'));
const profile=await mkdtemp(join(temp,'fjstudio-draft-browser-'));
const principal={id:'operator-local',kind:'operator',token:randomUUID(),projectIds:['a','b']};
let db,server,context,page,origin,created=false;
// Both modes run on this script's private HTTP server and disposable database.
delete process.env.STUDIO_LOCAL_DRAFTS;
async function openBrowser(){
  context=await chromium.launchPersistentContext(profile,{channel:process.platform==='win32'?'chrome':undefined,executablePath:process.env.STUDIO_QA_BROWSER,
    headless:true,locale:'fr-FR',viewport:{width:1440,height:900}});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(5000);
}
async function authenticate(session) {
  await context.addCookies([{name:humanCookie,value:session,url:origin,expires:Math.floor(Date.now()/1000)+300,httpOnly:true,sameSite:'Strict'}]);
}
const pageA=()=>page.goto(origin+'/projects/a/control');
const switchProject=project=>page.locator('.sidebar a[data-project-id="'+project+'"]').click();
const status=(p=page)=>p.locator('[data-draft-status]');
const field=(name,p=page)=>p.locator('form[data-form-guard] [name="'+name+'"]');
async function saved(p=page){await p.waitForFunction(()=>document.querySelector('[data-draft-status]')?.textContent==='Enregistré sur cet appareil.');}
async function resume(p=page){
  await p.getByRole('button',{name:'Reprendre',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('[data-draft-status]').textContent.startsWith('Brouillon récupéré.'));
}
async function checkGuardOnly(){
  // Storage is deliberately unavailable throughout this page, including initialization.
  await page.addInitScript(()=>{
    Object.defineProperty(window,'indexedDB',{get(){throw Error('Stockage refusé pour la recette.');}});
  });
  await pageA();await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('script[src="/form-assets/drafts.js"]').count(),0);
  const disabledKey=await page.request.post(origin+'/projects/a/draft-access/mission-new',{headers:{Origin:origin},data:{account:'admin-local'}});
  assert.equal(disabledKey.status(),404);
  await switchProject('b');await page.waitForURL('**/projects/b/control');
  await switchProject('a');await field('objective').fill('Une saisie gardée en mémoire');
  const dialog=page.getByRole('dialog');
  for(const selector of ['a[data-project-id="b"]','.nav-desktop a[href="/projects/a/quality"]','.project-home']){
    const link=page.locator(selector).first();
    await link.click();await dialog.waitFor();
    assert.equal(await dialog.getByRole('button').count(),2);
    if(selector.includes('data-project-id'))await page.screenshot({path:join(captures,'F02-protection-des-champs.png')});
    await dialog.getByRole('button',{name:'Rester sur le formulaire'}).click();
    assert.equal(new URL(page.url()).pathname,'/projects/a/control');
    assert.equal(await field('objective').inputValue(),'Une saisie gardée en mémoire');
  }
  await page.locator('.project-home').first().click();await dialog.getByRole('button',{name:'Abandonner et quitter'}).click();
  await page.waitForURL('**/projects/a');await pageA();assert.equal(await field('objective').inputValue(),'');
  await field('objective').fill('Saisie corrigée');await field('objective').fill('');
  await switchProject('b');await page.waitForURL('**/projects/b/control');
  await pageA();await field('objective').fill('Envoi refusé');await field('scope').fill('Exercice');
  await field('document').fill('Texte');await field('criteria').fill('Texte');
  await page.route(origin+'/projects/a/control',route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'text/plain',body:'Indisponible'}):route.continue());
  await page.getByRole('button',{name:'Créer la mission en brouillon',exact:true}).click();
  await page.getByText('Mission non confirmée.',{exact:false}).waitFor();
  await page.unroute(origin+'/projects/a/control');
  assert.equal(await field('objective').inputValue(),'Envoi refusé');
  await switchProject('b');await dialog.getByRole('button',{name:'Abandonner et quitter'}).click();await page.waitForURL('**/projects/b/control');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM control_missions')).rows[0].n,0);
  console.log('F02 · garde par défaut, stockage inaccessible, formulaire intact, modification annulée, rester, abandonner, projet, espace, page et échec d’envoi vérifiés.');
}
async function measureMissionList() {
  const measurements=[];
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport);await pageA();await page.waitForLoadState('networkidle');
    const positions=await page.evaluate(()=>{
      const y=selector=>Math.round(document.querySelector(selector).getBoundingClientRect().top+scrollY);
      return {section:y('#missions'),premiereMission:y('#missions .mission-list li'),statut:y('#missions .mission-list .badge'),formulaire:y('#brief')};
    });
    assert(positions.premiereMission<positions.formulaire&&positions.statut<viewport.height);
    assert(await page.locator('#missions .mission-list .badge').first().isVisible());
    await page.screenshot({path:join(captures,'F07-missions-'+viewport.width+'.png')});
    measurements.push({viewport,...positions});
  }
  await page.setViewportSize({width:1440,height:900});
  console.log('F07 · hauteurs depuis le haut de la page, en px',JSON.stringify(measurements));
}
async function enroll(access,id,role){
  const invite=await access.invite({id:'admin-local',accountRole:'admin',projectIds:['a','b']},id,role,['a']);
  const started=await access.begin(invite);
  const bits=Array.from(started.secret,c=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0')).join('');
  const seed=Buffer.from(bits.match(/.{8}/g).map(x=>parseInt(x,2)));
  return access.finish(started.ticket,randomUUID(),totp(seed,Math.floor(Date.now()/30000)));
}
try{
  await maintenance.query('CREATE DATABASE '+name+' TEMPLATE template0');created=true;
  url.pathname='/'+name;db=createPool(url.href);await migrate(db);
  const access=new HumanAccess(db,key,true);
  const start=await access.begin(principal.token,principal);
  const adminPassword=randomUUID();
  const admin=await access.finish(start.ticket,adminPassword,'');
  const second=await enroll(access,'essai-auteur','operator'),reader=await enroll(access,'essai-lecteur','viewer');
  server=createServer(new Core(db),[principal],key,true);
  server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
  await openBrowser();await authenticate(admin);await checkGuardOnly();
  await context.close();context=undefined;
  process.env.STUDIO_LOCAL_DRAFTS='1';await openBrowser();await authenticate(admin);await pageA();
  await switchProject('b');assert.match(page.url(),/\/b\/control$/);await switchProject('a');
  await field('objective').fill('Objectif synthétique privé');
  await field('scope').fill('Reprise de saisie locale');
  await page.getByLabel('Finalité du dossier').selectOption('audit');
  await field('standard').fill('Référence synthétique conservée');
  await page.getByLabel('Finalité du dossier').selectOption('research');
  await field('sources').fill('Source synthétique');await field('document').fill('# Dossier\npreuve');await field('criteria').fill('preuve');
  await saved();
  await switchProject('b');await page.getByRole('button',{name:'Rester sur le formulaire'}).click();
  assert.equal(await field('objective').inputValue(),'Objectif synthétique privé');
  await switchProject('b');await page.getByRole('button',{name:'Enregistrer et continuer'}).click();await page.waitForURL('**/projects/b/control');
  assert.equal(await field('objective').inputValue(),'');
  assert.equal(await page.getByRole('button',{name:'Reprendre',exact:true}).count(),0);
  await switchProject('a');await resume();assert.equal(await field('sources').inputValue(),'Source synthétique');

  await context.close();context=undefined;await openBrowser();await pageA();
  await resume();assert.equal(await field('objective').inputValue(),'Objectif synthétique privé');
  await page.getByLabel('Finalité du dossier').selectOption('audit');
  assert.equal(await field('standard').inputValue(),'Référence synthétique conservée');await saved();
  const sealed=await page.evaluate(async()=>{
    const database=await new Promise(r=>{const q=indexedDB.open('fjstudio-device-drafts-v1');q.onsuccess=()=>r(q.result);});
    const rows=await new Promise(r=>{const q=database.transaction('drafts').objectStore('drafts').getAll();q.onsuccess=()=>r(q.result);});
    return rows.every(row=>row.sealed instanceof ArrayBuffer && Object.keys(row).sort().join() === 'id,iv,revision,scope,sealed,time'
      && !new TextDecoder().decode(row.sealed).includes('Objectif synthétique'));
  });
  assert(sealed);
  await page.getByRole('button',{name:'Déconnexion'}).click();await page.getByRole('button',{name:'Enregistrer et continuer'}).click();await page.waitForURL(url=>!url.pathname.endsWith('/control'));
  await authenticate(second);await pageA();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('button',{name:'Reprendre',exact:true}).count(),0);
  const cross=await page.request.post(origin+'/projects/a/draft-access/mission-new',{headers:{Origin:origin},data:{account:'admin-local'}});
  assert.equal(cross.status(),403);
  await field('objective').fill('Deuxième compte');await saved();
  await authenticate(reader);await pageA();
  assert.equal(await page.locator('form[data-draft-access]').count(),0);
  assert.equal((await page.request.post(origin+'/projects/a/draft-access/mission-new',{headers:{Origin:origin},data:{account:'essai-lecteur'}})).status(),403);
  await authenticate(await access.login('admin-local',adminPassword,''));await pageA();await resume();assert.equal(await field('objective').inputValue(),'Objectif synthétique privé');
  const other=await context.newPage();await other.goto(origin+'/projects/a/control');await resume(other);
  await field('objective').fill('Version fenêtre principale');await saved();
  await field('objective',other).fill('Version seconde fenêtre');
  await other.getByRole('button',{name:'Conserver une copie séparée'}).click();await saved(other);
  await other.close();await pageA();
  await page.waitForFunction(()=>document.querySelectorAll('[data-draft-list] .actions').length===2);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM control_missions')).rows[0].n,0);
  const list=page.locator('[data-draft-list]');
  for(let i=0;i<2;i++){
    page.once('dialog',dialog=>dialog.accept());
    await list.getByRole('button',{name:'Abandonner',exact:true}).first().click();
    await page.waitForFunction(n=>document.querySelectorAll('[data-draft-list] .actions').length===n,1-i);
  }
  await page.reload();await page.waitForLoadState('networkidle');assert.equal(await list.getByRole('button').count(),0);
  await page.evaluate(()=>{
    const write=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){if(this.name==='drafts'){this.transaction.abort();return;}return write.apply(this,args);};
  });
  await field('objective').fill('Saisie protégée pendant la panne');
  await page.waitForFunction(()=>document.querySelector('[data-draft-status]').textContent.startsWith('Échec'));
  await switchProject('b');await page.getByRole('button',{name:'Rester sur le formulaire'}).click();
  assert.equal(await field('objective').inputValue(),'Saisie protégée pendant la panne');
  await switchProject('b');await page.getByRole('button',{name:'Enregistrer et continuer'}).click();
  await page.getByText('Opération impossible.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Abandonner et quitter'}).click();await page.waitForURL('**/projects/b/control');
  await pageA();
  await field('objective').fill('Mission volontaire');await field('scope').fill('Dossier synthétique');
  await field('document').fill('# Pièce\npreuve locale');await field('criteria').fill('preuve');await saved();
  await page.getByRole('button',{name:'Créer la mission en brouillon',exact:true}).click();await page.waitForURL(/\/control\/[a-f0-9-]{36}$/);
  const detail=page.url();
  assert.equal((await db.query('SELECT count(*)::int AS n FROM control_missions')).rows[0].n,1);
  await pageA();await page.waitForLoadState('networkidle');assert.equal(await list.getByRole('button').count(),0);
  await page.goto(detail);await page.getByText('Modifier le périmètre',{exact:true}).click();
  await field('scope').fill('Révision conservée');await saved();await pageA();await page.waitForLoadState('networkidle');
  assert.equal(await list.getByRole('button').count(),0);
  await page.goto(detail);await page.getByText('Modifier le périmètre',{exact:true}).click();
  await resume();assert.equal(await field('scope').inputValue(),'Révision conservée');
  await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.getByRole('button',{name:'Enregistrer la révision'}).click()]);
  const changed=(await db.query('SELECT scope FROM control_missions')).rows;assert.equal(changed[0].scope,'Révision conservée');
  delete process.env.STUDIO_LOCAL_DRAFTS;
  await measureMissionList();
  console.log('Captures de la recette',captures);
  console.log('Brouillons · Chromium fermé et relancé sur le même profil, champs multi-finalités, création/révision, compte, projet, lecteur, conflits, abandon, panne IndexedDB, garde, soumission explicite, isolation et chiffrement vérifiés.');
}finally{
  if(context)await context.close();
  if(server?.listening){const stopped=once(server,'close');server.close();server.closeAllConnections();await stopped;}
  if(db)await db.end();
  try{if(created)await maintenance.query('DROP DATABASE '+name);}finally{await maintenance.end();}
  if(dirname(await realpath(profile))===temp)await rm(profile,{recursive:true,force:true});
}
