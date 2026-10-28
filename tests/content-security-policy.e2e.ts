import {test,expect} from '@playwright/test';
test.skip(process.env.MARKET_MODE==='solana','Shared Plot material surfaces use the offchain app');
test('Paper Shaders styles apply under CSP while arbitrary inline styles remain blocked',async({page})=>{
 await page.addInitScript(()=>{const violations:string[]=[];(window as unknown as {styleViolations:string[]}).styleViolations=violations;document.addEventListener('securitypolicyviolation',event=>{if(event.effectiveDirective.startsWith('style-src'))violations.push(event.blockedURI);});});
 for(const path of ['/components.html','/byte']){
  const response=await page.goto(path);const policy=response!.headers()['content-security-policy'];expect(policy).toContain("style-src 'self' 'sha256-bcX2M6hOeEgeI9Ttj3KtXWZuoRsKenyQAlXswSnLakA='");expect(policy).not.toContain('unsafe-inline');
  // The current Byte header has no ambient Paper Shader; focus a real metal control to mount it.
  await (path==='/components.html'?page.locator('.button-samples').first().locator('button').first():page.getByRole('button',{name:'Seguir canal',exact:true})).focus();
  const sheet=page.locator('style[data-paper-shader]');await expect(sheet).toHaveCount(1);
  expect(await sheet.evaluate(el=>(el as HTMLStyleElement).sheet?.cssRules.length??0)).toBeGreaterThan(0);
  if(path==='/components.html'){await page.locator('.button-samples').first().locator('button').first().hover();await expect(page.locator('.liquid-metal-surface canvas').first()).toBeAttached();}
  expect(await page.evaluate(()=>(window as unknown as {styleViolations:string[]}).styleViolations)).toEqual([]);
 }
 await page.evaluate(()=>{const style=document.createElement('style');style.textContent='body { --plot-untrusted-style: applied; }';document.head.append(style);});
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {styleViolations:string[]}).styleViolations)).toContain('inline');
 expect(await page.locator('body').evaluate(el=>getComputedStyle(el).getPropertyValue('--plot-untrusted-style'))).toBe('');
});
