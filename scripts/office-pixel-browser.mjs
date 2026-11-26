import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { chromium } from 'playwright-core';
import { officeScene } from '../src/office-scene.ts';

// Deterministic display checks, deliberately independent of the separate PostgreSQL + runner browser suite.
const address='http://127.0.0.1:9099';
const output=await mkdtemp(join(tmpdir(),'fjstudio-pixel-office-'));
const browser=await chromium.launch({channel:process.platform==='win32'?'chrome':undefined,executablePath:process.env.STUDIO_QA_BROWSER,headless:true});
async function probe(width,height,mode='atlas') {
  const context=await browser.newContext({viewport:{width,height},javaScriptEnabled:mode!=='sans-js',reducedMotion:width===390?'reduce':'no-preference'});
  let active=false,quick=false,finishedAt=0;
  const count=width===1366?18:2;
  const people=Array.from({length:count},(_,i)=>({id:'agent-'+i,projectId:'demo',role:i%2?'verifier':'preparer',records:[],state:'available'}));
  const data={projects:[{id:'demo',name:'Atelier de recette'}],agents:people};
  try {
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==address)return route.abort();
      if(url.pathname==='/office'){
        people[0].state=active?'working':'available';
        people[0].records=active?[{id:'example',task:'structure',role:'preparer',live:true}]:
          quick?[{id:'short',task:'synthesis',role:'preparer',live:false,finished:new Date(finishedAt)}]:[];
        const scene=officeScene(data,d=>'/office?station='+d.id+'#poste',url.searchParams);
        return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><main>'+scene+'<div class="office-plan" data-follow="on"></div><div id="office-live"></div><div id="office-reading"></div><div class="office-supervision"></div><section id="poste">Fiche</section><script defer src="/office-assets/live.js"></script></main></html>'});
      }
      if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
      if(url.pathname==='/office-assets/pixel-atlas.webp'&&mode==='sans-atlas')return route.abort();
      const file=url.pathname==='/style.css'?'../src/style.css':'../src/office/'+basename(url.pathname);
      const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.webp')?'image/webp':'text/css';
      return route.fulfill({contentType:mime,body:await readFile(new URL(file,import.meta.url))});
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(address+'/office?rendu=classique');
    const art=page.locator('[data-floor-art]'),first=page.locator('.loft-people [data-member="demo/agent-0/preparer"]');
    assert.equal(await page.getByText('Atelier classique').count(),0);
    assert.equal(await page.locator('.loft-people .pixel-person').count(),count);
    if(mode!=='sans-js')await page.locator('[data-texture="'+(mode==='sans-atlas'?'geometry':'atlas')+'"]').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(mode==='atlas'){
      await page.locator('.pixel-campus').screenshot({path:join(output,'plan-'+width+'.png')});
      await first.evaluate(el=>{window.firstResident=el;});
      await page.getByRole('link',{name:/^Café/}).click();
      assert.equal(await page.locator('.pixel-loft').getAttribute('data-focus'),'coffee');
      await page.locator('.pixel-campus').screenshot({path:join(output,'cafe-'+width+'.png')});
      await page.goBack();
      assert.equal(await page.locator('.pixel-loft').getAttribute('data-focus'),'plan');
      const start=await first.evaluate(el=>el.style.left);
      active=true;
      await page.waitForFunction(()=>window.firstResident.dataset.area==='desks');
      if(width===1366){
        await first.evaluate(el=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert.equal(await first.evaluate(el=>el.hasAttribute('data-walking')),true);
      }
      await page.waitForFunction(()=>!window.firstResident.hasAttribute('data-walking') && window.firstResident.dataset.area==='desks');
      assert.notEqual(await first.evaluate(el=>el.style.left),start);
      active=false;
      await page.waitForFunction(()=>window.firstResident.dataset.area==='coffee' && !window.firstResident.hasAttribute('data-walking'));
      assert.equal(await first.evaluate(el=>el===window.firstResident),true);
      if(width===1366){
        finishedAt=Date.now();quick=true;
        await page.waitForFunction(()=>window.firstResident.hasAttribute('data-trace'));
        await page.waitForFunction(()=>!window.firstResident.hasAttribute('data-walking') && !window.firstResident.hasAttribute('data-trace'));
      }
      assert.equal(await art.count(),1);
    }
    await first.click();
    assert.match(page.url(),/station=agent-0#poste/);
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
}
try {
  await probe(1366,900);await probe(390,844);await probe(900,700,'sans-atlas');await probe(390,844,'sans-js');
  console.log('Loft · plateau commun, 18 agents, déplacements et missions rapides, zoom et navigation, réduction des animations, secours sans atlas et sans JavaScript, largeurs 390 et 1366. Captures : '+output);
} finally { await browser.close(); }
