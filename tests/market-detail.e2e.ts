import {test,expect} from '@playwright/test';
import {signIn} from './fixtures/phantom.js';

for(const layout of ['direct','pool','context','hybrid'])test(`${layout}: detail, responsive actions, simulated bet and back preserve the feed`,async({page})=>{
 const errors:string[]=[],writes:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>{if(request.method()==='POST')writes.push(request.url());});
 await page.goto(`/mobile-preview.html?layout=${layout}`);
 await page.getByRole('combobox',{name:'Buscar streamer'}).fill('juan');await page.getByRole('option').filter({hasText:'@juansguarnizo'}).click();
 await page.getByRole('link',{name:'Ver detalle: ¿Quién gana el duelo?',exact:true}).click();
 const detail=page.getByRole('region',{name:'Detalle del mercado'});await expect(detail).toHaveAttribute('data-layout',layout);await expect(detail.getByRole('heading',{name:'¿Quién gana el duelo?',exact:true})).toBeVisible();await expect(page).toHaveURL(/market=demo-2/);
 if(layout==='hybrid'){
  await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.fonts.check('500 42px "Space Grotesk"'))).toBe(true);await expect(detail.locator('.detail-side')).toHaveCount(2);for(const card of await detail.locator('.detail-side').all()){await expect(card.locator('[data-slot=liquid-glass-backdrop]')).toHaveCount(0);await expect(card).toHaveCSS('backdrop-filter','none');await expect(card).toHaveCSS('filter','none');await expect(card).toHaveCSS('background-image','none');}await expect(detail.locator('.detail-side').first()).toHaveCSS('background-color','rgb(20, 32, 27)');await expect(detail.locator('.detail-side').last()).toHaveCSS('background-color','rgb(37, 25, 29)');await expect(detail.locator('.detail-side').first()).toContainText('2.268 pts');await expect(detail.locator('.detail-side').last()).toContainText('3.132 pts');await expect(detail.locator('.detail-pool-total')).toContainText('5.400 pts');await expect(detail.locator('.detail-people')).toHaveText('Personas18');
  await expect(detail.locator('.detail-side').first()).toContainText('42%');await expect(detail.locator('.detail-side').last()).toContainText('58%');
  expect(await detail.locator('.detail-people>strong').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(30);
 }
 for(const [width,height] of [[320,740],[360,800],[700,600],[1440,900]]){
  await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const action=detail.getByRole('button',{name:'Apostar a 9z',exact:true}),box=(await action.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(44);expect(box.y+box.height).toBeLessThanOrEqual(height);await expect(action).toBeInViewport();
  if(layout==='hybrid')for(const value of await detail.locator('.detail-side-content>strong').all()){const text=await value.boundingBox(),card=await value.locator('..').boundingBox();expect(text!.x+text!.width).toBeLessThanOrEqual(card!.x+card!.width);expect(await value.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}if(width===360||width===700)await page.screenshot({path:`test-results/market-detail-${layout}-${width}.png`});
 }
 await detail.getByRole('button',{name:'Apostar a 9z',exact:true}).click();await page.getByRole('button',{name:'Simular apuesta',exact:false}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(detail.locator('.detail-own')).toContainText('100 pts');await expect(detail).toContainText('9z');if(layout==='hybrid'){await expect(detail.locator('.detail-side').last()).toContainText('Tu elección');await expect(detail.locator('.detail-pool-total')).toContainText('5.500 pts');await expect(detail.locator('.detail-people')).toHaveText('Personas19');await expect(detail.locator('.detail-side').last()).toContainText('58,8%');}await expect(page.locator('.phone-balance')).toContainText('9.650');
 await detail.getByRole('button',{name:'Volver',exact:true}).click();await expect(page.getByRole('combobox')).toHaveValue('@juansguarnizo');await expect(page.locator('.phone-market')).toHaveCount(1);await expect(page).not.toHaveURL(/market=/);
 await page.getByRole('link',{name:'Ver detalle: ¿Quién gana el duelo?',exact:true}).click();await page.goBack();await expect(page.getByRole('combobox')).toHaveValue('@juansguarnizo');
 await page.emulateMedia({reducedMotion:'reduce'});expect(errors).toEqual([]);expect(writes).toEqual([]);
});

test('detail comparison offers three independent previews and full screen deep links',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/market-details.html');await expect(page.locator('.market-detail')).toHaveCount(3);await page.screenshot({path:'test-results/market-detail-comparison.png',fullPage:true});
 await page.getByRole('group',{name:'Detalle'}).getByRole('button',{name:'El pozo',exact:true}).click();await expect(page.locator('.market-detail')).toHaveCount(1);await page.getByRole('button',{name:'700 px',exact:true}).click();expect(Math.round((await page.locator('.phone-preview-frame').boundingBox())!.width)).toBe(700);
 await page.getByRole('link',{name:'Abrir a pantalla completa'}).click();await expect(page.locator('.market-detail')).toHaveAttribute('data-layout','pool');await page.reload();await expect(page.locator('.market-detail')).toHaveAttribute('data-layout','pool');await page.getByRole('button',{name:'Volver',exact:true}).click();await expect(page.locator('.phone-market')).toHaveCount(3);
 await page.goto('/market-detail-preview.html?market=missing');await expect(page.getByText('Mercado no disponible.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Volver a apuestas'}).click();await expect(page.locator('.phone-market')).toHaveCount(3);
});

