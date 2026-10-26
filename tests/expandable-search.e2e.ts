import {test,expect} from '@playwright/test';

test('Twitch search expands, submits exactly once, keeps nonempty queries and restores keyboard focus',async({page})=>{
 let searches=0;const channels:string[]=[];
 await page.route('**/api/byte/markets',route=>route.fulfill({json:{markets:[]}}));
 await page.route('**/api/byte/twitch/watch',async route=>{searches++;channels.push(route.request().postDataJSON().channel);await route.fulfill({json:{predictions:[]}});});
 await page.goto('/byte');
 const toggle=page.getByRole('button',{name:'Buscar streamer',exact:true});await expect(toggle).toHaveAttribute('aria-expanded','false');await toggle.click();
 const input=page.getByRole('searchbox',{name:'Canal de Twitch',exact:true});await expect(input).toBeFocused();await input.fill('  @Eggsterr  ');
 const webClose=await page.getByRole('button',{name:'Cerrar búsqueda',exact:true}).boundingBox(),webField=await input.boundingBox();expect(webClose).toBeTruthy();expect(webField).toBeTruthy();expect(webField!.x).toBeGreaterThanOrEqual(webClose!.x+webClose!.width);
 await input.press('Enter');
 await expect(page.getByLabel('Filtrar canal')).toHaveValue('eggsterr');expect(searches).toBe(1);expect(channels).toEqual(['eggsterr']);
 await page.getByRole('heading',{level:1}).click();await expect(input).toHaveValue('  @Eggsterr  ');
 await input.focus();await input.press('Escape');await expect(input).toHaveCount(0);await expect(toggle).toBeFocused();
 await toggle.click();await input.fill('   ');await input.press('Enter');expect(searches).toBe(1);
 await input.fill('https://www.twitch.tv/eggsterr');await page.getByRole('button',{name:'Seguir canal',exact:true}).click();await expect.poll(()=>searches).toBe(2);expect(channels).toEqual(['eggsterr','eggsterr']);await expect(page.getByRole('search',{name:'Canal de Twitch',exact:true})).toHaveAttribute('aria-busy','false');
 await page.getByRole('button',{name:'Cerrar búsqueda'}).click();await toggle.click();await page.getByRole('heading',{level:1}).click();await expect(input).toHaveCount(0);
 await toggle.click();await input.fill('https://evil.example/eggsterr');await input.press('Enter');await expect(page.getByText('Pegá el enlace de un canal de Twitch.')).toBeVisible();expect(searches).toBe(2);
 await page.screenshot({path:'test-results/search-desktop.png',fullPage:true});
});

test('both expansion directions fit phone and tablet viewports under CSP and reduced motion',async({page})=>{
 const errors:string[]=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('pageerror',error=>errors.push(error.message));
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const width of [320,768,1440]){
  await page.setViewportSize({width,height:900});await page.goto('/components.html');
  for(const direction of ['derecha','izquierda']){
   const input=page.getByRole('searchbox',{name:`Búsqueda hacia la ${direction}`,exact:true});await page.getByRole('button',{name:`Abrir búsqueda hacia la ${direction}`,exact:true}).click();await expect(input).toBeFocused();
   const form=page.getByRole('search',{name:`Búsqueda hacia la ${direction}`,exact:true}),bounds=await form.boundingBox();expect(bounds).toBeTruthy();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
   await input.fill('eggsterr');
   const root=form.locator('..'),close=await root.getByRole('button',{name:'Cerrar búsqueda',exact:true}).boundingBox(),field=await input.boundingBox();expect(close).toBeTruthy();expect(field).toBeTruthy();
   if(direction==='derecha')expect(field!.x).toBeGreaterThanOrEqual(close!.x+close!.width);
   else expect(field!.x+field!.width).toBeLessThanOrEqual(close!.x);
   const contentStart=await input.evaluate(node=>node.getBoundingClientRect().left+parseFloat(getComputedStyle(node).paddingLeft));
   if(direction==='derecha')expect(contentStart).toBeGreaterThanOrEqual(close!.x+close!.width+8);
   await input.press('Enter');await expect(page.getByRole('status').filter({hasText:'Búsqueda de ejemplo: eggsterr'})).toBeVisible();
   await form.screenshot({path:`test-results/search-${direction}-${width}.png`});await input.press('Escape');await expect(input).toHaveCount(0);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }
 expect(errors).toEqual([]);
});

test('a pending Twitch refresh blocks duplicate submissions but still allows Escape and editing',async({page})=>{
 let searches=0,finish=()=>{};const pending=new Promise<void>(resolve=>{finish=resolve;});
 await page.route('**/api/byte/markets',async route=>{if(searches)await pending;await route.fulfill({json:{markets:[]}});});
 await page.route('**/api/byte/twitch/watch',async route=>{searches++;await route.fulfill({json:{predictions:[]}});});
 try{
  await page.goto('/byte');const toggle=page.getByRole('button',{name:'Buscar streamer',exact:true});await toggle.click();
  const input=page.getByRole('searchbox',{name:'Canal de Twitch',exact:true});await input.fill('eggsterr');await input.press('Enter');
  await expect(page.getByRole('search',{name:'Canal de Twitch',exact:true})).toHaveAttribute('aria-busy','true');await expect(page.getByRole('button',{name:'Seguir canal',exact:true})).toBeDisabled();
  await input.press('Escape');await expect(input).toHaveCount(0);await expect(toggle).toBeFocused();
  await toggle.click();await input.fill('summit1g');await input.press('Enter');expect(searches).toBe(1);
  finish();await expect(page.getByRole('button',{name:'Seguir canal',exact:true})).toBeEnabled();await input.press('Enter');await expect.poll(()=>searches).toBe(2);
 }finally{finish();}
});
