import assert from 'node:assert/strict';

export async function verifyWorkspaceNavigation(page,origin,screen){
  const sidebar=page.locator('nav.sidebar');
  const main=page.getByRole('main');
  const projects=['a','b','atelier-navigateur'];
  let mobileMeasures;
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===390?844:900});
    const mobile=width===390;
    async function project(id){
      if(mobile)await sidebar.locator('.nav-mobile details').first().locator('summary').click();
      await sidebar.locator(mobile?'[data-mobile-project="'+id+'"]':'[data-project-id="'+id+'"]').click();
    }
    async function space(name){
      if(mobile)await sidebar.locator('.nav-mobile details').last().locator('summary').click();
      await sidebar.getByRole('link',{name,exact:true}).click();
    }
    await page.goto(origin+'/workspace');
    await space('Agent Control Room');
    assert.equal(new URL(page.url()).pathname,'/espaces/control');
    assert.equal(await main.getByRole('heading',{name:'Choisir le projet à ouvrir'}).count(),1);
    for(const id of projects){
      await project(id);
      assert.equal(new URL(page.url()).pathname,'/projects/'+id+'/control');
      for(const [label,route] of [['Project Intelligence','/projects/'+id+'/knowledge'],['Quality Lab','/projects/'+id+'/quality'],['Database Explorer','/projects/'+id+'/database'],['App Lab','/projects/'+id+'/lab'],['Agent Office','/office?project='+id],['Studio Academy','/academy?project='+id],['Agent Control Room','/projects/'+id+'/control']]){
        await space(label);assert.equal(page.url(),origin+route);
      }
    }
    if(mobile)await sidebar.locator('.nav-mobile details').first().locator('summary').click();
    await sidebar.getByRole('link',{name:'Vue globale',exact:true}).click();
    assert.equal(new URL(page.url()).pathname,'/espaces/control');
    await space('Command Center');
    assert.equal(page.url(),origin+'/workspace');
    if(mobile){
      const dims=await page.locator('#portefeuille .table-wrap').evaluate(el=>[el.scrollWidth,el.clientWidth]);
      assert(dims[0]<=dims[1]+1,'Un projet doit tenir dans la largeur de lecture');
      const navWidths=await sidebar.evaluate(el=>[el.scrollWidth,el.clientWidth]);
      assert(navWidths[0]<=navWidths[1]+1);
      for (const i of [0,1]){
        const summary=sidebar.locator('.nav-mobile summary').nth(i);
        await summary.focus();await page.keyboard.press('Enter');
        assert(await summary.locator('..').evaluate(el=>el.open));
        await page.keyboard.press('Tab');
        assert(await summary.locator('..').evaluate(el=>el.contains(document.activeElement)&&document.activeElement.tagName==='A'));
        await summary.focus();await page.keyboard.press('Enter');
      }
      const card=page.locator('#portefeuille tbody tr').first();
      await card.locator('summary').focus();await page.keyboard.press('Enter');
      assert(await card.getByText('Dernier contrôle',{exact:true}).isVisible());
      await screen(page,'contre-audit-portefeuille-mobile');
      mobileMeasures={table:dims,menu:navWidths,keyboard:true};
    }
    for(const segment of ['quality','lab']){
      await page.goto(origin+'/projects/b/'+segment);
      const manual=page.locator('form[action="/projects/b/'+segment+'"]');
      const scope=manual.locator('output');
      assert.match(await scope.innerText(),/exemple synthétique du Studio.*fixtures\/product-lab\.html.*Commit [a-f0-9]{40}/);
      if(segment==='quality'){
        await manual.locator('select').selectOption({index:2});
        assert.match(await scope.innerText(),/studio-types.*product-lab\.ts.*TypeScript/);
      }
      await scope.scrollIntoViewIfNeeded();await screen(page,'contre-audit-'+segment+'-'+width);
    }
  }
  await page.setViewportSize({width:1440,height:900});
  return {projects:projects.length,viewports:['1440×900','390×844'],chooser:true,mobile:mobileMeasures};
}
