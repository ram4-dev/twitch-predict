import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closesAt, predictionSchema, type Prediction } from './prediction.js';

export const STARTING_POINTS = 10_000;
export const SOURCE_MAX_AGE = 30_000;
type Account = { id:string; name:string; tokenHash:string; balance:number; createdAt:string };
type Bet = { id:string; accountId:string; marketKey:string; outcomeId:string; amount:number; payout:number; claimed:boolean; createdAt:string };
type Market = { key:string; prediction:Prediction; phase:'open'|'locked'|'resolved'|'void'; winnerId?:string; reason?:string; sourceCheckedAt:string; createdAt:string; updatedAt:string; demo:boolean };
type Receipt = { fingerprint:string; result:unknown };
type LedgerEntry = { id:string; accountId:string; kind:'welcome'|'bet'|'claim'; delta:number; balance:number; marketKey?:string; createdAt:string };
type State = { version:1; accounts:Record<string,Account>; markets:Record<string,Market>; bets:Bet[]; receipts:Record<string,Receipt>; ledger:LedgerEntry[]; channels:string[] };
const fresh = ():State => ({version:1,accounts:{},markets:{},bets:[],receipts:{},ledger:[],channels:[]});
const hash = (token:string) => createHash('sha256').update(token).digest('hex');
const now = () => new Date().toISOString();
export class Points {
  private state:State = fresh();
  private queue:Promise<unknown> = Promise.resolve();
  constructor(readonly directory:string) {}
  async load() {
    await mkdir(this.directory,{recursive:true,mode:0o700});
    try { this.state=JSON.parse(await readFile(`${this.directory}/points.json`,'utf8')); if(this.state.version!==1) throw new Error('Unsupported points database'); }
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
    const account=Object.values(state.accounts).find(a=>a.tokenHash===hash(token));
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
  me(token:string) {
    const account=this.account(this.state,token);
    const bets=this.state.bets.filter(b=>b.accountId===account.id);
    return {id:account.id,name:account.name,balance:account.balance,startingPoints:STARTING_POINTS,
      bets:bets.map(b=>({...b,title:this.state.markets[b.marketKey].prediction.title,outcome:this.state.markets[b.marketKey].prediction.outcomes.find(o=>o.id===b.outcomeId)?.title,phase:this.state.markets[b.marketKey].phase})),
      claimable:bets.filter(b=>!b.claimed).reduce((sum,b)=>sum+b.payout,0),ledger:this.state.ledger.filter(l=>l.accountId===account.id).slice(-30).reverse()};
  }
  private view(state:State, m:Market) {
    const bets=state.bets.filter(b=>b.marketKey===m.key);const total=bets.reduce((n,b)=>n+b.amount,0);
    const sourceFresh=m.demo||Date.now()-Date.parse(m.sourceCheckedAt)<SOURCE_MAX_AGE;
    return {...m,network:'offchain',canBet:m.phase==='open'&&m.prediction.status==='ACTIVE'&&closesAt(m.prediction)>Date.now()&&sourceFresh,
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
        } else m.phase=p.status==='LOCKED'||closesAt(p)<=Date.now()?'locked':'open';
      }
      return this.view(state,m);
    });
  }
  private settle(state:State,m:Market,winner:string|null,reason:string) {
    const bets=state.bets.filter(b=>b.marketKey===m.key);const winners=bets.filter(b=>b.outcomeId===winner);
    const pool=bets.reduce((n,b)=>n+b.amount,0);const winningPool=winners.reduce((n,b)=>n+b.amount,0);
    m.winnerId=winner??undefined;m.reason=reason;m.phase=winner&&winningPool?'resolved':'void';
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
      const bet:Bet={id:randomUUID(),accountId:account.id,marketKey:key,outcomeId,amount,payout:0,claimed:false,createdAt:now()};state.bets.push(bet);
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
      this.ledger(state,account,'claim',paid,key);for(const b of bets)b.claimed=true;
      const result={paid,balance:account.balance};state.receipts[id]={fingerprint,result};return result;
    });
  }
  async demoResolve(key:string,winnerId:string|null) {
    const m=this.state.markets[key];if(!m?.demo||['resolved','void'].includes(m.phase))throw new Error('Solo se pueden resolver manualmente los ejemplos abiertos');
    if(winnerId!==null&&!m.prediction.outcomes.some(o=>o.id===winnerId))throw new Error('Opción inválida');
    return this.accept({...m.prediction,status:winnerId?'RESOLVED':'CANCELED',winningOutcomeId:winnerId,endedAt:now()},true);
  }
}
