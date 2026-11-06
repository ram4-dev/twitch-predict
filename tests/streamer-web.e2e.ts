import {test,expect,type APIRequestContext} from '@playwright/test';
import {writeFile,rename,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {default as jsQR} from 'jsqr';
import {PNG} from 'pngjs';
import type {DisplayByteMarket} from '../src/byte-model.js';

async function seedTwitch(predictions:unknown[]){const file=resolve('test-results/twitch-fixture.json');await writeFile(file+'.test',JSON.stringify(predictions));await rename(file+'.test',file);}

/** Seeds a market through the local operator route (same path byte.e2e.ts uses). */
async function seedMarket(request:APIRequestContext,base:string,channel:string,title='¿Gana la próxima partida?'){
  const response=await request.post(`${base}/api/byte/markets`,{headers:{'x-operator-token':(await readFile(resolve('artifacts/bridge-token'),'utf8')).trim(),host:new URL(base).host,'sec-fetch-site':'same-origin',origin:base},data:{channel,title,options:['Sí','No'],currency:'sol',windowSecs:600,rules:'Gana si el marcador final muestra victoria. Evidencia: VOD del canal.',requestId:randomUUID()}});
  expect(response.ok()).toBe(true);
  return (await response.json()) as {market:DisplayByteMarket};
}

test.describe('public streamer web',()=>{
  const base=process.env.APP_URL??'http://twitch-predict.localhost:1358';
  test('/s/twitch/:login shows exact channel markets, live states and no cross-channel leaks',async({page,request})=>{
    const channel=`stream_${randomUUID().replaceAll('-','').slice(0,8)}`,other=`stream_${randomUUID().replaceAll('-','').slice(0,8)}`;
    await seedMarket(request,base,channel);await seedMarket(request,base,other,'Mercado del otro canal');
    await page.goto(`/s/twitch/${channel}`);
    await expect(page.getByRole('heading',{name:`@${channel}`,exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'¿Gana la próxima partida?',exact:true})).toBeVisible();
    // Exact matching: the other channel's market must never appear here.
    await expect(page.getByText('Mercado del otro canal',{exact:true})).toHaveCount(0);
    await expect(page.getByText('SOL devnet · sin dinero real',{exact:true})).toBeVisible();
    await expect(page.getByRole('link',{name:'Buscar otro streamer'})).toBeVisible();
    await expect(page.locator('.market-card').first().getByRole('button',{name:'Apostar a Sí',exact:true})).toBeVisible();
  });

  test('empty channel keeps the viewer on the page with a specific state',async({page})=>{
    const channel=`empty_${randomUUID().replaceAll('-','').slice(0,8)}`;
    await page.goto(`${base}/s/twitch/${channel}`);
    await expect(page.getByText(`@${channel} todavía no tiene predicciones abiertas.`,{exact:false})).toBeVisible();
    await expect(page.getByRole('link',{name:'Buscar otro streamer'}).first()).toBeVisible();
  });

  test('unsupported platform shows an explicit state, never Twitch data',async({page})=>{
    await page.goto(`${base}/s/kick/somechannel`);
    await expect(page.getByRole('heading',{name:'Página no encontrada',exact:true})).toBeVisible();
    await expect(page.getByText('Twitch · predicciones en plot')).toHaveCount(0);
  });

  test('join on desktop shows QR plus continue button; QR decodes to the channel page',async({page})=>{
    const channel=`qr_${randomUUID().replaceAll('-','').slice(0,8)}`;
    await page.goto(`${base}/join/twitch/${channel}`);
    await expect(page.getByText(`Las predicciones de @${channel}, en tu celular.`,{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Continuar en este dispositivo'})).toBeVisible();
    await expect(page.getByRole('link',{name:'Continuar directo a las predicciones'})).toBeVisible();
    const canvas=page.locator('.streamer-qr canvas');
    await expect(canvas).toBeVisible();
    // The QR must decode to the direct channel page, never /join or /overlay.
    await expect.poll(async()=>{
      const shot=await canvas.screenshot();
      const png=PNG.sync.read(shot);
      const result=jsQR.default(new Uint8ClampedArray(png.data),png.width,png.height);
      return result?.data??'';
    },{timeout:10000}).toBe(`${base}/s/twitch/${channel}`);
  });

  test('join on a phone goes straight to the channel page',async({browser})=>{
    const channel=`phone_${randomUUID().replaceAll('-','').slice(0,8)}`;
    const context=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',viewport:{width:390,height:844}});
    const page=await context.newPage();
    await page.goto(`${base}/join/twitch/${channel}`);
    await expect(page).toHaveURL(new RegExp(`/s/twitch/${channel}$`));
    await expect(page.getByRole('heading',{name:`@${channel}`,exact:true})).toBeVisible();
    // No QR loop on the phone: the join page is gone from history.
    await page.goBack().catch(()=>{});
    await expect(page).not.toHaveURL(/\/join\//);
    await context.close();
  });

  test('overlay renders a compact QR card for OBS without sessions',async({page})=>{
    const channel=`obs_${randomUUID().replaceAll('-','').slice(0,8)}`;
    await page.goto(`${base}/overlay/twitch/${channel}`);
    await expect(page.getByRole('heading',{name:`@${channel}`,exact:true})).toBeVisible();
    await expect(page.locator('.streamer-qr canvas')).toBeVisible();
    await expect(page.getByText('Escaneá el QR y participá',{exact:false})).toBeVisible();
    await expect(page.getByText('sin dinero real')).toHaveCount(0);
  });

  test('landing search opens the channel page without watch writes',async({page})=>{
    const channel='eggsterr';
    await seedTwitch([]);
    await page.goto(`${base}/#streamer-search`);
    await page.getByLabel('Buscar streamer').fill(`https://www.twitch.tv/${channel}?ref=home`);
    await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await expect(page.getByRole('link',{name:/Eggsterr/}).first()).toBeVisible();
    await page.getByRole('link',{name:/Eggsterr/}).first().click();
    await expect(page).toHaveURL(new RegExp(`/s/twitch/${channel}$`));
    // A public search and visit must not create watch registrations.
    const watched=await page.request.get(`${base}/api/byte/twitch/channels`).then(r=>r.json());
    expect(JSON.stringify(watched)).not.toContain(`"${channel}"`);
  });
});
