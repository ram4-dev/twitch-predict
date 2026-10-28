import {test,expect} from '@playwright/test';

test('four neutral result concepts show net amounts and simulate reopening without API writes',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/')&&r.method()!=='GET')writes.push(r.url());});
 await page.goto('/payout-showcase.html');await page.evaluate(()=>document.fonts.ready);
 const variants=page.locator('.payout-variant');await expect(variants).toHaveCount(4);
 await expect(page.getByRole('heading',{name:'Inter',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Space Grotesk',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Fraunces',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Archivo Black',exact:true})).toBeVisible();
 await expect(page.locator('.counting-number').first()).toHaveText('+0,018');await expect(page.locator('.money[aria-label="Ganancia neta: +0,018 SOL"]')).toHaveCount(4);
 for(const card of await page.locator('.payout-card').all())expect(await card.evaluate(el=>({background:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage}))).toEqual({background:'rgb(18, 18, 18)',image:'none'});
 expect(await page.getByText(/^(Ganó|Perdió)$/).count()).toBe(0);
 await page.getByRole('button',{name:'Pérdida',exact:true}).click();await expect(page.locator('.counting-number').first()).toHaveText('−0,010');await expect(page.locator('.money[aria-label="Pérdida neta: −0,010 SOL"]')).toHaveCount(4);
 await page.getByRole('button',{name:'Sin apuesta',exact:true}).click();await expect(page.locator('.money-number')).toHaveText(['—','—','—','—']);await expect(page.locator('.money-unit')).toHaveCount(0);
 await page.getByRole('button',{name:'Pago pendiente',exact:true}).click();await expect(page.locator('.result-label')).toHaveText(['Pago por confirmar','Pago por confirmar','Pago por confirmar','Pago por confirmar']);await expect(page.locator('.money-number')).toHaveText(['—','—','—','—']);
 await page.getByRole('button',{name:'Ganancia',exact:true}).click();
 for(let i=0;i<4;i++){
  const trigger=variants.nth(i).getByRole('button',{name:'Probar con la extensión cerrada'});await trigger.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.locator('.browser-stage')).toHaveAttribute('data-popup','closed');await expect(dialog.locator('.simulated-popup')).toHaveCount(0);await expect(dialog.locator('.simulated-popup')).toBeVisible();await expect(dialog.locator('.money')).toHaveAttribute('aria-label','Ganancia neta: +0,018 SOL');await expect(dialog.getByRole('status')).toHaveText('Popup abierto');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
 }
 expect(writes).toEqual([]);await page.screenshot({path:'test-results/payout-showcase-desktop.png',fullPage:true});
});

test('phone layout, replay and reduced motion keep the final amounts readable',async({page})=>{
 await page.setViewportSize({width:360,height:800});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/payout-showcase.html');await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);await expect(page.locator('.counting-number').first()).toHaveText('+0,018');
 for(const card of await page.locator('.payout-card').all()){
  expect(await card.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
  expect(await card.locator('.money').evaluate(el=>{const b=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth&&b.right<=innerWidth;})).toBe(true);
 }
 await page.screenshot({path:'test-results/payout-showcase-mobile.png',fullPage:true});
 await page.locator('.payout-variant').nth(1).getByRole('button',{name:'Probar con la extensión cerrada'}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('.simulated-popup')).toBeVisible();expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await expect(dialog.locator('.money')).toHaveAttribute('aria-label','Ganancia neta: +0,018 SOL');
 await dialog.getByRole('button',{name:'Repetir secuencia'}).click();await expect(dialog.locator('.browser-stage')).toHaveAttribute('data-popup','closed');await expect(dialog.locator('.simulated-popup')).toBeVisible();await page.screenshot({path:'test-results/payout-showcase-opening.png'});await dialog.getByRole('button',{name:'Cerrar simulación'}).click();await expect(dialog).toHaveCount(0);
});


test('opening preview keeps the main amount visible at the 700 by 600 extension size',async({page})=>{
 await page.setViewportSize({width:700,height:600});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/payout-showcase.html');await page.locator('.payout-variant').first().getByRole('button',{name:'Probar con la extensión cerrada'}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('.simulated-popup')).toBeVisible();const money=dialog.locator('.money');await expect(money).toBeInViewport({ratio:1});expect(await money.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:'test-results/payout-showcase-extension-size.png'});
});

test('colors and completion pulse replay together and font files load',async({page})=>{
 await page.goto('/payout-showcase.html');await page.evaluate(()=>document.fonts.ready);
 const numbers=page.locator('.counting-number');await expect(numbers).toHaveCount(4);
 await expect(numbers.last()).toHaveAttribute('data-complete','true');
 expect(await numbers.first().evaluate(el=>getComputedStyle(el).animationName)).toBe('count-arrival');
 const families=await page.locator('.money-number').evaluateAll(els=>els.map(el=>getComputedStyle(el).fontFamily));
 expect(families.join(' ')).toContain('Space Grotesk');expect(families.join(' ')).toContain('Archivo Black');
 expect(await page.evaluate(()=>document.fonts.check('600 50px "Space Grotesk"')&&document.fonts.check('400 50px "Archivo Black"'))).toBe(true);
 await page.getByRole('button',{name:'Menta',exact:true}).click();expect(await page.locator('.money').first().evaluate(el=>getComputedStyle(el).color)).toBe('rgb(121, 226, 180)');
 await page.getByRole('button',{name:'Repetir todas',exact:true}).click();await expect(numbers.first()).toHaveAttribute('data-complete','false');await expect(numbers.last()).toHaveAttribute('data-complete','true');
 await page.getByRole('button',{name:'Pérdida',exact:true}).click();await expect(numbers.first()).toHaveText('−0,010');expect(await page.locator('.money').first().evaluate(el=>getComputedStyle(el).color)).toBe('rgb(255, 133, 133)');
});
