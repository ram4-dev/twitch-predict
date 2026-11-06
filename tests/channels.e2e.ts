import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const fixture=resolve('test-results/twitch-fixture.json');
test.skip(process.env.MARKET_MODE==='solana','Offchain streamer following');
test('one search follows a streamer, shows their real market and retains the filter after reload',async({page})=>{
 const channel='followed_streamer_fixture';
 const prediction={id:'followed-prediction',channel,title:'Predicción real del canal seguido',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,outcomes:[{id:'yes',title:'Sí',totalPoints:100,totalUsers:1},{id:'no',title:'No',totalPoints:200,totalUsers:2}]};
 await writeFile(fixture,JSON.stringify([prediction]));
 await page.route('**/api/twitch/search?*',route=>{const q=new URL(route.request().url()).searchParams.get('q')??'';return route.fulfill({json:{channels:[{login:q,displayName:q,live:true}]}});});
 try{
  await page.goto('/app');const search=page.getByRole('combobox',{name:'Buscar streamer'});await search.fill(channel);await page.getByRole('button',{name:`Seguir a ${channel}`,exact:true}).click();
  const card=page.locator(`[data-key="offchain:${channel}:${prediction.id}"]`);await expect(card).toContainText(prediction.title);await expect(search).toHaveValue(`@${channel}`);
  await page.reload();await expect(card).toBeVisible();await expect(search).toHaveValue(`@${channel}`);
  await page.getByRole('button',{name:'Limpiar búsqueda'}).click();await search.fill('missing_streamer_fixture');await page.getByRole('button',{name:'Seguir a missing_streamer_fixture',exact:true}).click();await expect(page.getByRole('status')).toContainText('El canal no existe en Twitch');await expect(page.getByRole('button',{name:'Seguir a missing_streamer_fixture',exact:true})).toBeEnabled();
  await page.setViewportSize({width:360,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await writeFile(fixture,'[]');}
});