test('live detail keeps real betting and shows market result separately from the personal receipt',async({page})=>{
 await page.setViewportSize({width:360,height:800});await signIn(page);
 const operator=async(path:string,body:unknown)=>page.evaluate(async({path,body})=>{const {token}=await(await fetch('/api/pair')).json();const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});if(!response.ok)throw new Error(await response.text());return response.json();},{path,body});
 const market=await operator('/api/demo',{});await page.goto(`/app?market=${encodeURIComponent(market.key)}&layout=pool`);
 const detail=page.getByRole('region',{name:'Detalle del mercado'});await expect(detail).toHaveAttribute('data-layout','hybrid');await expect(detail).toBeVisible();await detail.getByRole('button',{name:'Apostar a Gana',exact:true}).click();await page.getByLabel('Puntos a apostar',{exact:true}).fill('300');await page.getByRole('button',{name:'Confirmar apuesta',exact:false}).click();await expect(page.locator('#own-balance')).toHaveText('9.700 pts');await expect(detail.locator('.detail-own')).toContainText('300 pts');
 await operator('/api/demo/resolve',{key:market.key,winnerId:'victory'});await page.reload();const resolution=detail.locator('.plot-resolution.count');await expect(resolution).toHaveCount(1);await expect(resolution.locator('.resolution-result')).toContainText('Ganó Gana');await expect(resolution.locator('.resolution-result')).toContainText('Perdió Pierde');await expect(resolution.locator('.resolution-receipt')).toContainText('Tu apuesta300 pts');await expect(resolution.locator('.resolution-receipt')).toContainText('Cobro total300 pts');await expect(resolution.locator('.resolution-net')).toHaveText('0 pts');await expect(detail.locator('.detail-duel,.detail-result,.detail-heading')).toHaveCount(0);await expect(detail.getByRole('button',{name:'Apostar a Gana',exact:true})).toHaveCount(0);await detail.getByRole('button',{name:'Cobrar 300 pts',exact:true}).click();await expect(page.locator('#own-balance')).toHaveText('10.000 pts');
});

test('opening a scrolled market restores the feed position and history also opens details',async({page})=>{
 await page.setViewportSize({width:360,height:600});await page.goto('/mobile-preview.html');
 const link=page.getByRole('link',{name:'Ver detalle: ¿Cómo termina el reto?',exact:true});await link.scrollIntoViewIfNeeded();const scroll=await page.locator('.phone-content').evaluate(el=>el.scrollTop);expect(scroll).toBeGreaterThan(0);await link.click();await expect(page.getByRole('button',{name:'Volver',exact:true})).toBeInViewport();await page.getByRole('button',{name:'Volver',exact:true}).click();await expect.poll(()=>page.locator('.phone-content').evaluate(el=>el.scrollTop)).toBe(scroll);
 await page.getByRole('button',{name:'Mis jugadas',exact:true}).click();await page.getByRole('link',{name:'Ver detalle: ¿Gana la próxima partida?',exact:true}).click();await expect(page.locator('.detail-own')).toContainText('250 pts');await page.getByRole('button',{name:'Volver',exact:true}).click();await expect(page.locator('.phone-position')).toHaveCount(1);await expect(page.getByRole('button',{name:'Mis jugadas',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('card text, metadata and empty space open details while betting stays separate',async({page})=>{
 await page.setViewportSize({width:360,height:800});await page.goto('/mobile-preview.html');
 const card=page.locator('[data-key="demo-1"]'),link=card.getByRole('link',{name:'Ver detalle: ¿Gana la próxima partida?',exact:true});
 await expect(link.locator('svg')).toHaveCount(0);const color=await link.evaluate(el=>getComputedStyle(el).color);await link.hover();await expect(link).toHaveCSS('color',color);await expect(link).toHaveCSS('border-width','0px');
 // Top-left padding is outside the title, pool and betting controls.
 await card.click({position:{x:8,y:8}});await expect(page.locator('.market-detail')).toBeVisible();await page.getByRole('button',{name:'Volver',exact:true}).click();
 const meta=(await card.locator('.phone-market-meta').boundingBox())!;await page.mouse.click(meta.x+meta.width/2,meta.y+meta.height/2);await expect(page.locator('.market-detail')).toBeVisible();await page.getByRole('button',{name:'Volver',exact:true}).click();
 await card.getByRole('button',{name:'Apostar a Sí',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.market-detail')).toHaveCount(0);await expect(page).not.toHaveURL(/market=/);await page.getByRole('button',{name:'Cerrar apuesta'}).click();
 await link.focus();await page.keyboard.press('Enter');await expect(page.locator('.market-detail')).toBeVisible();
});
