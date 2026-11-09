import {test,expect} from '@playwright/test';
const surfaces=[
  ['landing','/'],['usuario','/app'],['pearl','/app?theme=pearl'],['jade','/app?theme=jade'],
  ['acceso','/onboarding'],['streamer','/onboarding?streamer=1'],['canal','/s/twitch/demo_streamer'],
  ['componentes','/components.html'],['navegaciones','/navbars.html'],['bot','/bot-setup.html'],
  ['beta','/beta.html'],['privacidad','/privacy.html'],['espera','/waitlist-success.html'],['error','/waitlist-error.html'],
  ['variantes-app','/app-options.html'],['variantes-detalle','/market-details.html'],['variantes-fondo','/background-options.html'],
  ['resolucion','/resolution.html'],['cobros','/payout-showcase.html'],
] as const;
test('all branded surfaces load the canonical logo without cropping at compact and popup widths',async({page},info)=>{
  test.setTimeout(180000);
  for(const width of [360,700]){
    await page.setViewportSize({width,height:600});
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const [name,path] of surfaces){
      await page.goto(path);
      const logos=page.locator('img[src="/brand/plot-logo-transparent.png"]:visible');
      await expect(logos.first(),`${name} at ${width}px`).toBeVisible();
      for(const logo of await logos.all()){
        await expect.poll(()=>logo.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===1888)).toBe(true);
        const geometry=await logo.evaluate(img=>{const box=img.getBoundingClientRect(),parent=img.parentElement!.getBoundingClientRect();return {width:box.width,height:box.height,inside:box.left>=parent.left-1&&box.right<=parent.right+1&&box.top>=parent.top-1&&box.bottom<=parent.bottom+1};});
        expect(geometry.inside,`${name}: cropped image`).toBe(true);
        expect(geometry.width/geometry.height).toBeCloseTo(1888/833,1);
      }
      if(name==='componentes'){
        await page.getByRole('button',{name:'Identidad',exact:true}).click();
        await expect(page.locator('.identity-logo img')).toHaveAttribute('src','/brand/plot-logo-transparent.png');
        await expect(page.locator('.identity-logo img')).toBeVisible();
      }
      await expect(page.locator('.plot-o,.phone-wordmark')).toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: horizontal overflow`).toBe(true);
      if(['streamer','usuario','canal'].includes(name))await page.screenshot({path:info.outputPath(`${name}-${width}.png`),fullPage:true});
    }
  }
});
for(const mode of ['offchain','byte'])test(`${mode}: onboarding units match the active transport`,async({page})=>{
  await page.route('**/api/health',route=>route.fulfill({json:{marketMode:mode}}));
  for(const path of ['/onboarding','/onboarding?streamer=1']){
    await page.goto(path);
    if(mode==='byte')await expect(page.locator('.auth-note')).toContainText('Las apuestas usan SOL de devnet.');
    else{
      await expect(page.locator('.auth-note')).toContainText('Los puntos son internos y de prueba.');
      await expect(page.getByText('SOL devnet',{exact:true})).toHaveCount(0);
      await expect(page.getByText('Las apuestas usan SOL de devnet.',{exact:false})).toHaveCount(0);
    }
  }
});
test('unknown transport does not claim a betting currency',async({page})=>{
  await page.route('**/api/health',route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
  await page.goto('/onboarding?streamer=1');
  await expect(page.getByText('Modo no disponible',{exact:true})).toBeVisible();
  await expect(page.locator('.auth-note')).toHaveText('La firma de acceso no envía una transacción.');
});
test('static support pages retain their logo without JavaScript',async({browser})=>{
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:360,height:600}});
  try{const page=await context.newPage();for(const path of ['/privacy.html','/beta.html','/bot-setup.html']){
    await page.goto(path);await expect(page.getByRole('img',{name:'Plot!',exact:true})).toBeVisible();
    await expect(page.getByRole('link',{name:'Plot, inicio'})).toHaveAttribute('href','/');
  }}finally{await context.close();}
});
