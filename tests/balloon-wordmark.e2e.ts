import {test,expect} from '@playwright/test';

test('supplied artwork animates on hover, settles at rest and falls back safely',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/app');const logo=page.locator('#plot-scene .plot-balloon-wordmark'),canvas=logo.locator('canvas');
 await expect(logo).toHaveAttribute('data-renderer','balloon');await expect(canvas).toHaveAttribute('data-motion','resting');
 const image=await logo.locator('img').evaluate(el=>({width:(el as HTMLImageElement).naturalWidth,src:(el as HTMLImageElement).getAttribute('src')}));expect(image).toEqual({width:1792,src:'/brand/plot-wordmark.jpg'});
 await logo.hover();await expect(canvas).toHaveAttribute('data-motion','reacting');
 await page.mouse.down();await page.screenshot({path:'test-results/plot-balloon-pressed.png'});await page.mouse.up();await page.mouse.move(0,0);await expect(canvas).toHaveAttribute('data-motion','resting');
 const settled=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL());await page.waitForTimeout(200);expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL())).toBe(settled);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(logo).toHaveAttribute('data-renderer','image');await expect(canvas).toBeHidden();
 await page.emulateMedia({reducedMotion:'no-preference'});await expect(logo).toHaveAttribute('data-renderer','balloon');await expect(canvas).toHaveAttribute('data-motion','resting');
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

test('exclamation balloon background follows the pointer over the entire viewport and rests under reduced motion',async({page})=>{
 await page.goto('/app');const field=page.locator('body > .popup-atmosphere .plot-latex-field'),canvas=field.locator('canvas');await expect(canvas).toBeVisible();await expect(field).toHaveAttribute('data-ready','true');await expect(field).toHaveAttribute('data-pattern','exclamation-balloons');expect(Number(await field.getAttribute('data-balloons'))).toBeGreaterThanOrEqual(12);
 await expect(page.locator('#plot-scene .plot-dither-field')).toHaveCount(0);
 const initial=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL());await page.mouse.move(1100,600);await expect(field).toHaveAttribute('data-motion','following');await expect(field).toHaveAttribute('data-motion','resting');expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL())).not.toBe(initial);
 expect(await field.evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(field).toHaveAttribute('data-reduced','true');await expect(field).toHaveAttribute('data-motion','resting');const still=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL());await page.mouse.move(20,20);await page.waitForTimeout(100);expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL())).toBe(still);
 await page.screenshot({path:'test-results/plot-latex-background.png'});
});
