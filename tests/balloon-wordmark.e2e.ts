import {test,expect} from '@playwright/test';

test('supplied artwork inflates, reacts, respects reduced motion and falls back after context loss',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');const logo=page.locator('#plot-scene .plot-balloon-wordmark'),canvas=logo.locator('canvas');
 await expect(logo).toHaveAttribute('data-renderer','balloon');await expect(canvas).toHaveAttribute('data-motion','floating');
 const image=await logo.locator('img').evaluate(el=>({width:(el as HTMLImageElement).naturalWidth,src:(el as HTMLImageElement).getAttribute('src')}));expect(image).toEqual({width:1792,src:'/brand/plot-wordmark.jpg'});
 await logo.hover();await expect(canvas).toHaveAttribute('data-motion','reacting');
 await page.mouse.down();await page.screenshot({path:'test-results/plot-balloon-pressed.png'});await page.mouse.up();await page.mouse.move(0,0);await expect(canvas).toHaveAttribute('data-motion','floating');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(logo).toHaveAttribute('data-renderer','image');await expect(canvas).toBeHidden();
 await page.emulateMedia({reducedMotion:'no-preference'});await expect(logo).toHaveAttribute('data-renderer','balloon');await expect(canvas).toHaveAttribute('data-motion','floating');
 await canvas.evaluate(el=>{(el as HTMLCanvasElement).getContext('webgl')!.getExtension('WEBGL_lose_context')!.loseContext();});await expect(logo).toHaveAttribute('data-renderer','image');await expect(logo.getByRole('img')).toHaveCount(0); // Root owns the accessible name; decorative children don't repeat it.
 await expect(page.getByRole('img',{name:'Plot!',exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test('compact live web header uses the balloon logo without horizontal overflow',async({page})=>{
 // Public Byte UI is available as its static entry even with the isolated offchain transport.
 await page.setViewportSize({width:360,height:800});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/byte.html');
 const logo=page.locator('.plot-balloon-wordmark');await expect(logo).toHaveAttribute('data-renderer','image');await expect(page.getByRole('img',{name:'Plot!',exact:true})).toBeVisible();
 expect(await logo.evaluate(el=>el.getBoundingClientRect().right<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/plot-balloon-compact.png'});
});
