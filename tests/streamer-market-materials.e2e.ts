import {test,expect,type Locator} from '@playwright/test';
import {demoSnapshot,type AppMarket} from '../src/ui/mobile-app-data.js';

const glass=(el:Locator)=>el.evaluate(e=>({radius:getComputedStyle(e).borderRadius,background:getComputedStyle(e).backgroundColor,tint:getComputedStyle(e.querySelector('[data-slot=liquid-glass-tint]')!).backgroundColor,backdrop:getComputedStyle(e.querySelector('[data-slot=liquid-glass-backdrop]')!).backdropFilter}));

test('all streamer market phases share proposal glass, result frames and action materials without writes',async({page})=>{
 const data=demoSnapshot(),account=data.account!;account.streamerChannels=['ramitapai'];account.bets=[];
 const phases=['open','locked','resolved','void'] as const;
 const markets=phases.map(phase=>{
  const market:AppMarket=structuredClone(data.markets[0]);market.key=`material-${phase}`;market.phase=phase;market.source='plot';market.canBet=phase==='open';market.winnerId=phase==='resolved'?'yes':undefined;market.prediction.title=`¿Gana la próxima partida? · ${phase}`;
  if(phase==='void')market.reason='No hubo apuestas a la opción ganadora. Todas las apuestas fueron reembolsadas.';
  return market;
 });
 const writes:string[]=[],errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('pointsToken','market-materials-fixture'));
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;if(route.request().method()!=='GET')writes.push(path);
  return route.fulfill({json:path==='/api/points/me'?account:path==='/api/markets'?markets:path==='/api/streamer/console'?{channels:['ramitapai'],markets}:path==='/api/channels'?{channels:['ramitapai']}:path.startsWith('/api/proposals/channels/')?{proposals:[{id:'proposal-frame',shortId:'P1',channelId:'ramitapai',status:'accepted',acceptedMarketId:'material-resolved',input:{title:'¿Gana la próxima partida?',options:['Sí','No'],durationSeconds:120},createdAt:'2026-11-11T18:10:00Z'}]}:[]});
 });
 await page.goto('/app');await expect(page.locator('[data-streamer-key]')).toHaveCount(4);
 await page.getByRole('button',{name:'Propuestas',exact:true}).click();const proposal=page.locator('.proposal-card');await expect(proposal).toBeVisible();const proposalGlass=await glass(proposal);
 const positive=await proposal.locator('.liquid-metal-surface[data-tone=positive]').evaluate(e=>getComputedStyle(e).backgroundImage);
 await page.getByRole('button',{name:'Mercados',exact:true}).click();
 for(const phase of phases){
  const card=page.locator(`[data-streamer-key="material-${phase}"]`),shell=card.locator('.phone-market');
  await expect(shell).toHaveAttribute('data-slot','liquid-glass');expect(await glass(shell)).toEqual(proposalGlass);
  const state=card.getByRole('status',{name:'Estado del mercado'});await expect(state.locator('.liquid-metal-surface')).toHaveCount(1);await expect(state).toHaveCSS('border-radius','8px');
  if(phase==='open'||phase==='resolved')await expect(state.locator('.liquid-metal-surface')).toHaveCSS('background-image',positive);
  for(const width of [360,700,1440]){
   await page.setViewportSize({width,height:width===700?600:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
   await shell.screenshot({path:`test-results/streamer-material-${phase}-${width}.png`,animations:'disabled'});
  }
  if(phase==='void')await expect(card.locator('.resolution-reason')).toHaveCSS('margin-top','14px');
  if(phase==='resolved'||phase==='void'){
   await expect(card.locator('.plot-resolution')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(card.locator('.plot-resolution h3')).toHaveCSS('font-family',/Fraunces/);await expect(card.getByRole('region',{name:'Ganancia del streamer'})).toContainText('0pts');
   await expect(card.getByRole('button',{name:/Elegir ganador|Revisar resultado/})).toHaveCount(0);
  }
 }
 const open=page.locator('[data-streamer-key="material-open"]');await expect(open.getByRole('button',{name:'Cerrar apuestas',exact:true}).locator('.liquid-metal-surface')).toHaveCount(1);await expect(open.getByRole('button',{name:'Elegir ganador: Sí',exact:true})).toBeDisabled();
 const locked=page.locator('[data-streamer-key="material-locked"]');await locked.getByRole('button',{name:'Elegir ganador: No',exact:true}).click();await expect(locked.getByRole('button',{name:'Revisar resultado',exact:true})).toHaveAttribute('data-tone','positive');await expect(locked.getByRole('button',{name:'Revisar resultado',exact:true}).locator('.liquid-metal-surface')).toHaveCount(1);await expect(locked.getByRole('button',{name:'Cancelar y reembolsar',exact:true})).toHaveAttribute('data-tone','negative');
 await page.emulateMedia({reducedMotion:'reduce'});for(const material of await page.locator('.manager-market-state .liquid-metal-surface').all())await expect(material).toHaveCSS('animation-name','none');
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});
