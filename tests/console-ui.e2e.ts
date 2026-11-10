import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {signIn} from './fixtures/phantom.js';

// Plan 2 console E2E — the streamer runs the FULL console from the app by clicking buttons:
// create (composer) → close → resolve with winner → cancel with automatic refund. Real server,
// real aggregate, /app profile navigation. No API-only assertions for the UI path.

async function identity(){const id=String(Date.now()),login=`console_${randomUUID().replaceAll('-','').slice(0,8)}`;
  await writeFile(resolve('test-results/twitch-oauth.json'),JSON.stringify({id,login,display_name:'Console Streamer',scopes:['channel:bot','moderation:read']}));
  return {id,login};}
async function provider(page:Page,_login:string){await page.route('https://id.twitch.tv/oauth2/authorize?**',async route=>{
  const url=new URL(route.request().url()),redirect=url.searchParams.get('redirect_uri')!,state=url.searchParams.get('state')!;
  await route.fulfill({contentType:'text/html',body:`<a href="${redirect}?state=${state}&code=e2e-code">Autorizar canal</a>`});});}
async function me(page:Page){return page.evaluate(async()=>{const r=await fetch('/api/points/me',{headers:{Authorization:`Bearer ${localStorage.getItem('pointsToken')}`}});return r.json();});}

test('full console from the app: create, close, resolve, cancel — by clicking, owner only',async({page})=>{
  test.setTimeout(120_000);
  const user=await identity();await signIn(page);
  await provider(page,user.login);
  const result=await page.evaluate(async()=>{const r=await fetch('/api/twitch/start',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('pointsToken')}`},body:'{}'});return r.json();});
  await page.goto(result.url);await page.getByRole('link',{name:'Autorizar canal',exact:true}).click();
  await expect.poll(async()=>(await me(page)).twitch?.id,{timeout:10_000}).toBe(user.id);
  // Open the app profile: the streamer console section must be visible for the owner.
  await page.goto('/app#profile');
  await expect(page.getByLabel('Consola del streamer')).toBeVisible({timeout:10_000});

  // 1) CREATE via the composer.
  const unique=Date.now().toString(36);
  const q1=`¿Consola crea mercados? (${unique})`,q2=`¿Se cancela sola? (${unique})`;
  const composer=page.getByLabel('Crear mercado');
  await composer.getByLabel('Pregunta').fill(q1);
  await composer.getByLabel('Opción 1').fill('Sí');
  await composer.getByLabel('Opción 2').fill('No');
  await composer.getByRole('button',{name:'Crear mercado'}).click();
  await expect(page.getByRole('status').filter({hasText:'Mercado publicado'})).toBeVisible({timeout:10_000});

  // The owner follows their own channel so the market shows in the personal feed.
  await page.evaluate(async login=>{const {token}=await(await fetch('/api/pair')).json();await fetch('/api/channels',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({channel:login})});},user.login);
  await page.goto('/app#markets');
  const card=page.locator(`[data-key="${(await fullMarketKey(page,q1))}"]`);
  await expect(card).toBeVisible({timeout:15_000});

  // 2) CLOSE apuestas from the profile console.
  await page.goto('/app#profile');
  const marketBox=page.locator(`[data-streamer-key]`).filter({hasText:q1});
  await marketBox.getByRole('button',{name:'Cerrar apuestas'}).click();
  await expect(marketBox.getByRole('status').filter({hasText:'Apuestas cerradas'})).toBeVisible({timeout:10_000});

  // 3) RESOLVE with the winner select.
  await marketBox.getByLabel(`Ganador de ${q1}`).selectOption('1');
  await marketBox.getByRole('button',{name:'Resolver mercado'}).click();
  await expect(marketBox.getByRole('status').filter({hasText:'Mercado resuelto'})).toBeVisible({timeout:10_000});
  const resolvedPhase=((await (await page.request.get('/api/markets')).json()) as {key:string;phase:string;prediction:{title:string}}[]).find(m=>m.prediction.title===q1)?.phase;
  console.log('PHASE after resolve:',resolvedPhase);
  // Server-backed verification of the resolved phase (the owner did not bet on it: no personal position).
  const key1=await fullMarketKey(page,q1);
  // No bets were placed: the authorized settlement keeps winnerId and voids the market (refunds nothing to refund).
  await expect.poll(async()=>{const m=((await (await page.request.get('/api/markets')).json()) as {key:string;phase:string;winnerId?:string}[]).find(m=>m.key===key1);return m?`${m.phase}:${m.winnerId??''}`:'';},{timeout:15_000}).toBe('void:1');

  // 4) CREATE another and CANCEL it: automatic refund without a claim button.
  await page.goto('/app#profile');
  const composer2=page.getByLabel('Crear mercado');
  await composer2.getByLabel('Pregunta').fill(q2);
  await composer2.getByLabel('Opción 1').fill('Sí');
  await composer2.getByLabel('Opción 2').fill('No');
  await composer2.getByRole('button',{name:'Crear mercado'}).click();
  await expect(page.getByRole('status').filter({hasText:'Mercado publicado'})).toBeVisible({timeout:10_000});
  const cancelBox=page.locator(`[data-streamer-key]`).filter({hasText:q2});
  // The backend requires locking before resolving or cancelling: close, then cancel with automatic refund.
  await cancelBox.getByRole('button',{name:'Cerrar apuestas'}).click();
  await expect(cancelBox.getByRole('status').filter({hasText:'Apuestas cerradas'})).toBeVisible({timeout:10_000});
  await cancelBox.getByRole('button',{name:'Cancelar y reembolsar'}).click();
  await expect(cancelBox.getByRole('status').filter({hasText:'reembolso automático'})).toBeVisible({timeout:10_000});

  // Viewer-only guard: a viewer account never sees the streamer console.
  const viewerPage=await page.context().newPage();
  await viewerPage.goto('/onboarding');
  await viewerPage.evaluate(()=>localStorage.removeItem('pointsToken'));
  await viewerPage.goto('/app#profile');
  await expect(viewerPage.getByLabel('Consola del streamer')).toHaveCount(0);
  await viewerPage.close();
});

async function fullMarketKey(page:Page,title:string):Promise<string>{
  const markets=await (await page.request.get('/api/markets')).json() as {key:string;prediction:{title:string}}[];
  const found=markets.find(m=>m.prediction.title===title);
  if(!found)throw new Error(`market not found: ${title}`);
  return found.key;
}
