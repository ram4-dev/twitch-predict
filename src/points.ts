import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closesAt, predictionSchema, type Prediction } from './prediction.js';

export const STARTING_POINTS = 10_000;
export const SOURCE_MAX_AGE = 30_000;
export type TwitchIdentity = {id:string;login:string;displayName:string;linkedAt:string};
type Account = { id:string; name:string; tokenHash:string; wallet?:string; twitch?:TwitchIdentity; balance:number; createdAt:string };
type Bet = { id:string; accountId:string; wallet?:string; marketKey:string; outcomeId:string; amount:number; payout:number; claimed:boolean; creditedAt?:string; creditMethod?:'claim'|'distribution'; createdAt:string };
type Settlement = { source:'twitch'|'streamer'|'demo'; at:string; wallet?:string; distributedAt?:string; distributedBy?:string };
type Market = { key:string; prediction:Prediction; phase:'open'|'locked'|'resolved'|'void'; winnerId?:string; reason?:string; sourceCheckedAt:string; createdAt:string; updatedAt:string; demo:boolean; operatorLockedAt?:string; operatorLockedBy?:string; settlement?:Settlement };
type Receipt = { fingerprint:string; result:unknown };
type LedgerEntry = { id:string; accountId:string; kind:'welcome'|'bet'|'claim'|'distribution'; delta:number; balance:number; marketKey?:string; createdAt:string };
type Streamer = { channel:string; wallet:string; assignedAt:string; twitchId?:string };
type State = { version:1; accounts:Record<string,Account>; markets:Record<string,Market>; bets:Bet[]; receipts:Record<string,Receipt>; ledger:LedgerEntry[]; channels:string[]; sessions:Record<string,string>; streamers:Record<string,Streamer> };
export type StreamerAction = { key:string; action:'lock'|'resolve'|'cancel'|'distribute'; winnerId?:string; requestId:string };
const fresh = ():State => ({version:1,accounts:{},markets:{},bets:[],receipts:{},ledger:[],channels:[],sessions:{},streamers:{}});
const hash = (token:string) => createHash('sha256').update(token).digest('hex');
const now = () => new Date().toISOString();
export class Points {
  private state:State = fresh();
  private queue:Promise<unknown> = Promise.resolve();
  constructor(readonly directory:string) {}
  async load() {
    await mkdir(this.directory,{recursive:true,mode:0o700});
    try { this.state=JSON.parse(await readFile(`${this.directory}/points.json`,'utf8')); if(this.state.version!==1) throw new Error('Unsupported points database');this.state.sessions??={};this.state.streamers??={};
      for(const b of this.state.bets)b.wallet??=this.state.accounts[b.accountId]?.wallet;
    }
    catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e; }
  }
  // Every operation commits one atomic snapshot; failed persistence never updates the live state.
  private transaction<T>(work:(draft:State)=>T):Promise<T> {
    const task=this.queue.then(async()=>{
      const draft=structuredClone(this.state);const result=work(draft);
      const file=`${this.directory}/points.json`;
      await writeFile(`${file}.tmp`,JSON.stringify(draft),{mode:0o600});await rename(`${file}.tmp`,file);
      this.state=draft;return result;
    });
    this.queue=task.catch(()=>undefined);return task;
  }
  private account(state:State, token:string) {
    const digest=hash(token);const account=state.accounts[state.sessions[digest]]??Object.values(state.accounts).find(a=>!a.wallet&&a.tokenHash===digest);
    if(!account) throw new Error('Sesión inválida. Volvé a conectar tu cuenta.');return account;
  }
  private ledger(state:State, account:Account, kind:LedgerEntry['kind'], delta:number, marketKey?:string) {
    if(!Number.isSafeInteger(account.balance+delta)||account.balance+delta<0) throw new Error('Saldo insuficiente');
    account.balance+=delta;state.ledger.push({id:randomUUID(),accountId:account.id,kind,delta,balance:account.balance,marketKey,createdAt:now()});
  }
  async createAccount() {
    const token=randomBytes(32).toString('hex');
    return this.transaction(state=>{
      const id=randomUUID();const account:Account={id,name:`Jugador ${id.slice(0,4).toUpperCase()}`,tokenHash:hash(token),balance:0,createdAt:now()};
      state.accounts[id]=account;this.ledger(state,account,'welcome',STARTING_POINTS);
      return {token,account:{id,name:account.name,balance:account.balance}};
    });
  }
  async walletLogin(wallet:string,preferredToken?:string) {
    const token=randomBytes(32).toString('hex');
    return this.transaction(state=>{
      let account=Object.values(state.accounts).find(a=>a.wallet===wallet);
      if(!account&&preferredToken){const preferred=this.account(state,preferredToken);if(!preferred.wallet)account=preferred;}
      if(!account){const id=randomUUID();account={id,name:`Jugador ${id.slice(0,4).toUpperCase()}`,tokenHash:hash(token),balance:0,createdAt:now()};state.accounts[id]=account;this.ledger(state,account,'welcome',STARTING_POINTS);}
      account.wallet=wallet;state.sessions[hash(token)]=account.id;
      for(const bet of state.bets)if(bet.accountId===account.id)bet.wallet??=wallet;
      return {token,account:{id:account.id,wallet,name:account.name,balance:account.balance}};
    });
  }
  me(token:string) {
    const account=this.account(this.state,token);
    const bets=this.state.bets.filter(b=>b.accountId===account.id);
    return {id:account.id,name:account.name,wallet:account.wallet??null,twitch:account.twitch??null,balance:account.balance,startingPoints:STARTING_POINTS,
      bets:bets.map(b=>({...b,title:this.state.markets[b.marketKey].prediction.title,channel:this.state.markets[b.marketKey].prediction.channel,outcome:this.state.markets[b.marketKey].prediction.outcomes.find(o=>o.id===b.outcomeId)?.title,phase:this.state.markets[b.marketKey].phase})),
      claimable:bets.filter(b=>!b.claimed).reduce((sum,b)=>sum+b.payout,0),ledger:this.state.ledger.filter(l=>l.accountId===account.id).slice(-100).reverse().map(l=>({...l,title:l.marketKey?this.state.markets[l.marketKey]?.prediction.title:undefined})),
      streamerChannels:Object.values(this.state.streamers).filter(s=>s.wallet===account.wallet&&((s.twitchId&&s.twitchId===account.twitch?.id)||s.channel==='demo_streamer')).map(s=>s.channel)};
  }
  private view(state:State, m:Market) {
    const bets=state.bets.filter(b=>b.marketKey===m.key);const total=bets.reduce((n,b)=>n+b.amount,0);
    const sourceFresh=m.demo||Date.now()-Date.parse(m.sourceCheckedAt)<SOURCE_MAX_AGE;
    const phase=m.phase==='open'&&closesAt(m.prediction)<=Date.now()?'locked':m.phase;
    return {...m,phase,network:'offchain',canBet:phase==='open'&&m.prediction.status==='ACTIVE'&&closesAt(m.prediction)>Date.now()&&sourceFresh,
      sourceFresh,totalPoints:total,totalBets:bets.length,participants:new Set(bets.map(b=>b.accountId)).size,
      outcomes:m.prediction.outcomes.map(o=>{const own=bets.filter(b=>b.outcomeId===o.id);const points=own.reduce((n,b)=>n+b.amount,0);return {id:o.id,title:o.title,color:o.color,points,bets:own.length,share:total?points/total*100:0};})};
  }
  markets() { return Object.values(this.state.markets).map(m=>this.view(this.state,m)).reverse(); }
  market(key:string) {const m=this.state.markets[key];if(!m)throw new Error('Mercado desconocido');return this.view(this.state,m);}
  channels() {return [...this.state.channels];}
  pendingSources() {return Object.values(this.state.markets).filter(m=>!m.demo&&!['resolved','void'].includes(m.phase)).map(m=>({id:m.prediction.id,channel:m.prediction.channel}));}
  async watch(channel:string) {
    if(!/^[a-zA-Z0-9_]{1,40}$/.test(channel))throw new Error('Canal inválido');
    return this.transaction(s=>{const name=channel.toLowerCase();if(!s.channels.includes(name)){if(s.channels.length>=30)throw new Error('Máximo 30 canales en esta POC');s.channels.push(name);}return s.channels;});
  }
  async unwatch(channel:string) {return this.transaction(s=>{s.channels=s.channels.filter(c=>c!==channel.toLowerCase());return s.channels;});}
  async accept(input:unknown, demo=false) {
    const p=predictionSchema.parse(input);const key=`offchain:${p.channel.toLowerCase()}:${p.id}`;
    return this.transaction(state=>{
      let m=state.markets[key];
      if(m) {
        const original=m.prediction;
        if(m.demo!==demo||original.title!==p.title||original.createdAt!==p.createdAt||original.predictionWindowSeconds!==p.predictionWindowSeconds||original.outcomes.length!==p.outcomes.length||original.outcomes.some((o,i)=>o.id!==p.outcomes[i].id||o.title!==p.outcomes[i].title))throw new Error('La identidad de la predicción cambió');
        if(m.settlement?.source==='streamer')return this.view(state,m);
        const rank={ACTIVE:0,LOCKED:1,RESOLVED:2,CANCELED:2};
        if(rank[p.status]<rank[original.status]||(['resolved','void'].includes(m.phase)&&p.status!==original.status))return this.view(state,m);
        if(original.status==='RESOLVED'&&p.winningOutcomeId!==original.winningOutcomeId)throw new Error('Twitch informó otro ganador para un mercado liquidado');
      } else {
        if(p.status!=='ACTIVE'||closesAt(p)<=Date.now()||Date.parse(p.createdAt)>Date.now()+30_000)throw new Error('La predicción no está abierta');
        m={key,prediction:p,phase:'open',demo,createdAt:now(),updatedAt:now(),sourceCheckedAt:now()};state.markets[key]=m;
      }
      m.prediction=p;m.updatedAt=now();m.sourceCheckedAt=now();
      if(!['resolved','void'].includes(m.phase)) {
        if(p.status==='CANCELED')this.settle(state,m,null,demo?'Ejemplo cancelado':'Twitch canceló la predicción');
        else if(p.status==='RESOLVED') {
          if(!p.winningOutcomeId||!p.outcomes.some(o=>o.id===p.winningOutcomeId))throw new Error('Twitch todavía no informó un ganador válido');
          this.settle(state,m,p.winningOutcomeId,demo?'Resultado simulado del ejemplo':'Resultado confirmado por Twitch');
        } else m.phase=m.operatorLockedAt||p.status==='LOCKED'||closesAt(p)<=Date.now()?'locked':'open';
      }
      return this.view(state,m);
    });
  }
  private settle(state:State,m:Market,winner:string|null,reason:string) {
    const bets=state.bets.filter(b=>b.marketKey===m.key);const winners=bets.filter(b=>b.outcomeId===winner);
    const pool=bets.reduce((n,b)=>n+b.amount,0);const winningPool=winners.reduce((n,b)=>n+b.amount,0);
    m.winnerId=winner??undefined;m.reason=reason;m.phase=winner&&winningPool?'resolved':'void';
    m.settlement={source:m.demo?'demo':'twitch',at:now()};
    if(m.phase==='void') {if(winner)m.reason='Sin apuestas al ganador: se devuelve cada apuesta';for(const bet of bets)bet.payout=bet.amount;return;}
    // Largest remainder allocation conserves every integer point without floating point arithmetic.
    const allocation=winners.map(b=>{const numerator=BigInt(b.amount)*BigInt(pool);return {bet:b,paid:Number(numerator/BigInt(winningPool)),remainder:numerator%BigInt(winningPool)};});
    let remaining=pool-allocation.reduce((sum,a)=>sum+a.paid,0);
    allocation.sort((a,b)=>a.remainder===b.remainder?a.bet.id.localeCompare(b.bet.id):a.remainder>b.remainder?-1:1);
    for(const a of allocation){if(remaining>0){a.paid++;remaining--;}a.bet.payout=a.paid;}
  }
  async bet(token:string,key:string,outcomeId:string,amount:number,requestId:string) {
    if(!Number.isSafeInteger(amount)||amount<=0||amount>1_000_000)throw new Error('Ingresá puntos enteros entre 1 y 1.000.000');
    return this.transaction(state=>{
      const account=this.account(state,token);const id=`${account.id}:${requestId}`;const fingerprint=JSON.stringify(['bet',key,outcomeId,amount]);
      const previous=state.receipts[id];if(previous){if(previous.fingerprint!==fingerprint)throw new Error('ID de operación reutilizado con otros datos');return previous.result;}
      const m=state.markets[key];if(!m||!this.view(state,m).canBet)throw new Error('La apuesta está cerrada o falta actualizar Twitch');
      if(!m.prediction.outcomes.some(o=>o.id===outcomeId))throw new Error('Opción inválida');
      const pool=state.bets.filter(b=>b.marketKey===key).reduce((sum,b)=>sum+b.amount,0);if(!Number.isSafeInteger(pool+amount))throw new Error('El pozo alcanzó el límite');
      this.ledger(state,account,'bet',-amount,key);
      const bet:Bet={id:randomUUID(),accountId:account.id,wallet:account.wallet,marketKey:key,outcomeId,amount,payout:0,claimed:false,createdAt:now()};state.bets.push(bet);
      const result={betId:bet.id,amount,outcomeId,balance:account.balance};state.receipts[id]={fingerprint,result};return result;
    });
  }
  async claim(token:string,key:string,requestId:string) {
    return this.transaction(state=>{
      const account=this.account(state,token);const id=`${account.id}:${requestId}`;const fingerprint=JSON.stringify(['claim',key]);
      const previous=state.receipts[id];if(previous){if(previous.fingerprint!==fingerprint)throw new Error('ID de operación reutilizado con otros datos');return previous.result;}
      const m=state.markets[key];if(!m||!['resolved','void'].includes(m.phase))throw new Error('El mercado todavía no está resuelto');
      const bets=state.bets.filter(b=>b.accountId===account.id&&b.marketKey===key&&!b.claimed);const paid=bets.reduce((n,b)=>n+b.payout,0);
      if(!paid)throw new Error('No hay puntos pendientes de cobro');
      this.ledger(state,account,'claim',paid,key);for(const b of bets){b.claimed=true;b.creditedAt=now();b.creditMethod='claim';}
      const result={paid,balance:account.balance};state.receipts[id]={fingerprint,result};return result;
    });
  }
  // Provisioned only by the local bridge operator; a login cannot claim a Twitch channel.
  async assignStreamer(channel:string,wallet:string){
    if(!/^[a-zA-Z0-9_]{1,40}$/.test(channel))throw new Error('Canal inválido');
    if(channel.toLowerCase()!=='demo_streamer')throw new Error('Conectá la cuenta de Twitch para administrar un canal real');
    return this.transaction(state=>{
      if(!Object.values(state.accounts).some(a=>a.wallet===wallet))throw new Error('La wallet debe iniciar sesión primero');
      const name=channel.toLowerCase();const previous=state.streamers[name];
      if(previous&&previous.wallet!==wallet)throw new Error('El canal ya tiene una wallet de streamer asignada');
      return state.streamers[name]??=( {channel:name,wallet,assignedAt:now()} );
    });
  }
  async linkTwitch(token:string,identity:TwitchIdentity){
    if(!/^\d+$/.test(identity.id)||!/^[a-z0-9_]{1,40}$/.test(identity.login))throw new Error('Identidad de Twitch inválida');
    return this.transaction(state=>{
      const a=this.account(state,token);if(!a.wallet)throw new Error('Conectá Phantom primero');
      if(a.twitch&&a.twitch.id!==identity.id)throw new Error('Esta wallet ya tiene otra cuenta de Twitch conectada. Desconectala primero.');
      if(Object.values(state.accounts).some(other=>other.id!==a.id&&other.twitch?.id===identity.id))throw new Error('Esta cuenta de Twitch ya está vinculada a otra wallet');
      const owner=state.streamers[identity.login];if(owner?.twitchId&&owner.wallet!==a.wallet)throw new Error('El canal ya está vinculado a otra wallet');
      if(!state.channels.includes(identity.login)&&state.channels.length>=30)throw new Error('Quitá un canal seguido antes de conectar otro');
      for(const [name,s] of Object.entries(state.streamers))if(s.twitchId===identity.id)delete state.streamers[name];
      a.twitch={...identity};state.streamers[identity.login]={channel:identity.login,wallet:a.wallet,twitchId:identity.id,assignedAt:now()};
      if(!state.channels.includes(identity.login))state.channels.push(identity.login);
      return {twitch:a.twitch,channel:identity.login};
    });
  }
  async unlinkTwitch(token:string){
    return this.transaction(state=>{const a=this.account(state,token);for(const [channel,s] of Object.entries(state.streamers))if(s.twitchId&&s.wallet===a.wallet)delete state.streamers[channel];delete a.twitch;return {ok:true};});
  }
  private streamer(state:State,token:string,key?:string){
    const a=this.account(state,token);if(!a.wallet)throw new Error('Conectá Phantom para usar la consola');
    const channels=Object.values(state.streamers).filter(s=>s.wallet===a.wallet&&(s.channel==='demo_streamer'||(s.twitchId&&s.twitchId===a.twitch?.id))).map(s=>s.channel);
    if(key&&!channels.includes(state.markets[key]?.prediction.channel.toLowerCase()))throw new Error('No tenés permisos sobre este mercado');
    return {account:a,channels};
  }
  private roster(state:State,m:Market){
    return state.bets.filter(b=>b.marketKey===m.key).map(b=>({...b,wallet:b.wallet??state.accounts[b.accountId]?.wallet??null,outcome:m.prediction.outcomes.find(o=>o.id===b.outcomeId)?.title}));
  }
  streamerConsole(token:string){
    const {channels}=this.streamer(this.state,token);
    return {channels,markets:Object.values(this.state.markets).filter(m=>channels.includes(m.prediction.channel.toLowerCase())).reverse().map(m=>{
      const bets=this.roster(this.state,m);return {...this.view(this.state,m),bets,credited:bets.filter(b=>b.claimed).reduce((n,b)=>n+b.payout,0),pending:bets.filter(b=>!b.claimed).reduce((n,b)=>n+b.payout,0)};
    })};
  }
  previewSettlement(token:string,key:string,winnerId:string|null){
    this.streamer(this.state,token,key);const state=structuredClone(this.state),m=state.markets[key];
    if(['resolved','void'].includes(m.phase))throw new Error('El mercado ya está resuelto');
    if(winnerId!==null&&!m.prediction.outcomes.some(o=>o.id===winnerId))throw new Error('Opción inválida');
    if(this.view(state,m).phase!=='locked')throw new Error('Cerrá las apuestas antes de resolver');
    this.settle(state,m,winnerId,'Vista previa');return {phase:m.phase,reason:m.reason,pool:this.view(state,m).totalPoints,bets:this.roster(state,m)};
  }
  async streamerAction(token:string,input:StreamerAction){
    return this.transaction(state=>{
      const {account}=this.streamer(state,token,input.key);const m=state.markets[input.key];
      const receiptId=`${account.id}:${input.requestId}`,fingerprint=JSON.stringify(['streamer',input.key,input.action,input.winnerId]);
      const previous=state.receipts[receiptId];if(previous){if(previous.fingerprint!==fingerprint)throw new Error('ID de operación reutilizado con otros datos');return previous.result as {paid:number;accounts:number};}
      let paid=0,accounts=0;
      if(input.action==='distribute'){
        if(!['resolved','void'].includes(m.phase))throw new Error('Resolvé el mercado antes de repartir');
        const groups=new Map<string,Bet[]>();
        for(const b of state.bets.filter(b=>b.marketKey===m.key&&!b.claimed&&b.payout>0))groups.set(b.accountId,[...(groups.get(b.accountId)??[]),b]);
        for(const [accountId,bets] of groups){const amount=bets.reduce((n,b)=>n+b.payout,0);this.ledger(state,state.accounts[accountId],'distribution',amount,m.key);paid+=amount;accounts++;for(const b of bets){b.claimed=true;b.creditedAt=now();b.creditMethod='distribution';}}
        if(m.settlement){m.settlement.distributedAt??=now();m.settlement.distributedBy??=account.wallet;}
      }else{
        if(['resolved','void'].includes(m.phase))throw new Error('El mercado ya está resuelto');
        if(input.action==='lock'){m.phase='locked';m.operatorLockedAt??=now();m.operatorLockedBy??=account.wallet;}
        else{
          if(this.view(state,m).phase!=='locked')throw new Error('Cerrá las apuestas antes de resolver');
          if(input.action==='resolve'&&(!input.winnerId||!m.prediction.outcomes.some(o=>o.id===input.winnerId)))throw new Error('Opción inválida');
          this.settle(state,m,input.action==='cancel'?null:input.winnerId!,input.action==='cancel'?'Cancelada por el streamer: reembolso de apuestas':'Resultado confirmado por el streamer');
          m.settlement={source:'streamer',wallet:account.wallet,at:now()};
        }
      }
      m.updatedAt=now();const result={paid,accounts};state.receipts[receiptId]={fingerprint,result};return result;
    });
  }
  async demoResolve(key:string,winnerId:string|null) {
    const m=this.state.markets[key];if(!m?.demo||['resolved','void'].includes(m.phase))throw new Error('Solo se pueden resolver manualmente los ejemplos abiertos');
    if(winnerId!==null&&!m.prediction.outcomes.some(o=>o.id===winnerId))throw new Error('Opción inválida');
    return this.accept({...m.prediction,status:winnerId?'RESOLVED':'CANCELED',winningOutcomeId:winnerId,endedAt:now()},true);
  }
}
