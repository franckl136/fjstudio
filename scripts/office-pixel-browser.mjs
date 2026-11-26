import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { chromium } from 'playwright-core';
import { officeScene } from '../src/office-scene.ts';

// Deterministic display checks, deliberately independent of the separate PostgreSQL + runner browser suite.
const address='http://127.0.0.1:9099';
const people=['scribe-demo','controle-demo'].map((id,i)=>({
  id,projectId:'demo',role:i?'verifier':'preparer',records:[],state:'available',configured:true,running:0,lastSeen:new Date(),
}));
const data={projects:[{id:'demo',name:'Atelier de recette'}],agents:people};
const output=await mkdtemp(join(tmpdir(),'fjstudio-pixel-office-'));
const browser=await chromium.launch({channel:process.platform==='win32'?'chrome':undefined,executablePath:process.env.STUDIO_QA_BROWSER,headless:true});
async function probe(width,height,mode='atlas') {
  const context=await browser.newContext({viewport:{width,height},javaScriptEnabled:mode!=='sans-js',reducedMotion:'reduce'});
  try {
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==address)return route.abort();
      if(url.pathname==='/office'){
        const scene=officeScene(data,d=>'/office?station='+d.id+'#poste',url.searchParams);
        return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><main>'+scene+'<section id="poste">Fiche</section></main></html>'});
      }
      if(url.pathname==='/office-assets/pixel-atlas.webp'&&mode==='sans-atlas')return route.abort();
      const file=url.pathname==='/style.css'?'../src/style.css':'../src/office/'+basename(url.pathname);
      const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.webp')?'image/webp':'text/css';
      return route.fulfill({contentType:mime,body:await readFile(new URL(file,import.meta.url))});
    });
    const page=await context.newPage();
    await page.goto(address+'/office?salle=cafe');
    const room=page.locator('[data-office-room=coffee]'),people=room.locator('.pixel-person');
    if(mode!=='sans-js')await room.locator('canvas[data-texture="'+(mode==='atlas'?'atlas':'geometry')+'"]').waitFor();
    assert.equal(await people.count(),2);
    assert.equal(await people.first().isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(mode==='atlas'){
      await room.screenshot({path:join(output,'cafe-'+width+'.png')});
      await page.reload();
      const rooms=[['bureau','desks'],['reunion','meeting'],['controle','control']];
      for(const [slug,key] of rooms) {
        await page.locator('.room-tabs a[href*="salle='+slug+'"]').click();
        const selected=page.locator('[data-office-room='+key+']');
        await selected.locator('canvas[data-texture=atlas]').waitFor();
        assert.equal(await page.locator('.pixel-room:visible').count(),1);
        assert.equal(await selected.locator('.pixel-person').count(),0);
      }
      await page.locator('.room-tabs a').first().click();
      await page.locator('.pixel-loft[data-focus=plan]').waitFor();
      assert.equal(await page.locator('.pixel-room:visible').count(),4);
      await page.locator('.pixel-campus').screenshot({path:join(output,'plan-'+width+'.png')});
      await page.getByRole('link',{name:'Atelier classique'}).click();
      await page.locator('.loft:not(.pixel-loft)').waitFor();
      assert.equal(await page.locator('.loft:not(.pixel-loft)').count(),1);
      await page.getByRole('link',{name:'Voir le loft pixel'}).click();
      await page.locator('.room-tabs a[href*="salle=cafe"]').click();
    }
    await people.first().click();
    assert.match(page.url(),/station=scribe-demo#poste/);
  } finally { await context.close(); }
}
try {
  await probe(1366,900);await probe(390,844);await probe(900,700,'sans-atlas');await probe(390,844,'sans-js');
  console.log('Loft · quatre salles et plan, postes cliquables, aller-retour classique, atlas local et secours sans atlas et sans JavaScript, largeurs 390 et 1366. Captures : '+output);
} finally { await browser.close(); }
