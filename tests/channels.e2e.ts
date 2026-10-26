import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const fixture=resolve('test-results/twitch-fixture.json');
test.skip(process.env.MARKET_MODE==='solana','Offchain streamer following');
test('add @streamer without a wallet, show Twitch data and errors, persist and remove the channel',async({page})=>{
  const channel='followed_streamer_fixture';
  const prediction={id:'followed-prediction',channel,title:'Predicción real del canal seguido',status:'ACTIVE',createdAt:new Date().toISOString(),predictionWindowSeconds:600,outcomes:[{id:'yes',title:'Sí',totalPoints:100,totalUsers:1},{id:'no',title:'No',totalPoints:200,totalUsers:2}]};
  await writeFile(fixture,JSON.stringify([prediction]));
  try{
    await page.goto('/#streamer');await expect(page.locator('#account-name')).toHaveText('Conectá Phantom');
    await page.getByLabel('Canal de Twitch',{exact:true}).fill('@Followed_Streamer_Fixture');await page.getByRole('button',{name:'Agregar streamer',exact:true}).click();
    const row=page.locator(`[data-channel="${channel}"]`);await expect(row).toContainText('En vivo');await expect(row).toContainText('Stream de prueba');await expect(row).toContainText('1.234 espectadores');await expect(row).toContainText('1 predicción en curso');await expect(row).toContainText('Última consulta:');await expect(page.locator('#watch-feedback')).toContainText(`@${channel} agregado`);
    await page.reload();await expect(row).toBeVisible();await row.getByRole('link',{name:'Ver predicciones →',exact:true}).click();await expect(page.locator(`[data-key="offchain:${channel}:${prediction.id}"]`)).toContainText(prediction.title);
    await page.goto('/#streamer');await page.getByLabel('Canal de Twitch',{exact:true}).fill('@offline_streamer_fixture');await page.getByRole('button',{name:'Agregar streamer',exact:true}).click();const offline=page.locator('[data-channel="offline_streamer_fixture"]');await expect(offline).toContainText('Fuera de línea');await expect(offline).toContainText('Sin predicciones en curso');await expect(offline).not.toContainText('espectadores');
    await page.getByLabel('Canal de Twitch',{exact:true}).fill('@missing_streamer_fixture');await page.getByRole('button',{name:'Agregar streamer',exact:true}).click();await expect(page.locator('#watch-feedback')).toContainText('El canal no existe en Twitch');await expect(page.locator('[data-channel="missing_streamer_fixture"]')).toHaveCount(0);await expect(page.getByRole('button',{name:'Agregar streamer',exact:true})).toBeEnabled();
    await writeFile(fixture,JSON.stringify([{channel,sourceError:true}]));await expect(row).toContainText('Error al consultar',{timeout:15000});await expect(row).toContainText('Twitch HTTP 503');await expect(row.locator('.streamer-status')).not.toHaveText('En vivo');
    await writeFile(fixture,JSON.stringify([prediction]));await expect(row.locator('.streamer-status')).toHaveText('En vivo',{timeout:15000});await expect(row.locator('.streamer-error')).toHaveCount(0);
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await row.getByRole('button',{name:`Dejar de seguir @${channel}`,exact:true}).click();await expect(row).toHaveCount(0);await offline.getByRole('button',{name:'Dejar de seguir @offline_streamer_fixture',exact:true}).click();await expect(offline).toHaveCount(0);await page.reload();await expect(row).toHaveCount(0);
  }finally{await writeFile(fixture,'[]');}
});
