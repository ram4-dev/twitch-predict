import {test,expect} from '@playwright/test';

test('direct Chrome Web Store policy URL serves the policy without authentication',async({page})=>{
  const response=await page.goto('/privacy.html');
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe('/privacy.html');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Privacidad de plot BETA');
  await expect(page.getByRole('heading',{name:'Datos que usamos'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Conservación y eliminación'})).toBeVisible();
  await expect(page.getByRole('link',{name:'ramirocarnicersouble8@gmail.com'})).toHaveAttribute('href','mailto:ramirocarnicersouble8@gmail.com');
  for(const width of [360,1280]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('link',{name:'Ayuda de la beta'}).click();
  await expect(page).toHaveURL(/\/beta.html$/);
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
});
