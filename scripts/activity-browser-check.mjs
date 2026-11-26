import assert from 'node:assert/strict';

// The host acceptance suite supplies an authenticated synthetic operator and disposable database.
export async function verifyActivityBrowser(page,origin,screen) {
  const results=page.locator('#journal-resultats');
  const top=results.getByRole('navigation',{name:'Pagination en haut de liste'});
  const requestUrl='/activity?project=a&type=mission&days=1';
  const original=page.viewportSize();
  const observations=[];
  try {
    for(const size of [{width:1440,height:900},{width:390,height:844}]){
      await page.setViewportSize(size);
      await page.goto(origin+requestUrl);
      const next=top.getByRole('link',{name:'Suivante'});
      const bounds=await next.boundingBox();
      assert(bounds && bounds.y+bounds.height<size.height,'Pagination avant le premier défilement');
      assert.equal(await results.locator('.event-feed > li').count(),10);
      if(screen) await screen(page,'journal-'+size.width);
      const header=await results.locator('h2').innerText();
      assert.match(header,/Résultats 1 à 10 sur \d+ · Page 1 sur/);
      await page.evaluate(()=>{window.journalDocument=document;});
      await next.click();
      await page.waitForFunction(()=>document.querySelector('#journal-count')?.textContent.includes('Page 2 sur'));
      assert.equal(await page.evaluate(()=>window.journalDocument===document),true);
      const url=new URL(page.url());
      for(const [k,v] of Object.entries({project:'a',type:'mission',days:'1',page:'2'}))assert.equal(url.searchParams.get(k),v);
      const row=results.locator('.event-feed > li').first();
      assert.match(await row.locator(':scope > a').first().getAttribute('href'),/^\/projects\/a\/(?:control|missions)\//);
      assert.equal(await row.locator(':scope > a').nth(1).getAttribute('href'),'/projects/a');
      assert(await row.locator('time').isVisible());
      const technical=row.locator('details');
      assert.equal(await technical.locator('dl').isVisible(),false);
      await technical.locator('summary').click();
      assert(await technical.locator('dd').first().isVisible());
      assert.equal(await row.evaluate(li=>li.scrollWidth<=li.clientWidth),true);
      await technical.locator('summary').click();
      const back=page.waitForFunction(()=>document.querySelector('#journal-count')?.textContent.includes('Page 1 sur'));
      await page.goBack();await back;
      assert.equal(await results.locator('h2').innerText(),header);
      await page.goto(origin+'/activity?project=a&type=git&days=30');
      const git=results.locator('.event-feed > li').first();
      const details=git.locator('details');
      assert.equal(await details.locator('dl').isVisible(),false);
      await details.locator('summary').click();
      for(const field of ['Auteur','Branche','Commit Git','Relevé']){
        assert(await details.getByText(field,{exact:true}).isVisible());
      }
      assert.match(await details.locator('dd').allTextContents().then(texts=>texts.join(' ')),/\b[a-f0-9]{40}\b/);
      if(size.width===390) {
        const rows=await details.locator('dt').evaluateAll(terms=>terms.map(term=>({
          labelBottom:term.getBoundingClientRect().bottom,valueTop:term.nextElementSibling.getBoundingClientRect().top,
        })));
        assert(rows.every(row=>row.labelBottom<=row.valueTop),'Valeurs techniques sous leur libellé en vue mobile');
      }
      await details.scrollIntoViewIfNeeded();
      if(screen) await screen(page,'journal-releve-'+size.width);
      const proof=git.getByRole('link',{name:'Relevé Git actualisé'});
      const proofHref=await proof.getAttribute('href');
      assert.match(proofHref,/^\/projects\/a\/repository\?observation=/);
      const [response]=await Promise.all([page.waitForNavigation(),proof.click()]);
      assert.equal(response.status(),200);
      assert.equal(page.url(),origin+proofHref);
      observations.push({size,paginationBottom:Math.round(bounds.y+bounds.height),header,gitProof:true});
    }
  } finally {if(original)await page.setViewportSize(original);}
  return observations;
}
