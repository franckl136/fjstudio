// Run against the local Compose service. All application reads and writes use a newly created test database.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeDatabaseUrl } from './postgres-tools.ts';
import { createPool } from '../src/config.ts';
import { Core, migrate } from '../src/core.ts';
import { createServer } from '../src/http.ts';
import { totp } from '../src/product-auth.ts';
import { executeControl } from '../src/control-room-adapters.ts';
import { runControlOnce } from '../src/control-room-worker.ts';
import { runProductLabTick } from '../src/product-lab.ts';
import { runOnce } from '../src/runner.ts';

const {chromium} = createRequire(import.meta.url)(process.env.STUDIO_QA_PLAYWRIGHT || 'playwright-core');
const url = composeDatabaseUrl();
assert.equal(url.pathname,'/fjstudio_a1');
const name = 'fjstudio_a1_test_' + randomUUID().replaceAll('-','');
const directory = await mkdtemp(join(tmpdir(),'fjstudio-product-browser-'));
const results = {};
const start = performance.now();
const token = () => randomBytes(32).toString('base64url');
const principal = {id:'operator-local',token:token(),kind:'operator',projectIds:['a','b']};
const prep = {id:'atelier-index',token:token(),kind:'runner',projectId:'a',role:'preparer'};
const verify = {id:'atelier-relecture',token:token(),kind:'runner',projectId:'a',role:'verifier'};
const maintenance = createPool(url.href);
let pool, server, browser, created = false;
let origin;
function seedBytes(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = Array.from(value,letter => {
    assert(alphabet.includes(letter),'Invalid synthetic enrollment');
    return alphabet.indexOf(letter).toString(2).padStart(5,'0');
  }).join('');
  return Buffer.from(bits.match(/.{8}/g).map(byte=>parseInt(byte,2)));
}
async function submit(page,button) {
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),button.click()]);
}
async function enroll(page,invitation,id) {
  await page.goto(origin);
  await page.getByText('Activer un compte local',{exact:true}).click();
  await page.keyboard.press('Tab');
  const activation = page.getByLabel('Code d’activation', {exact:true});
  const focusClearsLabel = await activation.evaluate(input => {
    const labelText = document.createRange();
    labelText.selectNodeContents(input.labels[0].firstChild);
    const style = getComputedStyle(input);
    const outside = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
    return input.matches(':focus-visible') && parseFloat(style.outlineWidth) > 0 &&
      input.getBoundingClientRect().top - outside > labelText.getBoundingClientRect().bottom;
  });
  assert(focusClearsLabel, 'Le contour de focus du champ d’activation doit laisser le libellé lisible.');
  await activation.fill(invitation);
  await submit(page,page.getByRole('button',{name:'Commencer l’activation'}));
  assert.equal(await page.locator('h1').innerText(),'Activer '+id);
  const seed = seedBytes(await page.locator('main code').innerText());
  const password = token();
  await page.locator('[name=password]').fill(password);
  await page.locator('[name=otp]').fill(totp(seed,Math.floor(Date.now()/30000)-1));
  await submit(page,page.getByRole('button',{name:'Activer et se connecter'}));
  assert.equal(await page.locator('h1').innerText(),'Command Center');
  await submit(page,page.getByRole('button',{name:'Déconnexion'}));
  await page.locator('[name=id]').fill(id);
  await page.locator('[name=password]').fill(password);
  await page.locator('[name=otp]').fill(totp(seed,Math.floor(Date.now()/30000)));
  await submit(page,page.getByRole('button',{name:'Se connecter'}));
  assert.equal(await page.locator('h1').innerText(),'Command Center');
}
async function invite(page,id,role) {
  await page.goto(origin+'/people');
  const form = page.locator('form[action="/people/invite"]');
  await form.locator('[name=id]').fill(id);
  await form.locator('[name=role]').selectOption(role);
  await form.locator('[name=projects]').fill('a');
  await submit(page,form.getByRole('button'));
  assert.equal(await page.locator('h1').innerText(),'Invitation créée');
  return page.locator('main code').innerText();
}
async function screen(page,file) {
  await page.screenshot({path:join(directory,file+'.png'),animations:'disabled'});
  const size = await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
  assert(size.document <= size.width,'Horizontal overflow on '+file);
}
async function runnerPost(identity,action,body) {
  const response = await fetch(origin+'/api/runner/control/'+action,{
    method:'POST',redirect:'error',headers:{authorization:'Bearer '+identity.token,'content-type':'application/json'},body:JSON.stringify(body)
  });
  assert(response.ok,'Runner '+action+' · HTTP '+response.status);
  return (await response.text()) || '{}';
}
async function lab(page,module) {
  await page.goto(origin+'/projects/a/'+module);
  const button = page.getByRole('button',{name:module === 'lab' ? 'Préparer la preview' : 'Lancer la qualification'});
  await submit(page,button);
  assert.match(new URL(page.url()).pathname,new RegExp('/projects/a/'+module+'/[a-f0-9-]{36}$'));
  await runProductLabTick(pool);
  await page.reload();
  const verdict = await page.locator('header.heading .badge').innerText();
  assert.equal(verdict,'PASS',module+' verdict');
  if (module==='lab') {
    const capture = page.locator('img.lab-capture');
    await capture.waitFor();
    const size = await capture.evaluate(async img=>{ await img.decode();return [img.naturalWidth,img.naturalHeight]; });
    assert.deepEqual(size,[960,600]);
  }
  return verdict;
}
try {
  await maintenance.query('CREATE DATABASE '+name+' TEMPLATE template0');
  created = true;
  url.pathname = '/'+name;
  pool = createPool(url.href);
  await migrate(pool);
  server = createServer(new Core(pool),[principal,prep,verify],randomBytes(32));
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  origin = 'http://127.0.0.1:'+server.address().port;
  const installed = process.platform === 'win32' ? [
    join(process.env.ProgramFiles ?? 'C:\\Program Files','Google','Chrome','Application','chrome.exe'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)','Microsoft','Edge','Application','msedge.exe'),
  ].find(existsSync) : undefined;
  browser = await chromium.launch({executablePath:process.env.STUDIO_QA_BROWSER || installed,headless:true});
  async function pageFor(viewport) {
    const context = await browser.newContext({viewport,locale:'fr-FR',reducedMotion:'reduce'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    return page;
  }
  const admin = await pageFor({width:1366,height:900});
  const operator = await pageFor({width:1366,height:900});
  const viewer = await pageFor({width:390,height:844});
  await enroll(admin,principal.token,'admin-local');
  const opCode = await invite(admin,'navigateur-op','operator');
  const readerCode = await invite(admin,'navigateur-lecture','viewer');
  await enroll(operator,opCode,'navigateur-op');
  await enroll(viewer,readerCode,'navigateur-lecture');
  results.authenticated = ['admin','operator','viewer'];
  await admin.goto(origin+'/workspace');
  await admin.getByRole('link',{name:'Créer un projet'}).click();
  await admin.locator('[name=id]').fill('atelier-navigateur');
  await admin.locator('[name=name]').fill('Atelier navigateur');
  await admin.locator('[name=mainBranch]').fill('main');
  await submit(admin,admin.getByRole('button',{name:'Créer le projet'}));
  assert.equal(new URL(admin.url()).pathname,'/projects/atelier-navigateur/settings');
  assert.equal((await viewer.goto(origin+'/projects/atelier-navigateur/settings')).status(),404);
  assert.equal((await operator.goto(origin+'/projects/b/control')).status(),404);
  assert.equal((await viewer.goto(origin+'/projects/new')).status(),403);
  await operator.goto(origin+'/workspace');
  await operator.locator('nav.sidebar').getByRole('link',{name:'Project Intelligence'}).click();
  assert.equal(new URL(operator.url()).pathname,'/projects/a/knowledge');
  const knowledge=operator.locator('form.stack[action="/projects/a/knowledge"]');
  await knowledge.locator('[name=title]').fill('Règle du catalogue');
  await knowledge.locator('[name=content]').fill('Le dossier catalogue doit posséder un titre pour la revue.');
  await knowledge.locator('[name=reference]').fill('Recette locale synthétique');
  await knowledge.locator('[name=scope]').selectOption('control');
  await submit(operator,knowledge.getByRole('button'));
  const notePath=new URL(operator.url()).pathname;
  await operator.locator('form [name=confirm]').check();
  await submit(operator,operator.getByRole('button',{name:'Valider',exact:true}));
  await viewer.goto(origin+'/projects/a/knowledge');
  assert.equal(await viewer.locator('main form[method=post]').count(),0);
  await viewer.goto(origin+notePath);
  assert.equal(await viewer.locator('main form[method=post]').count(),0);
  await operator.locator('nav.sidebar').getByRole('link',{name:'Agent Control Room'}).click();
  const form = operator.locator('form[action="/projects/a/control"]');
  for (const [field,value] of Object.entries({
    objective:'Qualifier le dossier catalogue',scope:'Catalogue synthétique de l’atelier',
    document:'# Catalogue\nUne revue est prévue pour le catalogue.',criteria:'catalogue',constraints:'Synthétique, local.',
  })) await form.locator('[name='+field+']').fill(value);
  await form.locator('[name=risk]').selectOption('review');
  await submit(operator,form.getByRole('button'));
  const missionPath = new URL(operator.url()).pathname;
  assert.match(missionPath,/^\/projects\/a\/control\/[a-f\d-]{36}$/);
  await submit(operator,operator.getByRole('button',{name:'Valider le plan'}));
  await admin.goto(origin+'/workspace');
  await admin.locator('.alert-feed').getByRole('link',{name:'Qualifier le dossier catalogue'}).click();
  const approve = admin.locator('form[action$="/approve"]');
  await approve.locator('[name=confirm]').check();
  await submit(admin,approve.getByRole('button'));
  assert(await admin.getByRole('link',{name:'Règle du catalogue'}).count());
  results.knowledge='validated revision included in mission';
  const assignments = await Promise.all([prep,verify].map(async runner => JSON.parse(await runnerPost(runner,'claim',{})).assignment));
  assert(assignments.every(Boolean),'Two live worker leases required');
  await operator.goto(origin+'/office?project=a&follow=1');
  assert.equal(await operator.locator('.office-station.occupied').count(),2);
  await screen(operator,'office-desktop');
  await operator.locator('.office-station[data-state=working]').click();
  assert((await operator.locator('section#poste a').allTextContents()).includes('Qualifier le dossier catalogue'));
  await Promise.all(assignments.map(async(a,index)=>{
    const runner = [prep,verify][index];
    const claim = {attemptId:a.attemptId,generation:a.generation};
    await runnerPost(runner,'heartbeat',claim);
    await runnerPost(runner,'complete',{...claim,result:executeControl(a)});
  }));
  assert(await runControlOnce(origin,verify.token));
  await operator.goto(origin+missionPath);
  assert.equal(await operator.locator('.heading .badge').innerText(),'Terminée');
  assert.equal(await operator.getByText('Checkpoint et SHA-256',{exact:true}).count(),3);
  const paused = await operator.goto(origin+'/office?project=a&follow=1');
  assert.equal(paused.headers().refresh,undefined);
  assert.equal(await operator.locator('.office-station.occupied').count(),0);
  results.mission = {state:'completed',parallelAgents:2,checkpoints:3,followPaused:true};
  results.quality = await lab(operator,'quality');
  results.preview = await lab(operator,'lab');
  await admin.goto(origin+'/projects/a');
  await admin.getByRole('link',{name:'Revue des changements Git'}).click();
  await submit(admin,admin.getByRole('button',{name:'Capturer les changements'}));
  assert.equal(await admin.locator('h1').innerText(),'Revue du commit');
  const reviewPath=new URL(admin.url()).pathname;
  const vote=admin.locator('form[action$="/decision"]');
  await vote.locator('[name=decision]').selectOption('approved');
  await vote.locator('[name=confirm]').check();
  await submit(admin,vote.getByRole('button'));
  assert.match(await admin.locator('main ul.history').innerText(),/Approuvée · admin-local/);
  await viewer.goto(origin+reviewPath);
  assert.equal(await viewer.locator('form[action$="/decision"]').count(),0);
  results.gitReview='approved by synthetic admin, read by viewer';
  await viewer.goto(origin+'/projects/a');
  assert.equal(await viewer.locator('main form[method=post]').count(),0);
  for (const fixture of ['nominal','incorrect']) {
    await operator.goto(origin+'/projects/a');
    const launch=operator.locator('form[action="/projects/a/missions"]');
    await launch.locator('[name=fixtureId]').selectOption(fixture);
    await submit(operator,launch.getByRole('button'));
    const pathA1=new URL(operator.url()).pathname;
    await viewer.goto(origin+pathA1);
    assert.equal(await viewer.locator('main form[method=post]').count(),0);
    for(const runner of [prep,verify]) assert(await runOnce({baseUrl:origin,token:runner.token}));
    await viewer.reload();
    const verdict=await viewer.locator('section.verdict strong').first().innerText();
    assert.equal(verdict,fixture==='nominal'?'Contrôles réussis':'Contrôle négatif');
    assert.equal(await viewer.locator('.step details').count(),2);
    results['a1_'+fixture]=verdict;
  }
  await operator.goto(origin+'/workspace');
  assert.equal(await operator.locator('.summary-strip strong').first().innerText(),'1');
  await screen(operator,'command-center-desktop');
  await viewer.goto(origin+'/workspace');
  assert.equal(await viewer.getByRole('link',{name:'Créer un projet'}).count(),0);
  const api = await viewer.context().request.post(origin+'/api/projects/a/settings',{
    headers:{origin},data:{},
  });
  assert.equal(api.status(),403);
  await screen(viewer,'command-center-mobile');
  await viewer.goto(origin+'/office?project=a');
  await screen(viewer,'office-mobile');
  results.isolation = {differentProject:404,viewerMutation:403};
  results.viewports = ['1366×900','390×844'];
  results.browser = browser.version();
  results.durationMs = Math.round(performance.now()-start);
  await writeFile(join(directory,'result.json'),JSON.stringify(results,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({directory,...results},null,2));
} finally {
  try { if (browser) await browser.close(); }
  finally {
    if (server?.listening) {
      const closed = once(server,'close');
      server.close();
      server.closeAllConnections();
      await closed;
    }
    if (pool) await pool.end();
    try { if (created) await maintenance.query('DROP DATABASE '+name); } finally { await maintenance.end(); }
  }
}
