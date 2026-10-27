import {test,expect} from '@playwright/test';

const market=(id:string,channel:string)=>({id,title:`Mercado de ${channel}`,options:['Sí','No'],currency:'sol',status:'resolved',bettable:false,resolvable:false,openMs:Date.now()-120000,closeMs:Date.now()-60000,chain:{market:'11111111111111111111111111111111',settled:true},pools:[0,0],total:0,bettors:0,winner:0,invalidReason:null,notes:{channel,rules:'Resultado de prueba para el filtro de canales.',createdAt:new Date().toISOString()}});
const markets=()=>[market('pm_filter_egg','eggsterr'),market('pm_filter_summit','summit1g')];

test('expandable search replaces all-channels dropdown and filters without following or wallet login',async({page})=>{
 const mutations:string[]=[];page.on('request',request=>{if(request.method()==='POST')mutations.push(request.url());});
 await page.route('**/api/byte/markets',route=>route.fulfill({json:{markets:markets()}}));await page.goto('/byte');
 const cards=page.locator('.byte-grid>[data-market-id]');await expect(cards).toHaveCount(2);await expect(page.getByRole('combobox',{name:'Filtrar canal'})).toHaveCount(0);await expect(page.getByText('Todos los canales',{exact:true})).toHaveCount(0);
 const tools=page.locator('.byte-section-head').filter({has:page.getByRole('heading',{name:'Mercados',exact:true})});
 const toggle=tools.getByRole('button',{name:'Buscar canal',exact:true});await toggle.click();const input=page.getByRole('searchbox',{name:'Filtrar canal',exact:true});await expect(input).toBeFocused();
 await input.fill('  @Eggs  ');await input.press('Enter');await expect(cards).toHaveCount(1);await expect(cards).toContainText('Mercado de eggsterr');
 const close=await page.getByRole('button',{name:'Cerrar búsqueda',exact:true}).boundingBox(),field=await input.boundingBox();expect(field!.x+field!.width).toBeLessThanOrEqual(close!.x);
 await page.getByRole('heading',{level:1}).click();await expect(input).toHaveValue('  @Eggs  ');
 await input.focus();await input.press('Escape');await expect(input).toHaveCount(0);await expect(toggle).toBeFocused();await expect(cards).toHaveCount(2);
 await toggle.click();await input.fill('https://www.twitch.tv/summit1g');await page.getByRole('button',{name:'Filtrar mercados',exact:true}).click();await expect(cards).toHaveCount(1);await expect(cards).toContainText('Mercado de summit1g');
 await page.screenshot({path:'test-results/search-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Cerrar búsqueda'}).click();await expect(cards).toHaveCount(2);
 await toggle.click();await input.fill('   ');await input.press('Enter');await expect(cards).toHaveCount(2);await input.fill('https://evil.example/eggsterr');await input.press('Enter');await expect(page.getByText('Pegá el enlace de un canal de Twitch.')).toBeVisible();
 expect(mutations).toEqual([]);await expect(page.getByLabel('Canal de Twitch',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Seguir canal',exact:true})).toBeVisible();
 for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});const bounds=await page.getByRole('search',{name:'Filtrar canal',exact:true}).boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
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

test('filtering remains independent while following a channel refreshes in the background',async({page})=>{
 let follows=0,finish=()=>{};const pending=new Promise<void>(resolve=>{finish=resolve;});
 await page.route('**/api/byte/markets',async route=>{if(follows)await pending;await route.fulfill({json:{markets:markets()}});});
 await page.route('**/api/byte/twitch/watch',async route=>{follows++;await route.fulfill({json:{predictions:[]}});});
 try{
  await page.goto('/byte');const cards=page.locator('.byte-grid>[data-market-id]');await expect(cards).toHaveCount(2);
  await page.getByLabel('Canal de Twitch',{exact:true}).fill('eggsterr');await page.getByRole('button',{name:'Seguir canal',exact:true}).click();await expect(page.getByRole('button',{name:'Verificando Twitch…',exact:true})).toBeDisabled();
  const toggle=page.getByRole('button',{name:'Buscar canal',exact:true});await toggle.click();const input=page.getByRole('searchbox',{name:'Filtrar canal',exact:true});await input.fill('summit1g');await input.press('Enter');await expect(cards).toHaveCount(1);await expect(cards).toContainText('Mercado de summit1g');expect(follows).toBe(1);
  await input.press('Escape');await expect(cards).toHaveCount(2);await expect(toggle).toBeFocused();finish();await expect(page.getByRole('button',{name:'Seguir canal',exact:true})).toBeEnabled();
 }finally{finish();}
});
