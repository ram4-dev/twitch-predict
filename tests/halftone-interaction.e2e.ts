import {test,expect} from '@playwright/test';

test('wordmark warms at the pointer, emits a click wave, returns home and respects reduced motion',async({page})=>{
 await page.goto('/components.html');const canvas=page.locator('.plot-halftone');await expect(canvas).toHaveAttribute('aria-label','Plot! en puntos');await expect(canvas).toHaveAttribute('data-animation-state','settled');
 const measure=()=>canvas.evaluate(el=>{const c=el as HTMLCanvasElement,d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let warm=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>100&&d[i]>200&&d[i+1]<180&&d[i+2]<150)warm++;return warm;});
 const initial=await measure(),home=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL());
 const target=await canvas.evaluate(el=>{const c=el as HTMLCanvasElement,rect=c.getBoundingClientRect(),d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;for(let y=Math.floor(c.height*.4);y<c.height*.7;y++)for(let x=Math.floor(c.width*.2);x<c.width*.45;x++){const i=(y*c.width+x)*4;if(d[i]>210&&d[i+1]>210&&d[i+3]>200)return {x:rect.left+x*rect.width/c.width,y:rect.top+y*rect.height/c.height};}throw new Error('Wordmark ink not rendered');});
 await page.mouse.move(target.x,target.y);await expect.poll(measure).toBeGreaterThan(initial+10);
 await page.mouse.move(0,0);await expect(canvas).toHaveAttribute('data-animation-state','settled');await expect.poll(measure).toBe(initial);
 // Capture every painted frame of the brief pulse; polling pixels can miss its peak.
 await canvas.evaluate(el=>{
  const c=el as HTMLCanvasElement&{__pulse?:{peak:number;assembling:boolean;complete:boolean}};
  const sample={peak:0,assembling:false,complete:false};c.__pulse=sample;
  c.addEventListener('pointerdown',()=>{
   const frame=()=>{
    const data=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let warm=0;
    for(let i=0;i<data.length;i+=4)if(data[i+3]>100&&data[i]>200&&data[i+1]<180&&data[i+2]<150)warm++;
    sample.peak=Math.max(sample.peak,warm);sample.assembling ||=c.dataset.animationState==='assembling';
    sample.complete=sample.assembling&&c.dataset.animationState==='settled';
    if(!sample.complete)requestAnimationFrame(frame);
   };requestAnimationFrame(frame);
  },{once:true});
 });
 await page.mouse.click(target.x,target.y);await page.mouse.move(0,0);
 await expect.poll(()=>canvas.evaluate(el=>(el as HTMLCanvasElement&{__pulse:{complete:boolean}}).__pulse.complete)).toBe(true);
 const pulse=await canvas.evaluate(el=>(el as HTMLCanvasElement&{__pulse:{peak:number;assembling:boolean}}).__pulse);
 expect(pulse.assembling).toBe(true);expect(pulse.peak).toBeGreaterThan(initial+10);await expect(canvas).toHaveAttribute('data-animation-state','settled');
 await page.screenshot({path:'test-results/plot-halftone-settled.png'});
 await page.emulateMedia({reducedMotion:'reduce'});await expect(canvas).toHaveAttribute('data-animation-state','settled');await expect.poll(measure).toBe(initial);
 // The media event can precede React's redraw; require the real home image first.
 await expect.poll(()=>canvas.evaluate((el,home)=>(el as HTMLCanvasElement).toDataURL()===home,home)).toBe(true);
 const still=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL());await page.mouse.click(target.x,target.y);await page.mouse.move(target.x+20,target.y);expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL())).toBe(still);
});
