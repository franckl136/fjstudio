import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=resolve(process.env.STUDIO_QA_SOURCE||root);
const output=resolve(process.env.STUDIO_QA_OUTPUT||join(root,'docs/agent-office/captures'));
const {officePage,stationUrl}=await import(pathToFileURL(join(source,'src/product-workspace-views.ts')));
const {officeScene}=await import(pathToFileURL(join(source,'src/office-scene.ts')));
const url='http://127.0.0.1:9099';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.platform==='win32'?'chrome':undefined,executablePath:process.env.STUDIO_QA_BROWSER,headless:true});
const now=new Date();
const project={id:'atelier-demo',name:'Atelier de recette'};
function desk(id,state='available',task=null,role='preparer'){
  const record={project_id:project.id,runner_id:id,role,mission_id:'mission-reliure',id:'etape-'+id,task,
    began:new Date(+now-60000),finished:null,state:'running',live:true,engine:'control',objective:'Relier le carnet de l’atelier'};
  return {id,projectId:project.id,role,state,engine:'control',contactFresh:state==='unseen'?undefined:state!=='offline',records:task?[record]:[],configured:true,running:task?1:0,lastSeen:new Date(state==='offline'?+now-600000:+now)};
}
function sample(count){
  const agents=[desk('Nora'),desk('Milo','working','structure'),desk('Alix','verifying','coverage','verifier'),desk('Iris','working','synthesis')];
  for(let n=agents.length;n<count;n++)agents.push(desk('Atelier-'+n));
  agents.push(desk('Léon','offline'),{...desk('Romy','unseen'),lastSeen:null});
  const cursor={project_id:project.id,repository:'atelier/recette',agent_id:'bc-00000000-0000-4000-8000-000000000001',pr_number:3,title:'Assembler la reliure',branch:'cursor/reliure',state:'draft',observed_at:now};
  return {projects:[project],agents,cursorSessions:[cursor,{...cursor,pr_number:2,state:'merged'}],alerts:[],capturedAt:now,follows:[]};
}
const codex=[{id:'00000000-0000-4000-a000-000000000001',name:'Vega',state:'finished',project:project.id}];
async function open(width,height,count=4,opts={}){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:opts.reduced?'reduce':'no-preference',locale:'fr-FR',timezoneId:'Europe/Paris',...opts.context});
  const data=sample(count),requests=[],errors=[];
  await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    requests.push({path:u.pathname,method:req.method(),origin:u.origin});
    if(u.origin!==url || req.method()!=='GET')return route.abort();
    if(u.pathname==='/office'){
      const query=u.searchParams,body=query.get('loft')==='1'?officeScene(data,d=>stationUrl(d,true,project.id),query,codex):officePage(data,query,project.id,data.projects,codex);
      return route.fulfill({contentType:'text/html; charset=utf-8',body});
    }
    const file=u.pathname==='/style.css'?'style.css':u.pathname==='/navigation-assets/groups.js'?'project-groups.js':
      u.pathname.startsWith('/office-assets/')?'office/'+basename(u.pathname):null;
    if(!file)return route.fulfill({status:404,body:'Recette locale'});
    const types={'.js':'text/javascript','.webp':'image/webp','.png':'image/png','.css':'text/css'};
    try{return await route.fulfill({contentType:types[extname(file)],body:await readFile(join(source,'src',file))});}
    catch{return route.fulfill({status:404,body:'Ressource absente'});}
  });
  const page=await context.newPage();
  page.on('pageerror',err=>errors.push(err.stack||err.message));page.setDefaultTimeout(8000);
  const start=performance.now();
  await page.goto(url+'/office?project='+project.id+(opts.follow===false?'&follow=0':''));
  await page.locator('[data-texture=atlas][data-walls=illustrated]').waitFor();
  const ready=performance.now()-start;
  return {context,page,data,ready,requests,errors};
}
async function picture(page,name){
  await page.screenshot({path:join(output,name+'.jpg'),type:'jpeg',quality:90});
}
async function inspect({page,errors,requests}){
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(r=>r.method==='GET' && r.origin===url),'Seules les lectures de la fixture sont autorisées');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Débordement horizontal');
}
async function showRoom(page,room){
  const tab=page.locator('[data-camera="'+room+'"]');
  await tab.click();
  assert.equal(await tab.getAttribute('aria-current'),'page');
  assert.equal(await page.locator('#loft').getAttribute('data-focus'),room);
}
async function sceneCapture(page,name){
  await page.locator('.room-tabs').evaluate(el=>el.scrollIntoView({block:'start'}));
  await picture(page,name);
}
async function desktop(){
  const probe=await open(1440,900);
  const {context,page,data}=probe;
  try{
    const people=page.locator('.loft-people .pixel-person');
    assert.equal(await people.count(),4);
    assert.equal(await people.filter({hasText:'Léon'}).count(),0);
    for(const [room,count] of [['desks',1],['coffee',1],['control',1],['meeting',1]]){
      assert.equal(await page.locator('[data-count="'+room+'"]').textContent(),String(count));
    }
    for(const [metric,value] of Object.entries({connected:'4',busy:'3',available:'1',paused:'Non renseigné',offline:'1',historical:'1',unknown:'2'})){
      assert.equal(await page.locator('[data-metric="'+metric+'"]').textContent(),value);
    }
    await page.locator('#loft').evaluate(el=>el.scrollIntoView({block:'start'}));
    await page.locator('#loft').screenshot({path:join(output,'01-plan.jpg'),type:'jpeg',quality:90});
    for(const [room,name] of [['desks','02-bureau'],['coffee','03-cafe'],['meeting','04-reunion'],['control','05-controle']]){
      await showRoom(page,room);await sceneCapture(page,name);
    }
    await showRoom(page,'desks');
    for(const seat of [0,1]){
      await page.locator('[data-station-room=desks][data-station-seat="'+seat+'"]').click();
      const inspector=page.locator('.station-inspection');
      await inspector.waitFor();
      if(seat===0)assert.ok(await inspector.getByRole('link',{name:/Milo/}).count());
      else assert.match(await inspector.textContent(),/Emplacement libre/);
      await inspector.getByRole('button',{name:'Fermer'}).click();
    }
    await showRoom(page,'plan');
    const actor=page.locator('.loft-people [data-member*="/Milo/"]');
    await actor.focus();await page.keyboard.press('Enter');
    const profile=page.locator('details[data-profile][open]').first();
    await profile.waitFor();
    await profile.evaluate(el=>el.scrollIntoView({block:'center'}));
    await picture(page,'06-fiche');
    const milo=page.locator('.loft-people [data-member*="/Milo/"]');
    await milo.focus();await page.keyboard.press('Enter');
    const miloProfile=page.locator('details[data-profile][open]').filter({hasText:'Milo'}).first();
    assert.ok(await miloProfile.getByRole('link',{name:/carnet de l’atelier/i}).count() || await miloProfile.locator('a[href*="/control/mission-reliure"]').count());
    assert.ok(await miloProfile.locator('a[href*="station=Milo"]').count());
    assert.ok(await miloProfile.locator('a[href="/projects/atelier-demo"]').count());
    const nora=page.locator('.loft-people [data-member*="/Nora/"]');
    await nora.evaluate(el=>window.firstResident=el);
    data.agents[0]=desk('Nora','working','structure');
    await page.waitForFunction(()=>window.firstResident.dataset.area==='desks');
    await page.waitForFunction(()=>window.firstResident.hasAttribute('data-walking'));
    await page.waitForFunction(()=>!window.firstResident.hasAttribute('data-walking'));
    assert.ok(await nora.evaluate(el=>el===window.firstResident));
    const counts=await page.locator('[data-metric]').allTextContents();
    await page.locator('[data-mode=ambient]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.loft-simulation [data-simulation]').length===4);
    assert.deepEqual(await page.locator('[data-metric]').allTextContents(),counts);
    assert.equal(await page.locator('[data-ambient-count]').textContent(),'4');
    assert.equal(await page.locator('.loft-simulation [data-pose=break]').count(),1);
    await page.locator('#loft').evaluate(el=>el.scrollIntoView({block:'start'}));
    await picture(page,'09-ambiance');
    const synthetic=page.locator('.loft-simulation [data-simulation]').first();
    const firstRoom=await synthetic.getAttribute('data-area');
    await page.waitForFunction(area=>document.querySelector('.loft-simulation [data-simulation]').dataset.area!==area,firstRoom,{timeout:16000});
    assert.deepEqual(await page.locator('[data-metric]').allTextContents(),counts);
    await page.locator('[data-mode=real]').click();
    assert.equal(await page.locator('.loft-simulation [data-simulation]:visible').count(),0);
    await page.locator('[data-provider-filter]').selectOption('Cursor');
    assert.equal(await page.locator('details[data-provider=Cursor]:visible').count(),1);
    assert.equal(await page.locator('details[data-provider=Studio]:visible').count(),0);
    await inspect(probe);
  } finally {await context.close();}
}
async function fullscreen(){
  const probe=await open(1920,1080),{context,page}=probe;
  try{
    await page.locator('.loft-expand').click();
    await page.waitForFunction(()=>document.fullscreenElement?.id==='loft');
    await picture(page,'07-plein-ecran');
    await page.locator('[data-zoom=in]').click();
    assert.equal(await page.locator('.camera-tools output').textContent(),'125 %');
    const campus=page.locator('.pixel-campus');
    await campus.focus();await campus.press('ArrowLeft');
    assert.notEqual(await page.locator('.pixel-floor').evaluate(el=>el.style.getPropertyValue('--scene-pan-x')),'0px');
    await page.locator('[data-zoom=reset]').click();
    assert.equal(await page.locator('.camera-tools output').textContent(),'100 %');
    await showRoom(page,'control');await showRoom(page,'plan');
    await page.locator('.loft-expand').click();
    await page.waitForFunction(()=>!document.fullscreenElement);await inspect(probe);
  } finally {await context.close();}
}
async function mobile(){
  const probe=await open(390,844,4,{reduced:true,context:{hasTouch:true}}),{context,page,data}=probe;
  try{
    await page.locator('[data-camera=desks]').tap();
    assert.equal(await page.locator('#loft').getAttribute('data-focus'),'desks');
    await sceneCapture(page,'08-mobile');
    const nora=page.locator('.loft-people [data-member*="/Nora/"]');
    data.agents[0]=desk('Nora','working','structure');
    await page.waitForFunction(()=>document.querySelector('[data-member*="/Nora/"]').dataset.area==='desks');
    assert.equal(await nora.getAttribute('data-walking'),null);
    await nora.tap();
    await page.locator('details[data-profile][open]').first().waitFor();
    await inspect(probe);
  } finally {await context.close();}
}
async function load(count){
  const probe=await open(1440,900,count),{context,page,data,ready,requests}=probe;
  try{
    const dev=await context.newCDPSession(page);
    await dev.send('Performance.enable');
    const task=async()=> (await dev.send('Performance.getMetrics')).metrics.find(m=>m.name==='TaskDuration').value;
    for(let i=0;i<data.agents.length;i++){
      const actor=data.agents[i];
      if(actor.state==='available')data.agents[i]=desk(actor.id,'working','structure');
    }
    await page.waitForFunction(()=>document.querySelector('.loft-people [data-walking]'));
    const start=performance.now(),before=await task();
    const values=await page.evaluate(()=>new Promise(resolve=>{
      let last=performance.now(),walkers=0;
      const deltas=[],start=last;
      function sample(t){
        deltas.push(t-last);last=t;
        walkers=Math.max(walkers,document.querySelectorAll('.loft-people [data-walking]').length);
        if(t-start<1500 || deltas.length<91){requestAnimationFrame(sample);return;}
        deltas.shift();deltas.sort((a,b)=>a-b);
        resolve({median:deltas[Math.floor(deltas.length/2)],p95:deltas[Math.floor(deltas.length*.95)],walkers,frames:deltas.length});
      }
      requestAnimationFrame(sample);
    }));
    const after=await task(),duration=performance.now()-start;
    // Blink headless does not occlude a tab when a second page is brought to front.
    // Trigger Page Visibility explicitly, then separately freeze the renderer via CDP.
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await delay(300);
    const calls=()=>requests.filter(r=>r.path==='/office').length;
    const startCalls=calls(),beforeHidden=await task();
    await delay(2200);
    const afterHidden=await task();
    assert.equal(calls(),startCalls,'Aucune lecture en arrière-plan simulé');
    assert.equal(await page.locator('[data-walking]').count(),0);
    await dev.send('Page.setWebLifecycleState',{state:'frozen'});
    await delay(1700);
    assert.equal(calls(),startCalls);
    await dev.send('Page.setWebLifecycleState',{state:'active'});
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>document.querySelector('#office-live')?.textContent.includes('direct'));
    await inspect(probe);
    return {count,readyMs:+ready.toFixed(1),peakWalking:values.walkers,medianFrameMs:+values.median.toFixed(2),p95FrameMs:+values.p95.toFixed(2),
      frameSample:values.frames,rendererBusyPct:+((after-before)*100000/duration).toFixed(1),hiddenTaskMs:+((afterHidden-beforeHidden)*1000).toFixed(1)};
  } finally{await context.close();}
}
try{
  if(process.argv.includes('--before')){
    const {context,page}=await open(1440,900);
    await page.locator('#loft').evaluate(el=>el.scrollIntoView({block:'start'}));
    await picture(page,'00-avant');await context.close();
  } else {
    if(!process.argv.includes('--load-only')){await desktop();await fullscreen();await mobile();}
    const rows=[];
    for(const count of [4,36,100])rows.push(await load(count));
    const results={browser:browser.version(),measuredAt:new Date().toISOString(),rows};
    await writeFile(join(output,'performance.json'),JSON.stringify(results,null,2)+'\n');
    console.log(results);
  }
} finally {await browser.close();}
