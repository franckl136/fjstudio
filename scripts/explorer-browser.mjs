import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {existsSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {createPool} from '../src/config.ts';
import {Core,migrate} from '../src/core.ts';
import {createServer} from '../src/http.ts';

const url=new URL(process.env.DATABASE_URL);
assert.equal(url.pathname,'/fjstudio_a1');
const maintenance=createPool(url.href),name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
let pool,server,browser,created=false;
try {
  await maintenance.query('CREATE DATABASE '+name+' TEMPLATE template0');created=true;
  url.pathname='/'+name;pool=createPool(url.href);await migrate(pool);
  const operator={kind:'operator',id:'atelier-erd',projectIds:['a'],token:randomBytes(32).toString('base64url')};
  server=createServer(new Core(pool),[operator],undefined,false);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  const exe=process.env.STUDIO_QA_BROWSER||[join(process.env.ProgramFiles??'C:/Program Files','Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')].find(existsSync);
  browser=await chromium.launch({executablePath:exe,headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900},locale:'fr-FR'});
  page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const login=await page.request.post(base+'/login',{form:{token:operator.token},headers:{Origin:base},maxRedirects:0});
  assert.equal(login.status(),303);await page.goto(base+'/projects/a/database');
  await page.getByText('Importer un schéma de projet',{exact:true}).click();
  await page.getByLabel('Nom de la source').fill('Atelier de recette');
  await page.getByLabel('Définition du schéma').fill('CREATE TABLE clients (id integer PRIMARY KEY); CREATE TABLE commandes (id integer PRIMARY KEY, client_id int REFERENCES clients(id)); ALTER TABLE commandes ENABLE ROW LEVEL SECURITY; CREATE POLICY lecture ON commandes FOR SELECT USING (true);');
  await page.getByRole('button',{name:'Importer la structure'}).click();
  await page.getByRole('link',{name:'public.commandes',exact:true}).click();
  await page.getByRole('heading',{name:'Contraintes et relations sortantes'}).waitFor();
  await page.getByRole('link',{name:'Ouvrir le voisinage relationnel'}).click();
  const canvas=page.locator('canvas');await canvas.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{const c=document.querySelector('canvas');return c?.clientWidth>300&&c.width===Math.round(c.getBoundingClientRect().width*devicePixelRatio);});
  const hash=()=>canvas.evaluate(c=>c.toDataURL());
  const image0=await hash();await page.getByRole('button',{name:'Agrandir le diagramme'}).click();
  assert.notEqual(await hash(),image0);
  await page.getByLabel('Rechercher une table').fill('commandes');assert.notEqual(await hash(),image0);
  await page.getByLabel('Rechercher une table').fill('');
  await page.getByRole('button',{name:'Recentrer'}).click();
  const position=()=>canvas.evaluate(c=>{
    const r=c.getBoundingClientRect(),ctx=c.getContext('2d'),pixels=ctx.getImageData(0,0,c.width,c.height).data;
    for(let y=0;y<c.height;y+=2)for(let x=0;x<c.width;x+=2){
      const k=(c.width*y+x)*4;
      if(pixels[k]===33&&pixels[k+1]===74&&pixels[k+2]===59)return {x:r.left+(x+12)*r.width/c.width,y:r.top+(y+7)*r.height/c.height};
    }
    return null;
  });
  const node=await position();assert(node);const initial=await hash();
  await page.mouse.move(node.x,node.y);await page.mouse.down();await page.mouse.move(node.x+40,node.y+36);await page.mouse.up();
  assert.notEqual(await hash(),initial);
  const box=await canvas.boundingBox(),before=await hash();
  await page.mouse.move(box.x+12,box.y+12);await page.mouse.down();await page.mouse.move(box.x+90,box.y+32);await page.mouse.up();
  assert.notEqual(await hash(),before);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Exporter la vue PNG'}).click()]);assert.equal(download.suggestedFilename(),'studio-relations.png');
  await page.getByRole('link',{name:'Sécurité et RLS'}).click();await page.getByText('lecture',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Diagramme relationnel'}).click();await canvas.scrollIntoViewIfNeeded();
  const folder=await mkdtemp(join(tmpdir(),'fjstudio-erd-'));
  await canvas.screenshot({path:join(folder,'erd-desktop.png')});
  await page.setViewportSize({width:390,height:844});await canvas.scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await canvas.screenshot({path:join(folder,'erd-mobile.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',browser:browser.version(),forms:true,table:true,rls:true,zoom:true,search:true,pan:true,dragNode:true,png:true,viewports:['1366x900','390x844'],captures:folder}));
}finally{
  await browser?.close();if(server)await new Promise(r=>server.close(r));await pool?.end();
  if(created)await maintenance.query('DROP DATABASE '+name);await maintenance.end();
}
