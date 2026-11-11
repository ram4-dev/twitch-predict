import type {Points} from '../points.js';
export type AppMarket=ReturnType<Points['market']>;
export type AppAccount=ReturnType<Points['me']>;
export type AppSnapshot={markets:AppMarket[];account?:AppAccount;followed:string[]};
export type AppTheme='ember'|'pearl'|'jade';
export const appThemes=[{id:'ember',name:'Ember',description:'Vidrio cálido, tarjetas amplias y botones de metal líquido.'},{id:'pearl',name:'Pearl',description:'Plata y negro, filas compactas y controles de vidrio.'},{id:'jade',name:'Jade',description:'Verde mineral, porcentajes grandes y botones con reflejo.'}] as const;
export const isAppTheme=(value:string|null):value is AppTheme=>appThemes.some(theme=>theme.id===value);
export function demoSnapshot():AppSnapshot{
 const stamp=new Date().toISOString();
 const market=(id:string,channel:string,title:string,pool:number,share:number,options:readonly [string,string]=['Sí','No']):AppMarket=>({key:id,network:'offchain',phase:'open',demo:true,sourceFresh:true,canBet:true,sourceCheckedAt:stamp,createdAt:stamp,updatedAt:stamp,prediction:{id,channel,title,status:'ACTIVE',createdAt:stamp,predictionWindowSeconds:3600,outcomes:[{id:'yes',title:options[0],color:'BLUE',totalPoints:0,totalUsers:0},{id:'no',title:options[1],color:'PINK',totalPoints:0,totalUsers:0}]},totalPoints:pool,totalBets:24,participants:18,outcomes:[{id:'yes',title:options[0],color:'BLUE',points:pool*share/100,bets:14,share},{id:'no',title:options[1],color:'PINK',points:pool*(100-share)/100,bets:10,share:100-share}]});
 const markets=[market('demo-1','ramitapai','¿Gana la próxima partida?',3200,64),market('demo-2','juansguarnizo','¿Quién gana el duelo?',5400,42,['Vitalik','9z']),market('demo-3','ramitapai','¿Cómo termina el reto?',1800,73,['Completa el speedrun','Cae en el jefe final']),market('demo-4','rivers_gg','¿Quién se lleva la serie?',2500,55,['Team Rojo','Team Azul'])];
 const account:AppAccount={id:'preview',name:'@plot_user',wallet:'DemoWallet11111111111111111111111111',twitch:null,google:null,balance:9750,startingPoints:10000,claimable:0,streamerEarnings:0,streamerChannels:[],ledger:[],bets:[{id:'demo-bet',accountId:'preview',marketKey:'demo-1',outcomeId:'yes',amount:250,payout:0,claimed:false,createdAt:stamp,title:markets[0].prediction.title,channel:'ramitapai',outcome:'Sí',phase:'open'}]};
 return {markets,account,followed:['ramitapai','juansguarnizo']};
}

export function applyDemoBet(snapshot:AppSnapshot,market:AppMarket,outcomeId:string,amount:number,id:string):AppSnapshot{
 const account=snapshot.account;if(!account||account.bets.some(b=>b.id===id))return snapshot;
 if(!Number.isSafeInteger(amount)||amount<1||amount>account.balance)throw new Error('Ingresá puntos dentro de tu saldo.');
 const joined=!account.bets.some(b=>b.marketKey===market.key);
 return {...snapshot,markets:snapshot.markets.map(m=>{if(m.key!==market.key)return m;const totalPoints=m.totalPoints+amount;return {...m,totalPoints,totalBets:m.totalBets+1,participants:m.participants+(joined?1:0),outcomes:m.outcomes.map(o=>{const points=o.points+(o.id===outcomeId?amount:0);return {...o,points,bets:o.bets+(o.id===outcomeId?1:0),share:points/totalPoints*100};})};}),account:{...account,balance:account.balance-amount,bets:[...account.bets,{id,accountId:account.id,marketKey:market.key,outcomeId,amount,payout:0,claimed:false,createdAt:new Date().toISOString(),title:market.prediction.title,channel:market.prediction.channel,outcome:market.outcomes.find(o=>o.id===outcomeId)?.title,phase:market.phase}]}};
}
