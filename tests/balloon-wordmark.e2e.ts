import {test,expect} from '@playwright/test';

test('supplied artwork animates on hover, settles at rest and falls back safely',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');const logo=page.locator('.landing-scene .plot-balloon-wordmark'),canvas=logo.locator('canvas');
 await expect(logo).toHaveAttribute('data-renderer','balloon');await expect(canvas).toHaveAttribute('data-motion','resting');
 const image=await logo.locator('img').evaluate(el=>({width:(el as HTMLImageElement).naturalWidth,src:(el as HTMLImageElement).getAttribute('src')}));expect(image).toEqual({width:1792,src:'/brand/plot-wordmark.jpg'});
 await logo.hover();await expect(canvas).toHaveAttribute('data-motion','reacting');
 await page.mouse.down();await page.screenshot({path:'test-results/plot-balloon-pressed.png'});await page.mouse.up();await page.mouse.move(0,0);await expect(canvas).toHaveAttribute('data-motion','resting');
 const settled=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL());await page.waitForTimeout(200);expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL())).toBe(settled);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(logo).toHaveAttribute('data-renderer','image');await expect(canvas).toBeHidden();
 await page.emulateMedia({reducedMotion:'no-preference'});await expect(logo).toHaveAttribute('data-renderer','balloon');await expect(canvas).toHaveAttribute('data-motion','resting');
 await canvas.evaluate(el=>{(el as HTMLCanvasElement).getContext('webgl')!.getExtension('WEBGL_lose_context')!.loseContext();});await expect(logo).toHaveAttribute('data-renderer','image');await expect(logo.getByRole('img')).toHaveCount(0); // Root owns the accessible name; decorative children don't repeat it.
 await expect(page.locator('.landing-scene').getByRole('img',{name:'Plot!',exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test('compact live web header uses the balloon logo without horizontal overflow',async({page})=>{
 // Public Byte UI is available as its static entry even with the isolated offchain transport.
 await page.setViewportSize({width:360,height:800});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/byte.html');
 const logo=page.locator('.plot-balloon-wordmark');await expect(logo).toHaveAttribute('data-renderer','image');await expect(page.getByRole('img',{name:'Plot!',exact:true})).toBeVisible();
 expect(await logo.evaluate(el=>el.getBoundingClientRect().right<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/plot-balloon-compact.png'});
});

test('dashboard keeps a flat background at rest, on hover and with reduced motion',async({page})=>{
 await page.goto('/app');
 await expect(page.locator('.phone-brand img')).toHaveAttribute('src','/brand/plot-logo-transparent.png');
 await expect(page.locator('body > .popup-atmosphere')).toHaveCount(0);
 const app=page.locator('.phone-app');
 for(const [width,height] of [[360,800],[700,600],[1440,900]]){
  await page.setViewportSize({width,height});await expect(app).toHaveCSS('background-color','rgb(8, 8, 8)');
  await page.mouse.move(width/2,height/2);
  for(const pseudo of ['::before','::after'])expect(await app.evaluate((el,pseudo)=>{const s=getComputedStyle(el,pseudo);return {display:s.display,image:s.backgroundImage,filter:s.filter};},pseudo)).toEqual({display:'none',image:'none',filter:'none'});
 }
 await page.emulateMedia({reducedMotion:'reduce'});await expect(app).toHaveCSS('background-color','rgb(8, 8, 8)');
});
