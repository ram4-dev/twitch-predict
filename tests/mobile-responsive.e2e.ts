import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({viewport:{width:360,height:800},isMobile:true,hasTouch:true});
test('touch landing previews a prediction and joins the waitlist',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Elegir gana',exact:true}).tap();await expect(page.getByLabel('Predicción de ejemplo').getByRole('status')).toContainText('Elegiste gana');await page.getByRole('textbox',{name:'Sumate a la waitlist'}).fill(`mobile-${randomUUID()}@example.com`);await page.getByRole('button',{name:'Anotarme en la waitlist'}).tap();await expect(page.getByRole('form',{name:'Lista de espera'}).getByRole('status')).toContainText('Ya estás en la lista');
});
test('mobile profile and inline search replace streamer and channel pages',async({page})=>{
 await page.goto('/mobile-preview.html');const nav=page.getByRole('navigation',{name:'Secciones'});await expect(nav.getByRole('button')).toHaveCount(2);await expect(page.getByRole('combobox',{name:'Buscar streamer'})).toHaveCount(1);await nav.getByRole('button',{name:'Mi perfil',exact:true}).tap();await expect(page.locator('.phone-profile-stats')).toBeVisible();await nav.getByRole('button',{name:'Mis apuestas',exact:true}).tap();await expect(page.locator('.phone-feed')).toBeVisible();
 for(const width of [320,360,390,700,768,1024,1440]){await page.setViewportSize({width,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);for(const button of await nav.getByRole('button').all()){const bounds=(await button.boundingBox())!;expect(bounds.height).toBeGreaterThanOrEqual(44);}}
});
test('onboarding and landing fit all content breakpoints',async({page})=>{for(const path of ['/','/onboarding','/onboarding?streamer=1']){await page.goto(path);for(const width of [320,360,390,700,768,1024,1440]){await page.setViewportSize({width,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}});
