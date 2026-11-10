import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
test('debug social entry',async({page})=>{
  const user={id:String(Date.now()),login:`social_${Date.now().toString(36)}`,display_name:'Social Debug'};
  await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify(user));
  await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{
    const url=new URL(route.request().url()),redirect=url.searchParams.get('redirect_uri')!,state=url.searchParams.get('state')!;
    await route.fulfill({contentType:'text/html',body:`<a href="${redirect}?state=${state}&code=e2e-code">Autorizar</a>`});
  });
  page.on('request',r=>{if(r.url().includes('/api/'))console.log('REQ:',r.method(),r.url().slice(-60));});
  const completeResponse=page.waitForResponse(r=>r.url().includes('/api/twitch/complete'),{timeout:8000}).catch(()=>null);
  await page.goto('/onboarding');
  await page.getByRole('button',{name:'Continuar con Twitch'}).click();
  await expect(page).toHaveURL(/id.twitch.tv|onboarding/);
  await page.getByRole('link',{name:'Autorizar'}).click();
  await page.waitForTimeout(4000);
  console.log('URL:',page.url().slice(0,80));
  const completed=await completeResponse;
  if(completed)console.log('COMPLETE:',completed.status(),(await completed.text()).slice(0,160));else console.log('COMPLETE: never called');
  const dbg=await page.evaluate(async()=>{const token=localStorage.getItem('pointsToken');const r=await fetch('/api/points/me',{headers:{Authorization:`Bearer ${token}`}});return {status:r.status,body:await r.json(),token:(token??'null').slice(0,8)};});
  console.log('ME:',dbg.status,JSON.stringify(dbg.body).slice(0,120),'token:',dbg.token);
});
