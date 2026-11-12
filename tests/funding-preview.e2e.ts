import {test,expect} from '@playwright/test';
// Run on the PVE host with APP_URL set to the deployed HTTPS preview.
// Only identity/history are browser fixtures. Config and pricing use the live backend.
// No test account, wallet signature, order or transfer is created on the shared preview.
test.skip(process.env.PVE_FUNDING_SMOKE!=='true','Explicit live PVE read-only checkout check');
for(const currency of ['USDC','SOL'])test(`live PVE package price in ${currency} while payments are disabled`,async({page,request})=>{
  const config=await(await request.get('/api/funding/config')).json();expect(config.enabled).toBe(false);
  await page.addInitScript(()=>localStorage.setItem('pointsToken','read-only-ui-fixture'));
  const account={id:'read-only-fixture',name:'PVE UI check',wallet:null,twitch:{id:'read-only-fixture',login:'preview_check',displayName:'Preview check'},google:null,balance:10000,startingPoints:10000,claimable:0,streamerEarnings:0,streamerChannels:[],ledger:[],bets:[]};
  await page.route('**/api/points/me',route=>route.fulfill({json:account}));
  await page.route('**/api/funding/orders',route=>route.fulfill({json:[]}));
  const transactions:string[]=[];
  page.on('request',req=>{if(/\/api\/funding\/(quote|submit)$/.test(req.url()))transactions.push(req.url());});
  await page.goto('/app#balance');
  await page.getByRole('radio',{name:'5.000 puntos 5 USDC',exact:true}).check();
  await page.getByRole('radio',{name:currency,exact:true}).check();
  const button=page.getByRole('button',{name:'Ver cotización',exact:true});await expect(button).toBeEnabled();
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/funding/estimate')&&r.request().method()==='POST');
  await button.click();const response=await responsePromise;expect(response.status()).toBe(200);
  const estimate=await response.json();expect(estimate.points).toBe(5000);expect(estimate.currency).toBe(currency);expect(BigInt(estimate.units)>0n).toBe(true);expect(estimate.transaction).toBeUndefined();expect(estimate.id).toBeUndefined();
  const quote=page.getByRole('region',{name:'Cotización',exact:true});await expect(quote).toBeVisible();await expect(quote).toContainText('5.000');await expect(quote).toContainText(config.reason);
  await expect(quote.getByRole('button',{name:/Confirmar/})).toHaveCount(0);expect(transactions).toEqual([]);
  if(currency==='USDC')expect(estimate.units).toBe('5000000');
  else expect(Number(estimate.solPrice)).toBeGreaterThan(0);
  await page.setViewportSize({width:360,height:600});await quote.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/pve-quote-${currency}.png`});
});
