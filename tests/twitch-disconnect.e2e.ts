import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {signIn} from './fixtures/phantom.js';

async function me(page:Page){return page.evaluate(async()=>{const r=await fetch('/api/points/me',{headers:{Authorization:`Bearer ${localStorage.getItem('pointsToken')}`}});return r.json();});}

test('profile offers a working Disconnect button for a linked Twitch account',async({page})=>{
  test.setTimeout(90_000);
  const id=String(Date.now()),login=`disc_${randomUUID().replaceAll('-','').slice(0,8)}`;
  await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify({id,login,display_name:'Disconnect Streamer',scopes:['channel:bot','moderation:read']}));
  await signIn(page);
  await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{
    const url=new URL(route.request().url()),redirect=url.searchParams.get('redirect_uri')!,state=url.searchParams.get('state')!;
    await route.fulfill({contentType:'text/html',body:`<a href="${redirect}?state=${state}&code=e2e-code">Autorizar canal</a>`});
  });
  const result=await page.evaluate(async()=>{const r=await fetch('/api/twitch/start',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('pointsToken')}`},body:'{}'});return r.json();});
  await page.goto(result.url);await page.getByRole('link',{name:'Autorizar canal',exact:true}).click();
  await expect.poll(async()=>(await me(page)).twitch?.id,{timeout:10_000}).toBe(id);

  // The connected Twitch row must offer Disconnect (and no Conectar link).
  await page.goto('/app#profile');
  const twitchRow=page.locator('.phone-connected-row').filter({hasText:'Twitch'});
  const disconnect=twitchRow.getByRole('button',{name:'Desconectar'});
  await expect(disconnect).toBeVisible({timeout:10_000});
  await expect(twitchRow.getByRole('link',{name:'Conectar'})).toHaveCount(0);

  // Clicking it unlinks server-side and the row flips back to Conectar.
  await disconnect.click();
  await expect(twitchRow.getByRole('link',{name:'Conectar'})).toBeVisible({timeout:10_000});
  await expect.poll(async()=>(await me(page)).twitch,{timeout:10_000}).toBeNull();
});
