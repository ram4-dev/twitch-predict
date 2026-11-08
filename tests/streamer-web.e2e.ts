import {signIn} from './fixtures/phantom.js';
import {test,expect,type Page} from '@playwright/test';
import {writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {default as jsQR} from 'jsqr';
import {PNG} from 'pngjs';

async function seedTwitch(predictions:unknown[]){const file=resolve('test-results/twitch-fixture.json');await writeFile(file+'.test',JSON.stringify(predictions));await rename(file+'.test',file);}

/** Seeds a market through the local operator route (same path byte.e2e.ts uses). */
async function seedMarket(page:Page,base:string,channel:string,title='¿Gana la próxima partida?'){
  await writeFile(resolve('test-results/byte-fixture.json'),JSON.stringify({markets:[],signatures:{},broadcasts:0,resolutions:0,invalidations:0,syncs:0}),{flag:'wx'}).catch(()=>{});
  await page.goto(`${base}/byte`);
  await page.getByRole('button',{name:'Operador',exact:true}).click();
  await page.getByLabel('Canal de Twitch',{exact:true}).fill(channel);
  await page.getByLabel('Pregunta',{exact:true}).fill(title);
  await page.getByLabel('Reglas de resolución',{exact:true}).fill('Gana si el marcador final muestra victoria. Evidencia: VOD del canal.');
  await page.getByRole('button',{name:'Crear mercado en devnet',exact:true}).click();
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
}

test.describe('public streamer web',()=>{
  const base=process.env.APP_URL??'http://twitch-predict.localhost:1358';
  test('/s/twitch/:login shows exact channel markets, live states and no cross-channel leaks',async({page})=>{
    const channel=`stream_${randomUUID().replaceAll('-','').slice(0,8)}`,other=`${channel}_extra`;
    await seedMarket(page,base,channel);await seedMarket(page,base,other,'Mercado del otro canal');
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
    await expect(page.getByRole('link',{name:/@eggsterr/}).first()).toBeVisible();
    await page.getByRole('link',{name:/@eggsterr/}).first().click();
    await expect(page).toHaveURL(new RegExp(`/s/twitch/${channel}$`));
    // A public search and visit must not create watch registrations.
    const watched=await page.request.get(`${base}/api/byte/twitch/channels`).then(r=>r.json());
    expect(JSON.stringify(watched)).not.toContain(`"${channel}"`);
  });
});

test('public surfaces fit popup and compact widths with readable QR codes',async({page},testInfo)=>{
  for(const width of [700,360]){
    await page.setViewportSize({width,height:600});
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const route of ['/s/twitch/demo_streamer','/join/twitch/demo_streamer?desktop','/overlay/twitch/demo_streamer']){
      await page.goto(route);
      await expect(page.locator('.streamer-identity h1')).toBeVisible();
      if(route.startsWith('/s/')){
        const logo=page.getByRole('img',{name:'Plot!',exact:true});
        await expect(logo).toHaveAttribute('src','/brand/plot-logo-transparent.png');
        await expect.poll(()=>logo.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const canvas=page.locator('.streamer-qr canvas');
      if(await canvas.count()){
        await expect.poll(async()=>{
          const png=PNG.sync.read(await canvas.screenshot());
          return jsQR.default(new Uint8ClampedArray(png.data),png.width,png.height)?.data??'';
        }).toContain('/s/twitch/demo_streamer');
      }
      await page.screenshot({path:testInfo.outputPath(`${width}-${route.split('/')[1]}.png`),fullPage:true});
    }
  }
});


test('points channel reuses the user card and confirms a points bet without byte transactions',async({page},testInfo)=>{
  await signIn(page);
  const market=await page.evaluate(async()=>{
    const {token}=await (await fetch('/api/pair')).json();
    const response=await fetch('/api/demo',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok)throw new Error('Demo seed failed');
    return response.json();
  });
  // Exercise the points transport even when this suite also provisions byte fixtures.
  await page.route('**/api/byte/status',route=>route.fulfill({json:{configured:false}}));
  await page.goto('/s/twitch/demo_streamer');
  const card=page.locator(`[data-key="${market.key}"]`);
  await expect(card).toHaveClass(/phone-market-ember/);
  await expect(card.locator('.phone-market-meta')).toContainText('pts en juego');
  await expect(page.getByText('SOL devnet · sin dinero real',{exact:true})).toHaveCount(0);
  for(const width of [360,700]){
    await page.setViewportSize({width,height:600});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`points-${width}.png`),fullPage:true});
  }
  const posts:string[]=[];
  page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname);});
  await card.getByRole('button',{name:'Apostar a Gana',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(posts).toEqual([]);
  await page.getByLabel('Puntos a apostar',{exact:true}).fill('100');
  await page.getByRole('button',{name:'Confirmar apuesta',exact:false}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card.locator('.phone-market-meta')).toContainText('100');
  expect(posts).toEqual(['/api/points/bet']);
  const account=await page.evaluate(async()=>fetch('/api/points/me',{headers:{Authorization:`Bearer ${localStorage.getItem('pointsToken')}`}}).then(r=>r.json()));
  expect(account.bets.filter((b:{marketKey:string})=>b.marketKey===market.key)).toHaveLength(1);
  await card.getByRole('link',{name:`Ver detalle: ${market.prediction.title}`}).click();
  await expect(page.getByRole('button',{name:/Volver/}).first()).toBeVisible();
});
