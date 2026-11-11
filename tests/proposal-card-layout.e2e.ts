import {test,expect} from '@playwright/test';
import {demoSnapshot} from '../src/ui/mobile-app-data.js';
import type {ProposalItem} from '../src/ui/proposals-client.js';

test('proposal panels use shared typography, colored status and animated rims with direct publish/reject actions',async({page})=>{
 const {account,markets}=demoSnapshot();account!.streamerChannels=['ramitapai'];
 const make=(status:ProposalItem['status'],i:number):ProposalItem=>({id:`proposal-${i}`,shortId:`P${i}`,channelId:'ramitapai',status,input:{title:`¿Gana la próxima partida? ${i}`,options:['Gana','Pierde'],durationSeconds:120},createdAt:'2026-11-11T18:10:00.000Z'});
 const proposals=[make('pending',1),make('accepted',2),make('rejected',3),make('withdrawn',4),make('pending',5)];
 proposals[1].acceptedMarketId='market-existing';proposals[2].rejectionReason='Ya hay una propuesta similar.';
 proposals[4].input.options=['Una opción con un nombre largo para verificar el espacio','Otra opción','Tercera opción'];
 const writes:string[]=[],errors:string[]=[];let failAccept=true;
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('pointsToken','proposal-style-fixture'));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()==='POST'){
   writes.push(path);
   if(path==='/api/proposals/proposal-1/accept'&&failAccept){failAccept=false;return route.fulfill({status:503,json:{error:'No se pudo publicar. Intentá de nuevo.'}});}
   const id=path.split('/')[3],item=proposals.find(p=>p.id===id);
   if(item){item.status=path.endsWith('/accept')?'accepted':'rejected';if(item.status==='accepted')item.acceptedMarketId='market-published';}
   return route.fulfill({json:item??{}});
  }
  return route.fulfill({json:path==='/api/points/me'?account:path==='/api/markets'?markets:path==='/api/streamer/console'?{channels:['ramitapai'],markets:[]}:path==='/api/channels'?{channels:['ramitapai']}:path.startsWith('/api/proposals/channels/')?{proposals}:[]});
 });
 await page.goto('/app');await page.getByRole('button',{name:'Propuestas',exact:true}).click();
 const cards=page.locator('.proposal-card');await expect(cards).toHaveCount(5);
 for(const [status,color] of [['pending','rgb(242, 204, 134)'],['accepted','rgb(145, 228, 181)'],['rejected','rgb(255, 171, 184)'],['withdrawn','rgb(189, 189, 189)']])await expect(cards.locator(`[data-proposal-status="${status}"]`).first()).toHaveCSS('color',color);
 const first=cards.first();await expect(first.locator('h3')).toHaveCSS('font-family',/Fraunces/);await expect(first).toContainText('2 min para apostar');await expect(first.locator('.proposal-options li')).toHaveCount(2);
 for(const width of [360,700,1440]){await page.setViewportSize({width,height:900});for(const [index,status] of [[0,'pending'],[1,'accepted'],[2,'rejected']] as const){if(width===1440&&index>0)continue;await cards.nth(index).screenshot({path:`test-results/proposal-${status}-${width}.png`,animations:'disabled'});}}
 await first.hover();await expect(first.locator('.proposal-card-rim')).toHaveCSS('animation-name','outcome-rim-turn');
 await expect(first.locator('.proposal-card-rim')).toHaveCSS('pointer-events','none');await expect(first.locator('.proposal-card-rim')).toHaveCSS('background-image',/conic-gradient/);
 await first.getByRole('button',{name:'Aceptar y publicar',exact:true}).click();await expect(page.getByRole('status')).toContainText('No se pudo publicar');await expect(first.locator('[data-proposal-status]')).toHaveText('Pendiente');
 await first.getByRole('button',{name:'Aceptar y publicar',exact:true}).focus();await page.keyboard.press('Enter');await expect(first.locator('[data-proposal-status]')).toHaveText('Aceptada');await expect(first).toContainText('Mercado publicado.');await expect(first).not.toContainText('market-published');
 const fifth=cards.nth(4);await fifth.getByRole('button',{name:'Rechazar',exact:true}).click();await expect(fifth.locator('[data-proposal-status]')).toHaveText('Rechazada');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Revisar propuesta',exact:true})).toHaveCount(0);
 expect(writes).toEqual(['/api/proposals/proposal-1/accept','/api/proposals/proposal-1/accept','/api/proposals/proposal-5/reject']);
 for(const width of [360,700,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);for(const card of await cards.all())expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await page.screenshot({path:`test-results/proposal-panels-${width}.png`,fullPage:true});}
 await page.emulateMedia({reducedMotion:'reduce'});await first.hover();await expect(first.locator('.proposal-card-rim')).toHaveCSS('animation-name','none');expect(errors).toEqual([]);
});
