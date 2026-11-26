import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {phantomProvider} from './fixtures/phantom.js';

// The app is the only entry: connecting and managing a streamer channel happens in Mi perfil.
const newLogin=()=>`streamer_${randomUUID().replaceAll('-','').slice(0,8)}`;
async function stubAuthorize(page:import('@playwright/test').Page,label='Autorizar canal'){
 await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{
  const url=new URL(route.request().url());
  // The bot consent screen carries no redirect_uri: it returns its own one-use ticket.
  if(url.searchParams.get('scope')==='channel:bot'){await route.fulfill({status:302,headers:{location:`${new URL(page.url()).origin}/app?bot_ticket=${'a'.repeat(64)}#profile`}});return;}
  const callback=new URL(url.searchParams.get('redirect_uri')!);callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('code','e2e-code');
  await route.fulfill({contentType:'text/html',body:`<a href="${callback.href}">${label}</a>`});
 });
}

test('signed-in account links Twitch from the profile and manages its channel there',async({page})=>{
 const login=newLogin();
 await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify({id:String(Date.now()),login,display_name:'Streamer de prueba'}));
 await phantomProvider(page);
 await stubAuthorize(page);
 // Sign in with the wallet only; the channel block is not offered until a channel exists.
 await page.goto('/app');
 await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await page.waitForURL('**/app#markets');
 await expect(page.locator('#own-balance')).toContainText('10.000');
 await page.goto('/app#profile');
 const accounts=page.getByRole('region',{name:'Cuentas conectadas'});
 await expect(accounts.getByText(`@${login}`)).toHaveCount(0);
 await accounts.getByRole('button',{name:'Conectar',exact:true}).first().click();
 await page.getByRole('link',{name:'Autorizar canal'}).click();
 await page.waitForURL(/\/app(\?|#|$)/);
 const block=page.getByRole('region',{name:'Tu canal de streamer'});
 await expect(block).toBeVisible({timeout:20000});
 await expect(block.getByText(`@${login}`,{exact:true})).toBeVisible();
 await block.getByRole('button',{name:/Activar seguimiento/}).click();
 await expect(block.getByRole('status').filter({hasText:'Tu canal está en seguimiento'})).toBeVisible({timeout:20000});
 expect(await page.evaluate(async()=>{const r=await fetch('/api/byte/twitch/channels');return (await r.json()).channels;})).toContain(login);
 // The bot consent flow has its own spec; here the channel surface is what matters.
 let enabled=false;
 await page.route('**/api/twitch/bot/status',route=>route.fulfill({json:{configured:true,available:false,enabled,phase:'disabled',error:null}}));
 await page.route('**/api/twitch/bot/start',route=>route.fulfill({json:{url:'https://id.twitch.tv/oauth2/authorize?scope=channel%3Abot'}}));
 await page.route('**/api/twitch/bot/complete',route=>{enabled=true;return route.fulfill({json:{enabled:true,channel:login}});});
 await page.route('**/api/twitch/bot/disable',route=>{enabled=false;return route.fulfill({json:{enabled:false,channel:login}});});
 await block.getByRole('button',{name:'Agregar bot'}).click();
 await expect(block.getByRole('button',{name:'Quitar bot'})).toBeEnabled({timeout:20000});
 await expect(block.getByText('El servicio está esperando la autorización de plotfun.')).toBeVisible({timeout:20000});
 await page.reload();
 await expect(block.getByRole('button',{name:'Quitar bot'})).toBeEnabled({timeout:20000});
 await block.getByRole('button',{name:'Quitar bot'}).click();await expect(block.getByRole('button',{name:'Agregar bot'})).toBeEnabled({timeout:20000});
 await page.reload();
 await expect(block.getByText(`@${login}`,{exact:true})).toBeVisible();
 await expect(block.getByRole('status').filter({hasText:'Tu canal está en seguimiento'})).toBeVisible();
});

test('a wallet sign-in that fails keeps the account signed out and shows the reason',async({page})=>{
 await phantomProvider(page,undefined,true);await page.goto('/app');
 await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Cancelaste');
 await expect(page.getByRole('region',{name:'Iniciar sesión'})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('pointsToken'))).toBeNull();
});

test('missing Twitch configuration is surfaced instead of a dead connect action',async({page})=>{
 // A server without Twitch credentials must say so, not open a broken provider screen.
 await page.addInitScript(()=>localStorage.setItem('pointsToken','expired-fixture'));
 await page.route('**/api/points/me',route=>route.fulfill({json:{id:'fixture',wallet:'wallet-fixture',twitch:null,balance:100,bets:[],streamerChannels:[]}}));
 await page.route('**/api/twitch/start',route=>route.fulfill({status:400,json:{error:'Falta configurar la app de Twitch en el servidor'}}));
 await page.goto('/app#profile');
 await page.getByRole('region',{name:'Cuentas conectadas'}).getByRole('button',{name:'Conectar',exact:true}).first().click();
 await expect(page.getByRole('alert')).toContainText('Falta configurar la app de Twitch');
});

test('Twitch cancellation keeps the account usable and permits a retry',async({page})=>{
 await phantomProvider(page);
 await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{const url=new URL(route.request().url());const callback=new URL(url.searchParams.get('redirect_uri')!);callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('error','access_denied');await route.fulfill({contentType:'text/html',body:`<a href="${callback.href}">Cancelar</a>`});});
 await page.goto('/app');
 await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await page.waitForURL('**/app#markets');
 await page.goto('/app#profile');
 await page.getByRole('region',{name:'Cuentas conectadas'}).getByRole('button',{name:'Conectar',exact:true}).first().click();
 await page.getByRole('link',{name:'Cancelar'}).click();
 await expect(page.getByRole('alert')).toContainText('Cancelaste la conexión con Twitch');
 // The session survives the cancelled link, so the user can try again.
 await expect(page.getByRole('region',{name:'Cuentas conectadas'}).getByRole('button',{name:'Conectar',exact:true}).first()).toBeEnabled();
});

test('bot status failure is visible instead of silently disabling the action',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('pointsToken','expired-fixture'));
 await page.route('**/api/points/me',route=>route.fulfill({json:{id:'fixture',wallet:'wallet-fixture',twitch:{id:'1',login:'fixture_streamer',displayName:'Fixture'},balance:100,bets:[],streamerChannels:[]}}));
 await page.route('**/api/twitch/bot/status',route=>route.fulfill({status:401,json:{error:'Sesión inválida'}}));
 await page.goto('/app#profile');
 const block=page.getByRole('region',{name:'Tu canal de streamer'});
 await expect(block.getByText('No se pudo consultar el bot: Sesión inválida')).toBeVisible();
 await expect(block.getByRole('button',{name:'Agregar bot'})).toBeDisabled();
});
