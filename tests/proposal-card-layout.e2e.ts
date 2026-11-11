import {test,expect} from '@playwright/test';
import {demoSnapshot} from '../src/ui/mobile-app-data.js';
import type {ProposalItem} from '../src/ui/proposals-client.js';

test('proposal panels reuse active-market glass and liquid-metal materials with direct publish/reject actions',async({page})=>{
 const {account,markets}=demoSnapshot();account!.streamerChannels=['ramitapai'];markets[0].source='plot';
 const make=(status:ProposalItem['status'],i:number):ProposalItem=>({id:`proposal-${i}`,shortId:`P${i}`,channelId:'ramitapai',status,input:{title:`¿Gana la próxima partida? ${i}`,options:['Gana','Pierde'],durationSeconds:120},createdAt:new Date(Date.UTC(2026,10,11,18,i)).toISOString()});
 const proposals=[make('pending',1),make('accepted',2),make('rejected',3),make('withdrawn',4),make('pending',5)];
 proposals[1].acceptedMarketId='market-existing';proposals[2].rejectionReason='Ya hay una propuesta similar.';
 proposals[4].input.options=['Una opción con un nombre largo para verificar el espacio','Otra opción','Tercera opción'];
 const writes:string[]=[],errors:string[]=[];let failAccept=true,failNextLoad=false;
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('pointsToken','proposal-style-fixture'));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()==='POST'){
   writes.push(path);
   if(path==='/api/proposals/proposal-1/accept'&&failAccept){failAccept=false;return route.fulfill({status:503,json:{error:'No se pudo publicar. Intentá de nuevo.'}});}
   const id=path.split('/')[3],item=proposals.find(p=>p.id===id);
   if(item){item.status=path.endsWith('/accept')?'accepted':'rejected';if(item.status==='accepted'){item.acceptedMarketId='market-published';failNextLoad=true;}}
   return route.fulfill({json:item??{}});
  }
  if(path.startsWith('/api/proposals/channels/')&&failNextLoad){failNextLoad=false;return route.fulfill({status:503,json:{error:'No se pudo actualizar la bandeja.'}});}
  return route.fulfill({json:path==='/api/points/me'?account:path==='/api/markets'?markets:path==='/api/streamer/console'?{channels:['ramitapai'],markets:[markets[0]]}:path==='/api/channels'?{channels:['ramitapai']}:path.startsWith('/api/proposals/channels/')?{proposals}:[]});
 });
 await page.goto('/app');
 const market=page.locator('.phone-manager .phone-market');await expect(market).toBeVisible();
 const surface=async(el:import('@playwright/test').Locator)=>el.evaluate(e=>({radius:getComputedStyle(e).borderRadius,background:getComputedStyle(e).backgroundColor,tint:getComputedStyle(e.querySelector('[data-slot=liquid-glass-tint]')!).backgroundColor,backdrop:getComputedStyle(e.querySelector('[data-slot=liquid-glass-backdrop]')!).backdropFilter}));
 const activeSurface=await surface(market);
 const optionRadius=await market.locator('.phone-outcome').first().evaluate(e=>getComputedStyle(e).borderRadius);
 const optionMaterials=await market.locator('.phone-outcome .liquid-metal-surface').evaluateAll(nodes=>nodes.map(e=>getComputedStyle(e).backgroundImage));expect(optionMaterials).toHaveLength(2);
 await page.getByRole('button',{name:'Propuestas',exact:true}).click();
 const cards=page.locator('.proposal-card');await expect(cards).toHaveCount(2);
 expect(await cards.evaluateAll(nodes=>nodes.map(e=>e.getAttribute('data-proposal-id')))).toEqual(['proposal-5','proposal-1']);
 await expect(cards.locator('[data-proposal-status="pending"]').first()).toHaveCSS('color','rgb(242, 204, 134)');
 await expect(page.locator('[data-proposal-status="accepted"],[data-proposal-status="rejected"],[data-proposal-status="withdrawn"]')).toHaveCount(0);
 const first=page.locator('[data-proposal-id="proposal-1"]');expect(await surface(first)).toEqual(activeSurface);
 await expect(first.locator('.proposal-options li').first()).toHaveCSS('border-radius',optionRadius);
 expect(await first.locator('.proposal-options .liquid-metal-surface').evaluateAll(nodes=>nodes.map(e=>getComputedStyle(e).backgroundImage))).toEqual(optionMaterials);
 for(const [name,tone] of [['Aceptar y publicar','positive'],['Rechazar','negative']]){const button=first.getByRole('button',{name,exact:true});await expect(button).toHaveAttribute('data-tone',tone);await expect(button.locator('.liquid-metal-surface')).toHaveCount(1);}
await expect(first.locator('h3')).toHaveCSS('font-family',/Fraunces/);await expect(first).toContainText('2 min para apostar');await expect(first.locator('.proposal-options li')).toHaveCount(2);
 for(const width of [360,700,1440]){await page.setViewportSize({width,height:900});await cards.first().screenshot({path:`test-results/proposal-pending-${width}.png`,animations:'disabled'});}
 await expect(first.locator('.proposal-options .liquid-metal-surface').first()).toHaveCSS('animation-name','outcome-rim');
 await first.getByRole('button',{name:'Aceptar y publicar',exact:true}).click();await expect(page.getByRole('status')).toContainText('No se pudo publicar');await expect(first.locator('[data-proposal-status]')).toHaveText('Pendiente');
 await first.getByRole('button',{name:'Aceptar y publicar',exact:true}).focus();await page.keyboard.press('Enter');await expect(first).toHaveCount(0);await expect(page.getByRole('status')).toContainText('Propuesta aceptada y mercado publicado.');await expect(page.getByRole('alert')).toContainText('No se pudo actualizar');await page.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(cards).toHaveCount(1);
 const fifth=page.locator('[data-proposal-id="proposal-5"]');await fifth.getByRole('button',{name:'Rechazar',exact:true}).click();await expect(fifth).toHaveCount(0);await expect(page.getByText('No hay propuestas pendientes para este canal.',{exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Revisar propuesta',exact:true})).toHaveCount(0);
 expect(writes).toEqual(['/api/proposals/proposal-1/accept','/api/proposals/proposal-1/accept','/api/proposals/proposal-5/reject']);
 await page.reload();await page.getByRole('button',{name:'Propuestas',exact:true}).click();await expect(cards).toHaveCount(0);await expect(page.getByText('No hay propuestas pendientes para este canal.',{exact:true})).toBeVisible();
 proposals.push(make('pending',7),make('pending',8));await expect(cards).toHaveCount(2,{timeout:8000});expect(await cards.evaluateAll(nodes=>nodes.map(e=>e.getAttribute('data-proposal-id')))).toEqual(['proposal-8','proposal-7']);
 for(const width of [360,700,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);for(const card of await cards.all())expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await page.screenshot({path:`test-results/proposal-panels-${width}.png`,fullPage:true});}
 await page.emulateMedia({reducedMotion:'reduce'});await cards.first().hover();await expect(cards.first().locator('.proposal-options .liquid-metal-surface').first()).toHaveCSS('animation-name','none');expect(errors).toEqual([]);
});
