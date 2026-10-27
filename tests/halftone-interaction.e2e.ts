import {test,expect} from '@playwright/test';

test('wordmark warms at the pointer, emits a click wave, returns home and respects reduced motion',async({page})=>{
 await page.goto('/components.html');const canvas=page.locator('.plot-halftone');await expect(canvas).toHaveAttribute('aria-label','Plot! en puntos');await expect(canvas).toHaveAttribute('data-animation-state','settled');
 const measure=()=>canvas.evaluate(el=>{const c=el as HTMLCanvasElement,d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let warm=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>100&&d[i]>200&&d[i+1]<180&&d[i+2]<150)warm++;return warm;});
 const initial=await measure();
 const target=await canvas.evaluate(el=>{const c=el as HTMLCanvasElement,rect=c.getBoundingClientRect(),d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;for(let y=Math.floor(c.height*.4);y<c.height*.7;y++)for(let x=Math.floor(c.width*.2);x<c.width*.45;x++){const i=(y*c.width+x)*4;if(d[i]>210&&d[i+1]>210&&d[i+3]>200)return {x:rect.left+x*rect.width/c.width,y:rect.top+y*rect.height/c.height};}throw new Error('Wordmark ink not rendered');});
 await page.mouse.move(target.x,target.y);await expect.poll(measure).toBeGreaterThan(initial+10);
 await page.mouse.move(0,0);await expect(canvas).toHaveAttribute('data-animation-state','settled');await expect.poll(measure).toBe(initial);
 await page.mouse.click(target.x,target.y);await page.mouse.move(0,0);await expect(canvas).toHaveAttribute('data-animation-state','assembling');await expect.poll(measure).toBeGreaterThan(initial+10);await expect(canvas).toHaveAttribute('data-animation-state','settled');
 await page.screenshot({path:'test-results/plot-halftone-settled.png'});
 await page.emulateMedia({reducedMotion:'reduce'});await expect(canvas).toHaveAttribute('data-animation-state','settled');await expect.poll(measure).toBe(initial);
 const still=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL());await page.mouse.click(target.x,target.y);await page.mouse.move(target.x+20,target.y);expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL())).toBe(still);
});
