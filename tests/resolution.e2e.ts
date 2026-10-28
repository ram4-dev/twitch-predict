import {test,expect} from '@playwright/test';

test('resolution variants distinguish outcome, personal profit, payout and refund without mutations',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/components.html');await page.getByRole('link',{name:'Resolución ↗'}).click();
 const cards=page.locator('.plot-resolution');await expect(cards).toHaveCount(3);
 for(const card of await cards.all()){
  await expect(card.locator('.winner')).toContainText('Lo baja');await expect(card.locator('.winner')).toContainText('Ganó');
  await expect(card.locator('.loser')).toContainText('Perdió');await expect(card.locator('.resolution-net')).toHaveText('+220 pts');
  await expect(card.locator('.resolution-receipt')).toContainText('320 pts');
 }
 await cards.first().getByRole('button',{name:'Ver detalle'}).click();await expect(cards.first().locator('.resolution-detail')).toContainText('incluye los puntos recuperados');
 await page.getByRole('button',{name:'Perdiste',exact:true}).click();
 for(const card of await cards.all()){
  await expect(card.locator('.resolution-net')).toHaveText('−100 pts');await expect(card.locator('.resolution-receipt>div').last()).toHaveText('Cobro total0 pts');await expect(card.locator('.winner')).toContainText('Lo baja');
 }
 await page.getByRole('button',{name:'Sin apuesta',exact:true}).click();await expect(page.locator('.resolution-receipt')).toHaveCount(0);await expect(page.getByText('No participaste',{exact:true})).toHaveCount(3);
 await page.getByRole('button',{name:'Anulada',exact:true}).click();await expect(page.locator('.winner,.loser')).toHaveCount(0);
 for(const card of await cards.all()){await expect(card.locator('.resolution-net')).toHaveText('0 pts');await expect(card.locator('.resolution-receipt>div').last()).toHaveText('Reembolso total100 pts');}
 await page.getByRole('button',{name:'Pausar animación'}).click();expect(await page.locator('.liquid').evaluate(el=>getComputedStyle(el,'::before').animationPlayState)).toBe('paused');
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.liquid').evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});

test('resolution fits compact and popup widths, keyboard detail and motion replay work',async({page})=>{
 await page.goto('/resolution.html');
 for(const width of [320,360,700,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const state of ['Acertaste','Perdiste','Sin apuesta','Anulada']){
   await page.getByRole('button',{name:state,exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
 }
 await page.getByRole('button',{name:'Acertaste',exact:true}).click();
 await page.getByRole('button',{name:'360 px · Compacto'}).click();await expect(page.locator('.variant-grid')).toHaveClass(/wide/);
 expect(await page.locator('.extension-preview').first().evaluate(el=>el.getBoundingClientRect().width)).toBe(700);
 const detail=page.locator('.plot-resolution').first().locator('.resolution-detail-toggle');await detail.focus();await page.keyboard.press('Enter');await expect(detail).toHaveAttribute('aria-expanded','true');
 await page.getByRole('button',{name:'Repetir',exact:true}).click();await expect(page.locator('.plot-resolution').first().getByRole('button',{name:'Ver detalle'})).toHaveAttribute('aria-expanded','false');
 await page.getByRole('button',{name:'700 px · Popup'}).click();
 await page.screenshot({path:'test-results/resolution-desktop.png',fullPage:true});
 await page.setViewportSize({width:360,height:900});await page.screenshot({path:'test-results/resolution-compact.png',fullPage:true});
});
