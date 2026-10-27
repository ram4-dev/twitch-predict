import {test,expect} from '@playwright/test';

test.skip(process.env.E2E_MARKET_MODE!=='byte','Requires Byte fixture server');
test('SSE invalidates the market list after a market is created',async({page,baseURL})=>{
 const abort=new AbortController();const response=await fetch(`${baseURL}/api/live/markets`,{signal:abort.signal});expect(response.status).toBe(200);
 const reader=response.body!.getReader(),decoder=new TextDecoder();let text='';
 const read=async(event:string)=>{while(!text.includes(`event: ${event}\n`)){const chunk=await reader.read();if(chunk.done)throw new Error('stream closed');text+=decoder.decode(chunk.value,{stream:true});}};
 try{
  await read('ready');const viewer=await page.context().newPage();await viewer.goto('/byte');await expect(viewer.getByRole('heading',{name:'Evento en vivo',exact:true})).toHaveCount(0);await page.goto('/byte');await page.getByRole('button',{name:'Operador',exact:true}).click();
  await page.getByLabel('Canal de Twitch',{exact:true}).fill('live_fixture');await page.getByLabel('Pregunta',{exact:true}).fill('Evento en vivo');
  await page.getByLabel('Reglas de resolución',{exact:true}).fill('El resultado final debe coincidir con la transmisión.');
  await page.getByRole('button',{name:'Crear mercado en devnet',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Evento en vivo',exact:true})).toBeVisible();
  await Promise.race([read('markets'),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('missing SSE market event')),5000))]);await expect(viewer.getByRole('heading',{name:'Evento en vivo',exact:true})).toBeVisible({timeout:5000});await viewer.close();
 }finally{abort.abort();await reader.cancel().catch(()=>{});}
});

test('market polling continues when the event stream is unavailable',async({page})=>{
 let reads=0;await page.route('**/api/live/markets',route=>route.abort());
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/byte/markets')reads++;});
 await page.goto('/byte');await expect.poll(()=>reads,{timeout:10000}).toBeGreaterThanOrEqual(2);
});
