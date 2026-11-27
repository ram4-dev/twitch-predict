import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

// First entry with no wallet: Twitch is the primary social login and must reach a working
// points session from a clean browser. Fixtures stub the OAuth authorize screen and the
// server's identity exchange via TWITCH_OAUTH_FIXTURE.
async function identity(){const id=String(Date.now()),login=`social_${randomUUID().replaceAll('-','').slice(0,8)}`;const user={id,login,display_name:'Viewer social'};await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify(user));return user;}
async function me(page:Page){return page.evaluate(async()=>{const r=await fetch('/api/points/me',{headers:{Authorization:`Bearer ${localStorage.getItem('pointsToken')}`}});return r.json();});}

test('first entry Twitch-only: the app shows Twitch primary, signs in and keeps its points',async({page})=>{
  const user=await identity();
  await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{
    const url=new URL(route.request().url()),redirect=url.searchParams.get('redirect_uri')!,state=url.searchParams.get('state')!;
    await route.fulfill({contentType:'text/html',body:`<!doctype html><h1>Conectar Twitch</h1><a href="${redirect}?state=${state}&code=e2e-code">Autorizar</a>`});
  });
  await page.goto('/app');
  await expect(page.getByRole('button',{name:'Continuar con Twitch'})).toBeVisible();
  await page.getByRole('button',{name:'Continuar con Twitch'}).click();
  await page.getByRole('link',{name:'Autorizar'}).click();
  await expect(page).toHaveURL(/\/app/);
  // The social session can already read its balance: points work without any wallet.
  await expect.poll(async()=>(await me(page)).balance).toBe(10000);
  const account=await me(page);expect(account.twitch?.id).toBe(user.id);expect(account.wallet).toBeNull();
});

test('a retired /onboarding link still lands on the app with its query intact',async({page})=>{
  // Old links, OAuth callbacks and bot authorizations still carry the retired path.
  await page.goto('/onboarding?streamer=1');
  await expect(page).toHaveURL(/\/app\?streamer=1$/);
  await expect(page.getByRole('region',{name:'Iniciar sesión'})).toBeVisible();
});

test('sign-in offers Twitch and a clear Phantom action without Google or extra wallet copy',async({page})=>{
  await page.goto('/app');
  await expect(page.getByRole('button',{name:'Continuar con Twitch'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Instalar Phantom'})).toBeVisible();
  await expect(page.getByText(/Google|La firma de acceso|Después de instalarla/)).toHaveCount(0);
});
