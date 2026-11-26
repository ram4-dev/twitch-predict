import {test,expect} from '@playwright/test';
import {phantomProvider} from './fixtures/phantom.js';
for(const device of ['iPhone','Android'])test(`${device}: viewer and streamer open Phantom with only their public role`,async({browser})=>{
  const context=await browser.newContext({userAgent:device==='iPhone'?'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1':'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36',viewport:{width:390,height:844}});
  try{const page=await context.newPage();for(const streamer of [false,true]){
    await page.goto(`/app?${streamer?'streamer=1&':''}token=private&code=private`);
    const link=page.getByRole('link',{name:'Abrir en Phantom',exact:true});await expect(link).toBeVisible();
    const origin=new URL(page.url()).origin,target=`${origin}/app${streamer?'?streamer=1':''}`;
    const expected=`https://phantom.com/ul/browse/${encodeURIComponent(target)}?ref=${encodeURIComponent(origin)}`;
    await expect(link).toHaveAttribute('href',expected);await expect(link).not.toHaveAttribute('target','_blank');
    await page.route('https://phantom.com/ul/browse/**',route=>route.fulfill({contentType:'text/html',body:'Phantom handoff'}));
    await link.click();await expect(page).toHaveURL(expected);
  }}finally{await context.close();}
});
test('an injected mobile wallet connects directly without a Phantom browser loop',async({browser})=>{
  const context=await browser.newContext({userAgent:'iPhone Mobile',viewport:{width:390,height:844}});
  try{const page=await context.newPage();await phantomProvider(page);await page.goto('/app#profile');
    await expect(page.getByRole('link',{name:'Abrir en Phantom'})).toHaveCount(0);
    await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();
    await expect(page.getByRole('button',{name:'Conectar Phantom',exact:true})).toHaveCount(0);
    // Signing in lands on the feed with a live session, never on a Phantom browser loop.
    await expect(page.locator('#own-balance')).toContainText('10.000');
  }finally{await context.close();}
});
