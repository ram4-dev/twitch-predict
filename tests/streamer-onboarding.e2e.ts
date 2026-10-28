import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {phantomProvider} from './fixtures/phantom.js';

test('streamer signs with wallet, authorizes Twitch and registers their channel',async({page})=>{
 const login=`streamer_${randomUUID().replaceAll('-','').slice(0,8)}`;
 await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify({id:String(Date.now()),login,display_name:'Streamer de prueba'}));
 const wallet=await phantomProvider(page);
 await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{const url=new URL(route.request().url());const callback=new URL(url.searchParams.get('redirect_uri')!);callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('code','e2e-code');await route.fulfill({contentType:'text/html',body:`<a href="${callback.href}">Autorizar canal</a>`});});
 await page.goto('/onboarding?streamer=1');await expect(page.getByRole('button',{name:'Conectar Twitch'})).toBeDisabled();
 await page.getByRole('button',{name:'Conectar Phantom'}).click();await expect(page.getByText(`${wallet.address.slice(0,6)}…${wallet.address.slice(-5)}`)).toBeVisible();
 await page.getByRole('button',{name:'Conectar Twitch'}).click();await page.getByRole('link',{name:'Autorizar canal'}).click();
 await expect(page.getByText(`@${login}`)).toBeVisible();await expect(page.getByRole('status')).toContainText('Tu canal está en seguimiento');
 expect(await page.evaluate(async()=>{const r=await fetch('/api/byte/twitch/channels');return (await r.json()).channels;})).toContain(login);
 await page.reload();await expect(page.getByText(`@${login}`)).toBeVisible();await expect(page.getByRole('status')).toContainText('Tu canal está en seguimiento');
});
test('missing Twitch configuration and rejected wallet show actionable states',async({page})=>{
 await page.route('**/api/twitch/config',route=>route.fulfill({json:{configured:false}}));await phantomProvider(page,undefined,true);await page.goto('/onboarding?streamer=1');
 await expect(page.getByText('La conexión con Twitch todavía no está configurada.')).toBeVisible();await page.getByRole('button',{name:'Conectar Phantom'}).click();await expect(page.getByRole('alert')).toContainText('Cancelaste');await expect(page.getByRole('button',{name:'Conectar Twitch'})).toBeDisabled();
});
test('Twitch cancellation retains wallet and permits retry',async({page})=>{
 await phantomProvider(page);await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{const url=new URL(route.request().url());const callback=new URL(url.searchParams.get('redirect_uri')!);callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('error','access_denied');await route.fulfill({contentType:'text/html',body:`<a href="${callback.href}">Cancelar</a>`});});
 await page.goto('/onboarding?streamer=1');await page.getByRole('button',{name:'Conectar Phantom'}).click();await page.getByRole('button',{name:'Conectar Twitch'}).click();await page.getByRole('link',{name:'Cancelar'}).click();
 await expect(page.getByRole('alert')).toContainText('Cancelaste la conexión con Twitch');await expect(page.getByRole('button',{name:'Conectar Twitch'})).toBeEnabled();
});
