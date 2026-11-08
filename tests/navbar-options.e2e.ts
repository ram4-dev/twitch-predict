import {test,expect} from '@playwright/test';

const options=[['glass','Isla de vidrio'],['rim','Órbita naranja'],['dock','Dock abierto']] as const;
for(const [variant,name] of options){
 test(`${name}: navigation, hover, viewport sizes and reduced motion`,async({page})=>{
  const errors:string[]=[],writes:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});
  await page.goto(`/navbar-preview.html?variant=${variant}`);
  const nav=page.getByRole('navigation',{name:'Secciones de Plot'});
  await expect(nav.getByRole('button')).toHaveCount(4);
  for(const [width,height] of [[320,740],[360,800],[700,600],[1024,768]]){
   await page.setViewportSize({width,height});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   for(const label of ['Mercados','Mis apuestas','Streamer','Canales']){
    const button=nav.getByRole('button',{name:label,exact:true});
    await button.click();await expect(button).toHaveAttribute('aria-current','page');
    await expect(page.getByRole('heading',{level:1,name:label,exact:true})).toBeVisible();
    const box=(await button.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
   }
   await nav.getByRole('button',{name:'Mercados',exact:true}).click();
   if(width===360||width===700)await page.screenshot({path:`test-results/navbar-${variant}-${width}.png`});
  }
  const history=nav.getByRole('button',{name:'Mis apuestas',exact:true});await history.focus();await page.keyboard.press('Enter');await expect(history).toHaveAttribute('aria-current','page');
  if(variant==='rim'){await nav.hover();expect(await page.locator('.orbit-shell').evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('rim-orbit');}
  if(variant==='dock'){await history.hover();await expect.poll(()=>history.evaluate(el=>getComputedStyle(el).transform)).not.toBe('none');await expect(nav).toHaveCSS('border-top-width','0px');}
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(history).toHaveCSS('transition-duration','0s');
  if(variant!=='dock')await expect(page.locator('.nav-indicator')).toHaveCSS('transition-duration','0s');
  expect(errors).toEqual([]);expect(writes).toEqual([]);
 });
}

test('comparison shows three working options and can focus a 360 or 700 px preview',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/navbars.html');
 await expect(page.locator('.preview-app')).toHaveCount(3);
 for(const [variant] of options){const stage=page.locator(`.variant-${variant}`);await stage.getByRole('button',{name:'Mis apuestas',exact:true}).click();await expect(stage.getByRole('heading',{name:'Mis apuestas',exact:true})).toBeVisible();}
 await page.screenshot({path:'test-results/navbar-comparison.png',fullPage:true});
 await page.getByRole('group',{name:'Comparar opciones'}).getByRole('button',{name:'Isla de vidrio'}).click();
 await expect(page.locator('.preview-app')).toHaveCount(1);await expect(page).toHaveURL(/variant=glass/);
 await page.getByRole('group',{name:'Ancho de la vista previa'}).getByRole('button',{name:'360 px',exact:true}).click();
 expect(Math.round((await page.locator('.preview-viewport').boundingBox())!.width)).toBe(360);
 await page.getByRole('group',{name:'Ancho de la vista previa'}).getByRole('button',{name:'700 px',exact:true}).click();
 expect(Math.round((await page.locator('.preview-viewport').boundingBox())!.width)).toBe(700);
 await page.setViewportSize({width:360,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Comparar las tres',exact:true}).click();await expect(page.locator('.preview-app')).toHaveCount(3);
});

test.describe('touch previews',()=>{
 test.use({viewport:{width:360,height:800},isMobile:true,hasTouch:true});
 for(const [variant,name] of options)test(`${name} works without hover`,async({page})=>{
  await page.goto(`/navbar-preview.html?variant=${variant}`);await page.getByRole('navigation').getByRole('button',{name:'Canales',exact:true}).tap();await expect(page.getByRole('heading',{level:1,name:'Canales',exact:true})).toBeVisible();await expect(page.getByRole('navigation').getByRole('button',{name:'Canales',exact:true})).toHaveAttribute('aria-current','page');
 });
});
