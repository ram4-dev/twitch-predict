import {createHash} from 'node:crypto';
import type {Pool} from 'pg';

export type TwitchEvent={id:string;broadcaster:string;prediction:string;kind:'lock'|'resolve'|'cancel';winner?:string;source:'eventsub'|'helix'|'streamer'};
/** Implementations authenticate EventSub/OAuth or query Helix before returning events. */
export interface VerifiedTwitchSource { poll():Promise<TwitchEvent[]> }
/** Commands must be idempotent and reconciled against chain state by their implementation. */
export interface PlotMarketChain { lock(broadcaster:string,prediction:string):Promise<void>; resolve(broadcaster:string,prediction:string,winner:string):Promise<void>; cancel(broadcaster:string,prediction:string):Promise<void> }
export class TwitchProjection {
 constructor(private pool:Pool,private namespace:string){}
 async register(actor:{wallet:string|null;twitch:{id:string}|null},input:{broadcaster:string;prediction:string;outcomes:string[];closesAt:string;timeoutAt:string}){
  if(!actor.wallet||actor.twitch?.id!==input.broadcaster)throw new Error('Broadcaster and wallet verification required');
  const close=Date.parse(input.closesAt),timeout=Date.parse(input.timeoutAt);
  if(!input.prediction||input.outcomes.length<2||input.outcomes.length>6||new Set(input.outcomes).size!==input.outcomes.length||input.outcomes.some(x=>!x)||!Number.isFinite(close)||!Number.isFinite(timeout)||close>=timeout)throw new Error('Invalid market');
  const result=await this.pool.query(`INSERT INTO plot_private.plot_twitch_markets(namespace,broadcaster,prediction,wallet,outcomes,closes_at,timeout_at)
   VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT(namespace,broadcaster,prediction) DO UPDATE SET prediction=excluded.prediction
   WHERE plot_twitch_markets.wallet=excluded.wallet AND plot_twitch_markets.outcomes=excluded.outcomes AND plot_twitch_markets.closes_at=excluded.closes_at AND plot_twitch_markets.timeout_at=excluded.timeout_at RETURNING prediction`,[this.namespace,input.broadcaster,input.prediction,actor.wallet,JSON.stringify(input.outcomes),input.closesAt,input.timeoutAt]);
  if(!result.rowCount)throw new Error('Market conflict');
 }
 async ingest(event:TwitchEvent){
  if(!event.id||!event.broadcaster||!event.prediction||!['lock','resolve','cancel'].includes(event.kind)||!['eventsub','helix','streamer'].includes(event.source))throw new Error('Invalid event');
  const fingerprint=createHash('sha256').update(JSON.stringify([event.broadcaster,event.prediction,event.kind,event.winner??null,event.source])).digest('hex');
  const c=await this.pool.connect();try{await c.query('BEGIN');
   const market=await c.query('SELECT * FROM plot_private.plot_twitch_markets WHERE namespace=$1 AND broadcaster=$2 AND prediction=$3 FOR UPDATE',[this.namespace,event.broadcaster,event.prediction]);
   if(!market.rowCount)throw new Error('Unknown market');const m=market.rows[0];
   const prior=await c.query('INSERT INTO plot_private.plot_twitch_events(namespace,event_id,fingerprint) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',[this.namespace,event.id,fingerprint]);
   if(!prior.rowCount){const existing=await c.query('SELECT fingerprint FROM plot_private.plot_twitch_events WHERE namespace=$1 AND event_id=$2',[this.namespace,event.id]);if(existing.rows[0].fingerprint!==fingerprint)throw new Error('Event conflict');await c.query('COMMIT');return;}
   if(event.kind==='resolve'&&(!event.winner||!m.outcomes.includes(event.winner)))throw new Error('Invalid outcome');
   if(!['resolved','canceled'].includes(m.phase)){
    const phase=event.kind==='lock'?'locked':event.kind==='resolve'?'resolved':'canceled';
    await c.query('UPDATE plot_private.plot_twitch_markets SET phase=$4,winner=$5,source=$6 WHERE namespace=$1 AND broadcaster=$2 AND prediction=$3',[this.namespace,event.broadcaster,event.prediction,phase,event.winner??null,event.source]);
   }
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
}

export type ChainMarketState={phase:'open'|'locked'|'resolved'|'canceled';winner?:string};
export interface ReconciledPlotMarketChain extends PlotMarketChain { read(broadcaster:string,prediction:string):Promise<ChainMarketState> }
/** A cycle only submits the next operation after observing chain state; adapters reconcile ambiguous submissions. */
export async function reconcileTwitchMarkets(pool:Pool,namespace:string,chain:ReconciledPlotMarketChain,now=Date.now()){
 const {rows}=await pool.query('SELECT * FROM plot_private.plot_twitch_markets WHERE namespace=$1',[namespace]);
 for(const m of rows){
  const state=await chain.read(m.broadcaster,m.prediction);
  if(state.phase==='resolved'||state.phase==='canceled')continue;
  if(now>=new Date(m.timeout_at).getTime()||m.phase==='canceled'){await chain.cancel(m.broadcaster,m.prediction);continue;}
  if(state.phase==='open'&&(m.phase==='locked'||m.phase==='resolved'||now>=new Date(m.closes_at).getTime())){await chain.lock(m.broadcaster,m.prediction);continue;}
  if(state.phase==='locked'&&m.phase==='resolved'&&now>=new Date(m.closes_at).getTime())await chain.resolve(m.broadcaster,m.prediction,m.winner);
 }
}
/** Caller supplies only events authenticated by its EventSub/Helix adapter. */
export async function runTwitchCycle(source:VerifiedTwitchSource,projection:TwitchProjection,pool:Pool,namespace:string,chain:ReconciledPlotMarketChain){
 try{for(const event of await source.poll())await projection.ingest(event);}
 finally{await reconcileTwitchMarkets(pool,namespace,chain);}
}
