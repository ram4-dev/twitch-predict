import {test,expect} from '@playwright/test';

test('spotlight sits behind bet cards without changing stakes, intercepting controls or overflowing',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const market={id:'pm_spotlight',title:'¿Gana la próxima partida?',options:['Gana','Pierde'],currency:'sol',status:'open',bettable:true,resolvable:false,openMs:Date.now()-10000,closeMs:Date.now()+600000,chain:{market:'11111111111111111111111111111111',settled:false},pools:[10000000,20000000],total:30000000,bettors:3,notes:{channel:'eggsterr',rules:'Se confirma el resultado final de esta partida.',createdAt:new Date().toISOString()}};
 await page.route('**/api/byte/markets',r=>r.fulfill({json:{markets:[market]}}));await page.goto('/byte');
 const card=page.locator('[data-market-id="pm_spotlight"]'),amount=card.getByRole('textbox',{name:'Importe en SOL devnet'});
 await expect(card).toHaveClass(/plot-glow-card/);
 const stage=page.locator('.byte-grid.plot-glow-stage');
 await expect(stage).toBeVisible();
 expect(await card.evaluate(el=>getComputedStyle(el).backgroundImage)).toBe('none');
 expect(await stage.evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).toContain('radial-gradient');
 expect(await stage.evaluate(el=>getComputedStyle(el,'::before').zIndex)).toBe('-1');await amount.fill('0.05');
 await card.scrollIntoViewIfNeeded();const box=(await card.boundingBox())!;
 for(const x of [30,box.width-30]){
  await page.mouse.move(box.x+x,box.y+22);await expect(card).toHaveAttribute('data-glow-active','true');
  await expect.poll(()=>card.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('1');
  await expect(stage).toHaveAttribute('data-glow-active','true');
  expect(await card.evaluate(el=>getComputedStyle(el).backgroundImage)).toBe('none');
  await expect(amount).toHaveValue('0.05');
 }
 await page.mouse.move(0,0);await expect(card).not.toHaveAttribute('data-glow-active');
 await amount.focus();await expect.poll(()=>card.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('1');
 await card.getByText('Reglas y evidencia',{exact:true}).click();await expect(card.getByText(market.notes.rules,{exact:true})).toBeVisible();
 for(const width of [320,768,1440]){
  await page.setViewportSize({width,height:1000});await card.scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(amount).toHaveValue('0.05');await card.hover({position:{x:30,y:20}});await page.screenshot({path:`test-results/spotlight-${width}.png`,fullPage:true});
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('heading',{level:1}).click();await card.hover({position:{x:30,y:22}});
 await expect.poll(()=>card.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('0');
 expect(await card.evaluate(el=>getComputedStyle(el,'::before').transitionDuration)).toBe('0s');
 await card.dispatchEvent('pointermove',{pointerType:'touch',clientX:20,clientY:20});await expect(card).not.toHaveAttribute('data-glow-active');
 await amount.focus();await expect.poll(()=>card.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('1');
 await expect(amount).toHaveValue('0.05');expect(errors).toEqual([]);
});
