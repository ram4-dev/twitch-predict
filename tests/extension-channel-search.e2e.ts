import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
test.skip(process.env.E2E_MARKET_MODE!=='byte','Requires Byte fixture server');
test('MV3 searches a new streamer by Twitch URL, mirrors once, and preserves keyboard and text layout',async()=>{
 const base=process.env.APP_URL??'http://twitch-predict.localhost:1358',channel=`search_${randomUUID().replaceAll('-','').slice(0,10)}`;
 const native={id:randomUUID(),channel,title:'¿Gana este intento?',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,winningOutcome:null,outcomes:[{id:'yes',title:'Sí',color:'BLUE',totalPoints:100,totalUsers:2},{id:'no',title:'No',color:'PINK',totalPoints:200,totalUsers:3}]};
 await writeFile('test-results/twitch-fixture.json',JSON.stringify([native]));await writeFile('test-results/byte-fixture.json',JSON.stringify({markets:[],signatures:{},broadcasts:0,resolutions:0,invalidations:0,syncs:0}));
 const profile=await mkdtemp(`${tmpdir()}/plot-search-`),extension=resolve(profile,'extension');await cp('extension',extension,{recursive:true});
 for(const name of ['background.js','popup.js','app-config.js']){const file=resolve(extension,name);await writeFile(file,(await readFile(file,'utf8')).replaceAll('http://twitch-predict.localhost:1356',base));}
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const panel=await context.newPage();await panel.goto(base);await panel.getByRole('button',{name:'Vincular extensión',exact:true}).click();await expect(panel.getByText('Extensión vinculada.',{exact:false})).toBeVisible();
  const popup=await context.newPage();await popup.setViewportSize({width:700,height:600});await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.getByRole('combobox',{name:'Canal de Twitch'})).toHaveCount(0);
  await popup.getByRole('button',{name:'Buscar canal',exact:true}).click();const input=popup.getByRole('searchbox',{name:'Canal de Twitch',exact:true});await expect(input).toBeFocused();
  await input.fill('https://evil.example/streamer');await input.press('Enter');await expect(popup.getByText('Pegá el enlace de un canal de Twitch.')).toBeVisible();
  await input.fill('search_');const suggestion=popup.getByRole('option',{name:new RegExp(channel)});await expect(suggestion).toBeVisible();await suggestion.click();await expect(popup.getByRole('heading',{name:native.title,exact:true})).toBeVisible({timeout:20000});
  await expect(popup.getByRole('search',{name:'Canal de Twitch'})).toHaveAttribute('aria-busy','false');await input.fill(`https://www.twitch.tv/${channel}`);await input.press('Enter');
  await expect(popup.locator('.channel-current')).toHaveText('@'+channel);
  await expect(popup.getByRole('search',{name:'Canal de Twitch'})).toHaveAttribute('aria-busy','false');
  const field=(await input.boundingBox())!,close=(await popup.getByRole('button',{name:'Cerrar búsqueda',exact:true}).boundingBox())!;expect(field.x+field.width).toBeLessThanOrEqual(close.x);
  await input.press('Escape');await expect(input).toHaveCount(0);await expect(popup.getByRole('button',{name:'Buscar canal',exact:true})).toBeFocused();
  await popup.getByRole('button',{name:'Actualizar predicción',exact:true}).click();await expect(popup.getByRole('button',{name:'Actualizar predicción',exact:true})).toBeEnabled();
  expect(JSON.parse(await readFile('test-results/byte-fixture.json','utf8')).markets).toHaveLength(1);
  await popup.screenshot({path:'test-results/extension-channel-search.png',fullPage:true});
  await popup.emulateMedia({reducedMotion:'reduce'});await popup.getByRole('button',{name:'Buscar canal',exact:true}).click();await expect(input).toBeFocused();await input.press('Escape');
 }finally{await context.close();await rm(profile,{recursive:true,force:true});await writeFile('test-results/twitch-fixture.json','[]');}
});
