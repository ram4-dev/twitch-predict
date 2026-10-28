import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';

test('landing uses current balloon artwork and previews a prediction locally',async({page})=>{
  const errors:string[]=[];const writes:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.method()==='POST')writes.push(request.url());});
  await page.goto('/landing');
  await expect(page.getByRole('heading',{level:1})).toHaveText('El stream juega.Vos elegís.');
  await expect(page.locator('.plot-balloon-wordmark')).toHaveAttribute('data-renderer','balloon');
  await expect(page.locator('.plot-latex-field')).toHaveAttribute('data-ready','true');
  await expect(page.getByRole('img',{name:'Plot!',exact:true})).toHaveCount(3);
  await expect(page.locator('.plot-halftone,.plot-o')).toHaveCount(0);
  const preview=page.getByLabel('Predicción de ejemplo');
  await expect(preview).toContainText('10.000');
  await preview.getByRole('button',{name:'Elegir gana',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(preview.getByRole('status')).toHaveText('Elegiste gana. Así se ve tu jugada.');
  await expect(preview).toContainText('9.750');await expect(preview).toContainText('1.250');await expect(preview).toContainText('68%');
  await preview.getByRole('button',{name:'Elegir pierde',exact:true}).click();
  await expect(preview.getByRole('status')).toContainText('Elegiste pierde');await expect(preview).toContainText('52%');await expect(preview).toContainText('9.750');
  await preview.getByRole('button',{name:'Reiniciar ejemplo'}).click();await expect(preview).toContainText('10.000');
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:1000});
    await expect(page.getByRole('heading',{level:1})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/landing-${width}.png`,fullPage:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.plot-balloon-wordmark')).toHaveAttribute('data-renderer','image');
  await expect(page.locator('.plot-latex-field')).toHaveAttribute('data-reduced','true');
  expect(writes).toEqual([]);expect(errors).toEqual([]);
  await expect(page.getByRole('link',{name:'Entrar a la waitlist'})).toHaveCount(2);
  await expect(page.getByRole('textbox',{name:'Sumate a la waitlist'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Anotarme en la waitlist'})).toBeEnabled();
  await expect(page.getByRole('link',{name:'Abrir app'})).toHaveCount(0);
});
test('waitlist saves a real email, accepts duplicates and reports failures without claiming success',async({page})=>{
  await page.goto('/landing');
  const form=page.getByRole('form',{name:'Lista de espera'}),email=`viewer-${randomUUID()}@example.com`;
  const input=form.getByRole('textbox',{name:'Sumate a la waitlist'});
  await input.fill('not-an-email');await form.getByRole('button',{name:'Anotarme en la waitlist'}).click();
  expect(await input.evaluate(el=>(el as HTMLInputElement).validity.valid)).toBe(false);
  await input.fill(email);await input.press('Enter');
  await expect(form.getByRole('status')).toHaveText('Ya estás en la lista. Te avisamos cuando puedas entrar.');
  const duplicate=await page.request.post('/api/waitlist',{data:{email:email.toUpperCase()}});expect(duplicate.status()).toBe(200);expect(await duplicate.json()).toEqual({ok:true});
  const invalid=await page.request.post('/api/waitlist',{data:{email:'invalid'}});expect(invalid.status()).toBe(400);
  const crossOrigin=await page.request.post('/api/waitlist',{headers:{Origin:'https://elsewhere.example'},data:{email}});expect(crossOrigin.status()).toBe(403);
  expect((await page.request.get('/api/waitlist')).status()).toBe(401);
  await page.reload();
  await page.route('**/api/waitlist',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'No pudimos guardar tu email. Intentá de nuevo.'})}));
  await input.fill(email);await form.getByRole('button',{name:'Anotarme en la waitlist'}).click();
  await expect(form.getByRole('alert')).toHaveText('No pudimos guardar tu email. Intentá de nuevo.');await expect(input).toHaveValue(email);
  await page.unroute('**/api/waitlist');await form.getByRole('button',{name:'Anotarme en la waitlist'}).click();
  await expect(form.getByRole('status')).toContainText('Ya estás en la lista.');
});
test('waitlist registration also works without JavaScript',async({browser,baseURL})=>{
  const context=await browser.newContext({javaScriptEnabled:false});
  try{
    const page=await context.newPage();await page.goto(`${baseURL}/landing`);
    await expect(page.locator('.landing-fallback')).toBeVisible();
    await page.getByRole('textbox',{name:'Sumate a la waitlist'}).fill(`native-${randomUUID()}@example.com`);
    await page.locator('.landing-fallback button').click();
    await expect(page).toHaveURL(/\/waitlist-success\.html$/);await expect(page.getByRole('heading',{name:'Ya estás en la lista'})).toBeVisible();
  }finally{await context.close();}
});
