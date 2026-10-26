import {test,expect} from '@playwright/test';
test.skip(process.env.MARKET_MODE==='solana','Offchain UI');
test('catalog uses the shared market, validates input, supports dialog keyboard flow, and never sends a transaction',async({page})=>{
 const mutations:string[]=[];page.on('request',r=>{if(r.method()==='POST')mutations.push(r.url());});
 await page.goto('/components.html');await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.fonts.check('800 40px Fraunces'))).toBe(true);
 await expect(page.getByRole('img',{name:'plot',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Probar carga',exact:true}).click();await expect(page.getByRole('button',{name:'Guardando…',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Probar carga',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Ver detalle',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'Ver detalle',exact:true})).toBeFocused();
 await page.getByLabel('Canal de Twitch',{exact:true}).fill('bad channel');await page.getByRole('button',{name:'Probar validación',exact:true}).click();await expect(page.getByLabel('Canal de Twitch',{exact:true})).toHaveAttribute('aria-invalid','true');
 await page.getByLabel('Canal de Twitch',{exact:true}).fill('ramitapai');await page.getByRole('button',{name:'Probar validación',exact:true}).click();await expect(page.getByLabel('Canal de Twitch',{exact:true})).not.toHaveAttribute('aria-invalid','true');
 await page.getByRole('button',{name:'Reacciona',exact:true}).click();await expect(page.getByRole('img',{name:'Camaleón sorprendido',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Mercados',exact:true}).click();await expect(page.locator('.points-pool')).toContainText('1.200 pts');await page.getByLabel('Puntos a apostar').fill('250');await page.getByRole('button',{name:'Apostar a Lo baja',exact:true}).click();await expect(page.locator('.points-message')).toContainText('Vista de prueba: 250 pts');
 await page.getByRole('button',{name:'Cerrado',exact:true}).click();await expect(page.locator('.points-bet')).toHaveCount(0);await expect(page.locator('.points-status')).toContainText('Esperando resultado');
 await page.getByRole('button',{name:'Resuelto',exact:true}).click();await expect(page.getByText('Resultado ganador',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Anulado',exact:true}).click();await expect(page.locator('.points-status')).toContainText('Reembolso');
 await page.getByRole('button',{name:'Estados',exact:true}).click();await expect(page.getByText('No se pudo guardar la apuesta.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Ver ejemplo',exact:true}).click();await expect(page.locator('.market-question')).toBeVisible();expect(mutations).toEqual([]);
});
test('catalog families fit narrow viewports and load local fonts and chameleon',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});await page.goto('/components.html');await page.evaluate(()=>document.fonts.ready);
  for(const family of ['Botones y campos','Mercados','Estados','Identidad']){
   await page.getByRole('button',{name:family,exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  expect(await page.evaluate(()=>getComputedStyle(document.querySelector('.plot-chameleon')!).backgroundImage)).toContain('chameleon-poses.png');
  await page.screenshot({path:`test-results/plot-identity-${width}.png`,fullPage:true});
 }
});

test('first run renders the shared empty state and its slotted follow link',async({page})=>{
 await page.route('**/api/markets',route=>route.fulfill({json:[]}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'La próxima está por venir',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Seguir un canal',exact:true}).click();await expect(page.getByRole('heading',{name:'Canales seguidos',exact:true})).toBeVisible();
 await expect(page.locator('#notice')).not.toContainText('Slot failed');
});

test('Dia selection renders the dither shader, disposes button shader, and keeps keyboard choices working',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/components.html#dia');await expect(page.locator('.dia-study')).toBeVisible();
 for(const selector of ['.dia-market','.dia-character'])expect(await page.locator(selector).evaluate(el=>getComputedStyle(el).transform)).toBe('none');
 await expect(page.locator('.plot-dither-field canvas')).toHaveCount(1);
 const choose=page.getByRole('button',{name:'Lo baja · 62,5%',exact:true});await choose.focus();await expect(choose.locator('canvas')).toHaveCount(1);await page.keyboard.press('Enter');await expect(page.locator('.catalog-feedback')).toContainText('Lo baja');
 await page.getByRole('button',{name:'Pausar fondo',exact:true}).click();await expect(page.getByRole('button',{name:'Reanudar fondo',exact:true})).toHaveAttribute('aria-pressed','true');await expect(choose.locator('canvas')).toHaveCount(0);
 await page.getByRole('button',{name:'Simplex',exact:true}).click();await expect(page.getByRole('button',{name:'Simplex',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Repetir animación',exact:true}).click();await expect(page.locator('.plot-halftone')).toHaveAttribute('data-animation-state','assembling');await expect(page.locator('.plot-halftone')).toHaveAttribute('data-animation-state','settled');
 for(const width of [320,728,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/plot-dia-${width}.png`,fullPage:true});}
 await page.emulateMedia({reducedMotion:'reduce'});await choose.focus();await expect(choose.locator('canvas')).toHaveCount(0);expect(errors).toEqual([]);
});

test('all button variants share a capsule at rest and only soften while hovered',async({page})=>{
 await page.goto('/components.html');await page.mouse.move(0,0);
 const samples=page.locator('.button-samples').first().locator('[data-slot=button]');
 expect(await samples.count()).toBe(6);
 for(const button of await samples.all()){
  const geometry=await button.evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderRadius,transform:s.transform,height:el.getBoundingClientRect().height};});
  expect(geometry.radius).toBe('999px');expect(geometry.transform).toBe('none');expect(geometry.height).toBe(44);
 }
 const primary=samples.first();await primary.hover();await expect.poll(()=>primary.evaluate(el=>getComputedStyle(el).transform)).not.toBe('none');
 expect(await primary.evaluate(el=>getComputedStyle(el).borderRadius)).toBe('999px');
 await page.mouse.move(0,0);await expect.poll(()=>primary.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
 await primary.focus();expect(await primary.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
 await page.emulateMedia({reducedMotion:'reduce'});await primary.hover();expect(await primary.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
});

test('black showcase shares the high resolution wordmark across every family without stickers or small annotations',async({browser})=>{
 const context=await browser.newContext({viewport:{width:728,height:1000},deviceScaleFactor:2});
 try{const page=await context.newPage();await page.goto('/components.html');const wordmark=page.locator('.plot-halftone');await expect(wordmark).toHaveAttribute('data-animation-state','settled');
  const resolution=await wordmark.evaluate(el=>{const canvas=el as HTMLCanvasElement;return {pixels:canvas.width,css:canvas.clientWidth,dots:Number(canvas.dataset.particles)};});
  expect(resolution.pixels).toBeGreaterThanOrEqual(resolution.css*2);expect(resolution.dots).toBeGreaterThan(100);
  for(const family of ['Botones y campos','Mercados','Estados','Identidad','Selección de Dia']){
   await page.getByRole('button',{name:family,exact:true}).click();await expect(wordmark).toBeVisible();expect(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(8, 8, 8)');await expect(page.getByText('Mirá esta.',{exact:true})).toHaveCount(0);await expect(page.locator('.dia-market-note,.dia-references')).toHaveCount(0);
  }
  await page.getByRole('button',{name:'Repetir animación',exact:true}).click();await expect(wordmark).toHaveAttribute('data-animation-state','assembling');await expect(wordmark).toHaveAttribute('data-animation-state','settled');
  await page.emulateMedia({reducedMotion:'reduce'});await expect(wordmark).toHaveAttribute('data-animation-state','settled');await page.getByRole('button',{name:'Repetir animación',exact:true}).click();await expect(wordmark).toHaveAttribute('data-animation-state','settled');
 }finally{await context.close();}
});

test('orange hover follows the mouse in pre-styled showcase cards and contextual market',async({page})=>{
 await page.goto('/components.html');
 for(const family of ['Botones y campos','Mercados','Selección de Dia']){
  await page.getByRole('button',{name:family,exact:true}).click();
  const card=family==='Selección de Dia'?page.locator('.dia-market'):family==='Mercados'?page.locator('.market-specimen>div>.specimen'):page.locator('.specimen').filter({has:page.getByRole('heading',{name:'Botones',exact:true})});
  await card.scrollIntoViewIfNeeded();const box=(await card.boundingBox())!;
  for(const [x,y]of [[30,30],[box.width-35,Math.min(box.height-30,180)]]){
   await page.mouse.move(box.x+x,box.y+y);
   await expect.poll(()=>card.evaluate(el=>parseFloat(el.style.getPropertyValue('--spot-x')))).toBeCloseTo(x,0);
   await expect.poll(()=>card.evaluate(el=>parseFloat(el.style.getPropertyValue('--spot-y')))).toBeCloseTo(y,0);
   await expect.poll(()=>card.evaluate(el=>getComputedStyle(el,'::after').opacity)).toBe('1');
  }
  await page.mouse.move(0,0);await page.locator('.catalog-header a').first().focus();await expect.poll(()=>card.evaluate(el=>getComputedStyle(el,'::after').opacity)).toBe('0');
 }
});

test('opposite outcomes use green and red animated rims and matching pool segments',async({page})=>{
 await page.goto('/components.html');
 for(const family of ['Mercados','Selección de Dia']){
  await page.getByRole('button',{name:family,exact:true}).click();const card=family==='Mercados'?page.locator('.market-specimen>div>.specimen'):page.locator('.dia-market');
  const positive=card.locator('[data-tone=positive]'),negative=card.locator('[data-tone=negative]');await expect(positive).toHaveCount(1);await expect(negative).toHaveCount(1);
  for(const [button,color]of [[positive,'rgb(66, 201, 138)'],[negative,'rgb(255, 100, 111)']] as const){expect(await button.evaluate(el=>getComputedStyle(el).borderTopColor)).toBe(color);expect(await button.locator('.liquid-metal-surface').evaluate(el=>getComputedStyle(el).animationName)).toBe('outcome-rim');}
  expect(await card.locator('.share-primary').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(66, 201, 138)');expect(await card.locator('.share-secondary').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 100, 111)');
 }
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.dia-market [data-tone=positive] .liquid-metal-surface').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
