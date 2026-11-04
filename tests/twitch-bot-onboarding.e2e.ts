import {test,expect} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {phantomProvider} from './fixtures/phantom.js';

test('streamer links Twitch, adds plotfun through consent, sees connection and removes it',async({page},testInfo)=>{
 const login=`bot_${randomUUID().replaceAll('-','').slice(0,8)}`;await writeFile('test-results/twitch-oauth.json',JSON.stringify({id:String(Date.now()),login,display_name:'Streamer'}));await phantomProvider(page);
 let enabled=false,completed=false;
 await page.route('**/api/twitch/bot/status',route=>route.fulfill({json:{configured:true,available:true,enabled,phase:enabled?'connected':'disabled',error:null}}));
 await page.route('**/api/twitch/bot/start',async route=>{expect(route.request().headers().authorization).toMatch(/^Bearer /);await route.fulfill({json:{url:'https://id.twitch.tv/oauth2/authorize?scope=channel%3Abot'}});});
 await page.route('**/api/twitch/bot/complete',async route=>{expect(route.request().headers().authorization).toMatch(/^Bearer /);expect(route.request().postDataJSON().ticket).toBe('a'.repeat(64));enabled=true;completed=true;await route.fulfill({json:{enabled:true,channel:login}});});
 await page.route('**/api/twitch/bot/disable',async route=>{expect(route.request().headers().authorization).toMatch(/^Bearer /);enabled=false;await route.fulfill({json:{enabled:false,channel:login}});});
 await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{const url=new URL(route.request().url());if(url.searchParams.get('scope')==='channel:bot'){await route.fulfill({status:302,headers:{location:`${new URL(page.url()).origin}/onboarding?streamer=1&bot_ticket=${'a'.repeat(64)}`}});return;}const callback=new URL(url.searchParams.get('redirect_uri')!);callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('code','e2e-code');await route.fulfill({status:302,headers:{location:callback.href}});});
 await page.goto('/onboarding?streamer=1');await expect(page.getByRole('button',{name:'Agregar bot'})).toBeDisabled();await page.getByRole('button',{name:'Conectar Phantom'}).click();await page.getByRole('button',{name:'Conectar Twitch'}).click();await expect(page.getByText(`@${login}`,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Agregar bot'}).click();await expect(page.getByText('Conectado al chat. Probá !plot.')).toBeVisible();expect(completed).toBe(true);
 for(const width of [360,700,1440]){await page.setViewportSize({width,height:800});await expect(page.getByRole('button',{name:'Quitar bot'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await mkdir('test-results/bot-visual',{recursive:true});await page.screenshot({path:`test-results/bot-visual/onboarding-${width}.png`,fullPage:true});}
 await page.getByRole('button',{name:'Quitar bot'}).click();await expect(page.getByRole('button',{name:'Agregar bot'})).toBeVisible();await expect(page.getByText('Conectado al chat. Probá !plot.')).toHaveCount(0);
 await testInfo.attach('bot-connected',{path:'test-results/bot-visual/onboarding-700.png',contentType:'image/png'});
});
