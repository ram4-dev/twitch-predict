import {pointFees,type PointFees} from './point-fees.js';
import {hasPointsIdentity,PointsSessionError} from './points-identity.js';
import {PlotCommandError,type PlotCommand} from './plot-chat.js';
import type {Documents} from './cloud/documents.js';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closesAt, predictionSchema, type Prediction } from './prediction.js';
import { capabilities, type MarketActor, type MarketChannel, type PublishMarketInput, type ProposalTransaction, type PublishedMarket } from './market-contract.js';

export const STARTING_POINTS = 10_000;
/** Fixed stake for chat bets (!yes/!no/!N); the internal-funds model is still being defined. */
export const CHAT_BET_POINTS = 100;
export const SOURCE_MAX_AGE = 30_000;
export type TwitchIdentity={id:string;login:string;displayName:string;linkedAt:string};
type Account = { id:string; name:string; tokenHash:string; wallet?:string; twitch?:TwitchIdentity; google?:{id:string;email?:string;displayName:string;linkedAt:string}; botEnabled?:boolean; botEpoch?:string; balance:number; createdAt:string };
type Bet = { id:string; accountId:string; wallet?:string; marketKey:string; outcomeId:string; amount:number; payout:number; claimed:boolean; creditedAt?:string; creditMethod?:'claim'|'distribution'|'refund'; createdAt:string };
type Settlement = { source:'twitch'|'streamer'|'demo'; at:string; wallet?:string; distributedAt?:string; distributedBy?:string };
type Market = { key:string; prediction:Prediction; phase:'open'|'locked'|'resolved'|'void'; winnerId?:string; reason?:string; fees?:PointFees; sourceCheckedAt:string; createdAt:string; updatedAt:string; demo:boolean; source?:'plot'; ownerTwitchId?:string; creatorTwitchId?:string; shortId?:string; version?:number; operatorLockedAt?:string; operatorLockedBy?:string; settlement?:Settlement };
type Receipt = { fingerprint:string; result:unknown };
type LedgerEntry = { id:string; accountId:string; kind:'welcome'|'bet'|'claim'|'distribution'|'refund'|'streamer_fee'; delta:number; balance:number; marketKey?:string; createdAt:string };
type Streamer = { channel:string; wallet:string; assignedAt:string; twitchId?:string };
type State = { version:1; platformRevenue?:{balance:number;credits:{marketKey:string;amount:number;at:string}[]}; pendingStreamerFees?:Record<string,{channel:string;twitchId?:string;amount:number}>; accounts:Record<string,Account>; markets:Record<string,Market>; bets:Bet[]; receipts:Record<string,Receipt>; ledger:LedgerEntry[]; channels:string[]; sessions:Record<string,string>; streamers:Record<string,Streamer>; channelModerators?:Record<string,ChannelModeratorEvidence> };
/** Dated moderator evidence: the bot adapter refreshes it; HTTP publication revalidates inside its window. */
export type ChannelModeratorEvidence={users:string[];verifiedAt:string};
/** Positive moderator evidence lives this long; expiry denies rather than trusting a stale list. */
export const MODERATOR_EVIDENCE_TTL_MS=30_000;
export type StreamerAction = { key:string; action:'lock'|'resolve'|'cancel'|'distribute'; winnerId?:string; requestId:string };
const fresh = ():State => ({version:1,accounts:{},markets:{},bets:[],receipts:{},ledger:[],channels:[],sessions:{},streamers:{}});
const hash = (token:string) => createHash('sha256').update(token).digest('hex');
const now = () => new Date().toISOString();
export class Points {
  private state:State = fresh();
  private queue:Promise<unknown> = Promise.resolve();
  constructor(readonly directory:string,private readonly documents?:Pick<Documents,'read'|'update'>,public evidenceClock:()=>number=Date.now) {}
  async load() {
    if(this.documents){this.state=await this.documents.read('points',fresh);return;}
    await mkdir(this.directory,{recursive:true,mode:0o700});
    try { this.state=JSON.parse(await readFile(`${this.directory}/points.json`,'utf8')); if(this.state.version!==1) throw new Error('Unsupported points database');this.state.sessions??={};this.state.streamers??={};
      for(const b of this.state.bets)b.wallet??=this.state.accounts[b.accountId]?.wallet;
    }
    catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e; }
  }
  /** Session-scoped transaction over the Points aggregate: proposals and market publication commit together. */
  /** Authoritative revalidation hook for HTTP publication: the coordinator's integration injects
   * a fresh Twitch moderators query here. It runs BEFORE any transaction opens so the network
   * never holds the Points row or serial queue. Failure (null/throw) does NOT refresh evidence:
   * a moderator with only expired evidence then loses publish rights (deny on outage), while the
   * owner stays independent. Fresh user ids are applied as dated evidence in the short transaction. */
  public moderatorRevalidator:((channel:MarketChannel)=>Promise<string[]|null>)|null=null;
  /** Publication transaction with authoritative revalidation done outside the row lock. */
  async proposalTransactionWithRevalidation<T>(work:(draft:ProposalTransaction)=>Promise<T>|T,channel:MarketChannel):Promise<T>{
    // Revalidation runs BEFORE the transaction so the network never holds the row/queue.
    const fresh=this.moderatorRevalidator?await this.moderatorRevalidator(channel).catch(()=>null):null;
    // Authoritative failure denies moderator publication for this attempt even with a fresh
    // cached snapshot; the owner path stays independent of this evidence.
    const moderatorEvidenceOverride:{granted:boolean;users?:string[]}|null=this.moderatorRevalidator?(fresh?{granted:true,users:fresh}:{granted:false}):null;
    return this.transaction(async state=>{
      if(fresh){state.channelModerators??={};state.channelModerators[channel.id]={users:fresh.filter(id=>/^\d+$/.test(id)),verifiedAt:new Date(this.evidenceClock()).toISOString()};}
      return work({
        proposals:(state as State&{proposals?:Record<string,unknown>}).proposals??=((state as State&{proposals?:Record<string,unknown>}).proposals={}),
        publishMarket:(input:PublishMarketInput)=>this.publishOnDraft(state,input,moderatorEvidenceOverride)
      });
    });
  }
  async proposalTransaction<T>(work:(draft:ProposalTransaction)=>T):Promise<T> {
    return this.transaction(state=>work({
      proposals:(state as State&{proposals?:Record<string,unknown>}).proposals??=((state as State&{proposals?:Record<string,unknown>}).proposals={}),
      publishMarket:(input:PublishMarketInput)=>this.publishOnDraft(state,input)
    }));
  }
  /** Publishes on an open draft: owner/mod only, persistent shortId, version-stamped receipt.
   * Idempotent replay: the same channel+requestId returns the original receipt without touching
   * state; the same requestId with different payload is rejected as reuse. */
  private publishOnDraft(state:State,input:PublishMarketInput,revalidatedModerator:{granted:boolean;users?:string[]}|null=null):PublishedMarket {
    const account=state.accounts[input.actor.accountId];
    if(!account)throw new Error('Cuenta desconocida');
    const receiptId=`plot-publish:${input.channel.id}:${input.requestId}`,fingerprint=JSON.stringify([input.actor.accountId,input.actor.twitchId,input.input]);
    const previous=state.receipts[receiptId];
    if(previous){
      if(previous.fingerprint!==fingerprint)throw new Error('ID de operación reutilizado con otros datos');
      return previous.result as PublishedMarket;
    }
    // When HTTP revalidation ran, its verdict overrides cached evidence: granted=false denies
    // the moderator (outage or revocation), granted=true uses the fresh list. Owner unaffected.
    const moderator=revalidatedModerator
      ?revalidatedModerator.granted&&!!input.actor.twitchId&&!!revalidatedModerator.users?.includes(input.actor.twitchId)
      :this.verifiedModeratorOf(state,input.channel,input.actor,()=>this.evidenceClock());
    const caps=capabilities({accountId:input.actor.accountId,twitchId:input.actor.twitchId},{id:input.channel.id,login:input.channel.login},moderator);
    if(!caps.create)throw new Error('Solo el dueño del canal o un moderador puede publicar predicciones.');
    const stamp=now();
    const id=`plot-${createHash('sha256').update(input.channel.id+':'+input.requestId).digest('hex').slice(0,32)}`;
    const prediction=predictionSchema.parse({id,channel:input.channel.login,title:input.input.title,status:'ACTIVE',createdAt:stamp,predictionWindowSeconds:input.input.durationSeconds??120,outcomes:input.input.options.map((title,i)=>({id:String(i+1),title}))});
    const shortId=this.nextShortId(state,input.channel.login);
    const market:Market={key:`plot:${input.channel.login}:${id}`,prediction,phase:'open',demo:false,source:'plot',ownerTwitchId:input.channel.id,creatorTwitchId:input.actor.twitchId,shortId,version:1,createdAt:stamp,updatedAt:stamp,sourceCheckedAt:stamp};
    if(state.markets[market.key])throw new Error('Ese mercado ya fue publicado con este identificador.');
    state.markets[market.key]=market;
    const published:PublishedMarket={kind:'market',id,key:market.key,shortId,text:`${prediction.title} · ${prediction.outcomes.map((o,i)=>`!${i+1} ${o.title}`).join(' · ')} · 100 puntos por apuesta. Abierta 2 minutos.`};
    state.receipts[receiptId]={fingerprint,result:published};
    return published;
  }
  /** Persistent per-channel codes: never reused, survive restarts, allocated inside the aggregate transaction. */
  private nextShortId(state:State,channel:string):string {
    const used=new Set(Object.values(state.markets).filter(m=>m.source==='plot'&&m.prediction.channel===channel).map(m=>m.shortId!));
    for(let attempt=0;attempt<64;attempt++) {
      const code=Array.from(randomBytes(2)).map(b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%32]).join('');
      if(!used.has(code))return code;
    }
    throw new Error('No hay códigos disponibles para este canal');
  }
  // Every operation commits one atomic snapshot; failed persistence never updates the live state.
  private transaction<T>(work:(draft:State)=>T):Promise<T> {
    const task=this.queue.then(async()=>{
      if(this.documents){const committed=await this.documents.update('points',fresh,work);this.state=committed.state;return committed.result;}
      const draft=structuredClone(this.state);const result=await work(draft);
      const file=`${this.directory}/points.json`;
      await writeFile(`${file}.tmp`,JSON.stringify(draft),{mode:0o600});await rename(`${file}.tmp`,file);
      this.state=draft;return result;
    });
    this.queue=task.catch(()=>undefined);return task;
  }
  private account(state:State, token:string) {
    const digest=hash(token);const account=state.accounts[state.sessions[digest]]??Object.values(state.accounts).find(a=>!a.wallet&&a.tokenHash===digest);
    if(!account) throw new PointsSessionError('Sesión inválida. Volvé a conectar tu cuenta.');return account;
  }
  /** Moderator evidence comes only from the signed chat event via the adapter, never from HTTP payloads. */
  private verifiedModeratorOf(state:State,channel:MarketChannel,actor:MarketActor,clock:()=>number=Date.now):boolean {
    if(!actor.twitchId)return false;
    const evidence=state.channelModerators?.[channel.id];
    if(!evidence)return false;
    // Legacy format (string[]) or expired evidence: both deny until the adapter refreshes.
    const verifiedAt=typeof evidence==='object'&&'verifiedAt' in evidence?Date.parse((evidence as ChannelModeratorEvidence).verifiedAt):NaN;
    if(!Number.isFinite(verifiedAt)||clock()-verifiedAt>MODERATOR_EVIDENCE_TTL_MS)return false;
    return !!(evidence as ChannelModeratorEvidence).users?.includes(actor.twitchId);
  }
  /** Syncs the authoritative moderator list for a channel (called by the bot adapter after its Twitch query). */
  async setChannelModerators(channelId:string,userIds:string[]):Promise<{count:number;verifiedAt:string}>{
    if(!/^\d+$/.test(channelId))throw new Error('Canal inválido');
    return this.transaction(state=>{
      state.channelModerators??={};
      const evidence:ChannelModeratorEvidence={users:userIds.filter(id=>/^\d+$/.test(id)),verifiedAt:new Date(this.evidenceClock()).toISOString()};
      state.channelModerators[channelId]=evidence;
      return {count:evidence.users.length,verifiedAt:evidence.verifiedAt};
    });
  }
  private managedChannels(state:State,account:Account){
    return Object.values(state.streamers).filter(s=>(account.twitch&&s.twitchId===account.twitch.id)||(s.channel==='demo_streamer'&&s.wallet===account.wallet)).map(s=>s.channel);
  }
  private requireViewer(state:State,account:Account){
    if(!hasPointsIdentity(account))throw new PlotCommandError('Iniciá sesión con Twitch o Phantom para apostar con tus puntos.');
    if(this.managedChannels(state,account).length)throw new PlotCommandError('Las cuentas de streamer no pueden apostar.');
  }
  /** Shared debit used by chat bets and API bets on an open draft; receipts guard replay. */
  private betOnDraft(state:State,account:Account,m:Market,outcomeId:string,amount:number) {
    this.requireViewer(state,account);
    if(!this.view(state,m).canBet)throw new PlotCommandError('La apuesta está cerrada o falta actualizar Twitch');
    if(!m.prediction.outcomes.some(o=>o.id===outcomeId))throw new PlotCommandError('Opción inválida');
    const pool=state.bets.filter(b=>b.marketKey===m.key).reduce((sum,b)=>sum+b.amount,0);if(!Number.isSafeInteger(pool+amount))throw new PlotCommandError('El pozo alcanzó el límite');
    this.ledger(state,account,'bet',-amount,m.key);
    const bet:Bet={id:randomUUID(),accountId:account.id,wallet:account.wallet,marketKey:m.key,outcomeId,amount,payout:0,claimed:false,createdAt:now()};state.bets.push(bet);
  }
  private ledger(state:State, account:Account, kind:LedgerEntry['kind'], delta:number, marketKey?:string) {
    if(!Number.isSafeInteger(account.balance+delta)||account.balance+delta<0) throw new PlotCommandError('Saldo insuficiente');
    account.balance+=delta;state.ledger.push({id:randomUUID(),accountId:account.id,kind,delta,balance:account.balance,marketKey,createdAt:now()});
  }
  /** Settle platform and broadcaster shares in the same transaction as winner payouts. */
  private creditFees(state:State,m:Market,fees:PointFees){
    const treasury=state.platformRevenue??=( {balance:0,credits:[]} );
    if(!Number.isSafeInteger(treasury.balance+fees.platform))throw new Error('El saldo de Plot alcanzó el límite');
    if(fees.platform){treasury.balance+=fees.platform;treasury.credits.push({marketKey:m.key,amount:fees.platform,at:now()});}
    if(!fees.streamer)return;
    const channel=m.prediction.channel.toLowerCase(),registration=state.streamers[channel];
    const twitchId=m.ownerTwitchId??registration?.twitchId;
    const owner=Object.values(state.accounts).find(a=>twitchId?a.twitch?.id===twitchId:registration?.wallet?a.wallet===registration.wallet:a.twitch?.login===channel);
    if(owner)this.ledger(state,owner,'streamer_fee',fees.streamer,m.key);
    else (state.pendingStreamerFees??={})[m.key]={channel,twitchId,amount:fees.streamer};
  }
  /** Only a server-verified Twitch identity (or the demo operator's wallet assignment) releases escrow. */
  private collectStreamerFees(state:State,account:Account){
    for(const [key,credit] of Object.entries(state.pendingStreamerFees??{})){
      const entitled=credit.twitchId?account.twitch?.id===credit.twitchId:account.twitch?.login===credit.channel||(credit.channel==='demo_streamer'&&!!account.wallet&&state.streamers[credit.channel]?.wallet===account.wallet);
      if(!entitled)continue;
      this.ledger(state,account,'streamer_fee',credit.amount,key);
      delete state.pendingStreamerFees![key];
    }
  }
  private grantStartingPoints(state:State,account:Account){
    if(hasPointsIdentity(account)&&!state.ledger.some(entry=>entry.accountId===account.id&&entry.kind==='welcome'))this.ledger(state,account,'welcome',STARTING_POINTS);
  }
  /** Issues a session only after Auth's one-time extension flow verified the existing account. */
  async identitySession(accountId:string){
    const token=randomBytes(32).toString('hex');
    return this.transaction(state=>{
      const account=state.accounts[accountId];
      if(!account||!hasPointsIdentity(account))throw new Error('Conectá Twitch o Phantom para iniciar sesión.');
      state.sessions[hash(token)]=account.id;
      return {token,account:{id:account.id,wallet:account.wallet??null,name:account.name,balance:account.balance}};
    });
  }
  /** Twitch-first login: resumes the account already linked to this identity, or creates one exactly once. */
  async loginWithTwitch(identity:TwitchIdentity):Promise<{token:string;account:{id:string;name:string;balance:number};created:boolean}>{
    if(!/^\d+$/.test(identity.id)||!/^[a-z0-9_]{1,40}$/.test(identity.login))throw new Error('Identidad de Twitch inválida');
    const token=randomBytes(32).toString('hex');
    return this.transaction(state=>{
      const existing=Object.values(state.accounts).find(a=>a.twitch?.id===identity.id);
      if(existing){this.collectStreamerFees(state,existing);state.sessions[hash(token)]=existing.id;return {token,account:{id:existing.id,name:existing.name,balance:existing.balance},created:false};}
      const id=randomUUID();const account:Account={id,name:identity.displayName,tokenHash:hash(token),balance:0,createdAt:now(),twitch:identity};
      state.accounts[id]=account;state.sessions[hash(token)]=account.id;this.grantStartingPoints(state,account);this.collectStreamerFees(state,account);
      return {token,account:{id,name:account.name,balance:account.balance},created:true};
    });
  }
  /** Google OIDC: stable subject is `sub`; email never merges or claims accounts. */
  async loginWithGoogle(identity:{id:string;email?:string;displayName:string;linkedAt:string}):Promise<{token:string;account:{id:string;name:string;balance:number};created:boolean}>{
    if(!/^[0-9A-Za-z_-]{1,128}$/.test(identity.id))throw new Error('Identidad de Google inválida');
    const token=randomBytes(32).toString('hex');
    return this.transaction(state=>{
      const existing=Object.values(state.accounts).find(a=>a.google?.id===identity.id);
      if(existing){state.sessions[hash(token)]=existing.id;return {token,account:{id:existing.id,name:existing.name,balance:existing.balance},created:false};}
      const id=randomUUID();const account:Account={id,name:identity.displayName,tokenHash:hash(token),balance:0,createdAt:now(),google:identity};
      state.accounts[id]=account;state.sessions[hash(token)]=account.id;this.grantStartingPoints(state,account);
      return {token,account:{id,name:account.name,balance:account.balance},created:true};
    });
  }
  async createAccount() {
    const token=randomBytes(32).toString('hex');
    return this.transaction(state=>{
      const id=randomUUID();const account:Account={id,name:`Jugador ${id.slice(0,4).toUpperCase()}`,tokenHash:hash(token),balance:0,createdAt:now()};
      state.accounts[id]=account;this.grantStartingPoints(state,account);
      return {token,account:{id,name:account.name,balance:account.balance}};
    });
  }
  async walletLogin(wallet:string,preferredToken?:string) {
    const token=randomBytes(32).toString('hex');
    return this.transaction(state=>{
      let account=Object.values(state.accounts).find(a=>a.wallet===wallet);
      if(!account&&preferredToken){const preferred=this.account(state,preferredToken);if(!preferred.wallet)account=preferred;}
      if(!account){const id=randomUUID();account={id,name:`Jugador ${id.slice(0,4).toUpperCase()}`,tokenHash:hash(token),balance:0,createdAt:now()};state.accounts[id]=account;this.grantStartingPoints(state,account);}
      account.wallet=wallet;this.grantStartingPoints(state,account);state.sessions[hash(token)]=account.id;
      for(const bet of state.bets)if(bet.accountId===account.id)bet.wallet??=wallet;
      return {token,account:{id:account.id,wallet,name:account.name,balance:account.balance}};
    });
  }
  me(token:string) {
    const account=this.account(this.state,token);
    const bets=this.state.bets.filter(b=>b.accountId===account.id);
    return {id:account.id,name:account.name,wallet:account.wallet??null,twitch:account.twitch??null,google:account.google??null,balance:account.balance,startingPoints:STARTING_POINTS,
      bets:bets.map(b=>({...b,title:this.state.markets[b.marketKey].prediction.title,channel:this.state.markets[b.marketKey].prediction.channel,outcome:this.state.markets[b.marketKey].prediction.outcomes.find(o=>o.id===b.outcomeId)?.title,phase:this.state.markets[b.marketKey].phase})),
      claimable:bets.filter(b=>!b.claimed).reduce((sum,b)=>sum+b.payout,0),ledger:this.state.ledger.filter(l=>l.accountId===account.id).slice(-100).reverse().map(l=>({...l,title:l.marketKey?this.state.markets[l.marketKey]?.prediction.title:undefined})),
      streamerEarnings:this.state.ledger.filter(l=>l.accountId===account.id&&l.kind==='streamer_fee').reduce((sum,l)=>sum+l.delta,0),
      streamerChannels:this.managedChannels(this.state,account)};
  }
  private view(state:State, m:Market) {
    const bets=state.bets.filter(b=>b.marketKey===m.key);const total=bets.reduce((n,b)=>n+b.amount,0);
    const sourceFresh=m.demo||m.source==='plot'||Date.now()-Date.parse(m.sourceCheckedAt)<SOURCE_MAX_AGE;
    const phase=m.phase==='open'&&closesAt(m.prediction)<=Date.now()?'locked':m.phase;
    return {...m,...(m.phase==='void'&&m.winnerId?{reason:bets.length?'No hubo apuestas a la opción ganadora. Todas las apuestas fueron reembolsadas.':'La predicción no recibió apuestas.'}:{}),phase,network:'offchain',canBet:phase==='open'&&m.prediction.status==='ACTIVE'&&closesAt(m.prediction)>Date.now()&&sourceFresh,
      sourceFresh,totalPoints:total,totalBets:bets.length,participants:new Set(bets.map(b=>b.accountId)).size,
      outcomes:m.prediction.outcomes.map(o=>{const own=bets.filter(b=>b.outcomeId===o.id);const points=own.reduce((n,b)=>n+b.amount,0);return {id:o.id,title:o.title,color:o.color,points,bets:own.length,share:total?points/total*100:0};})};
  }
  markets() { return Object.values(this.state.markets).map(m=>this.view(this.state,m)).reverse(); }
  market(key:string) {const m=this.state.markets[key];if(!m)throw new Error('Mercado desconocido');return this.view(this.state,m);}
  channels() {return [...this.state.channels];}
  botChannels(){return Object.values(this.state.accounts).filter(a=>a.twitch&&a.botEnabled).map(a=>a.twitch!.login);}
  /** Plan 2 mount (session 2): resolves the linked Plot account for a verified Twitch id; never trusts chat text. */
  accountForTwitch(twitchId:string):{accountId:string;twitchId:string}|null{
    const a=Object.values(this.state.accounts).find(acc=>acc.twitch?.id===twitchId);
    return a?{accountId:a.id,twitchId}:null;
  }
  enabledBotChannels(){return Object.values(this.state.accounts).filter(a=>a.twitch&&a.botEnabled&&a.botEpoch).map(a=>({id:a.twitch!.id,login:a.twitch!.login,epoch:a.botEpoch!}));}
  botState(token:string){const a=this.account(this.state,token);return {enabled:!!a.twitch&&!!a.botEnabled,twitch:a.twitch??null};}
  setBotEnabled(token:string,enabled:boolean,expected?:{accountId:string;twitchId:string}){return this.transaction(state=>{const a=this.account(state,token);if(!a.twitch)throw new Error('Vinculá primero tu cuenta de Twitch');if(expected&&(a.id!==expected.accountId||a.twitch.id!==expected.twitchId))throw new Error('La cuenta cambió durante la conexión');if(enabled&&!a.botEnabled)a.botEpoch=randomUUID();a.botEnabled=enabled;return {enabled,channel:a.twitch.login};});}
  pendingSources() {return Object.values(this.state.markets).filter(m=>!m.demo&&m.source!=='plot'&&!['resolved','void'].includes(m.phase)).map(m=>({id:m.prediction.id,channel:m.prediction.channel}));}
  async watch(channel:string) {
    if(!/^[a-zA-Z0-9_]{1,40}$/.test(channel))throw new Error('Canal inválido');
    return this.transaction(s=>{const name=channel.toLowerCase();if(!s.channels.includes(name)){if(s.channels.length>=30)throw new Error('Máximo 30 canales en esta POC');s.channels.push(name);}return s.channels;});
  }
  async unwatch(channel:string) {return this.transaction(s=>{s.channels=s.channels.filter(c=>c!==channel.toLowerCase());return s.channels;});}
  /** Only a signed chat event for the linked broadcaster can create or manage Plot markets. Moderators may create; only the owner closes, resolves or cancels. */
  async plotCommand(channelId:string,actorId:string,command:PlotCommand,eventId:string,verifiedModerator=false){
    return this.transaction(state=>{
      const account=Object.values(state.accounts).find(a=>a.twitch?.id===channelId&&a.botEnabled);
      const owner=actorId===channelId&&account?.twitch&&state.streamers[account.twitch.login]?.twitchId===channelId;
      // Viewers with a valid Twitch identity may bet and list; only the owner locks, resolves or
      // cancels; a verified moderator may only create. The dispatch below enforces the rest.
      const privileged=owner||(verifiedModerator&&command.kind==='create');
      if(!privileged&&!['bet','list'].includes(command.kind))throw new PlotCommandError('No tenés permisos. Solo el dueño del canal puede cerrar, resolver o cancelar predicciones; los viewers pueden proponer con !plot crear.');
      if(!owner&&command.kind==='create'&&!verifiedModerator)throw new PlotCommandError('No tenés permisos. Solo el dueño del canal puede cerrar, resolver o cancelar predicciones; los viewers pueden proponer con !plot crear.');
      const receiptId=`plot-command:${channelId}:${eventId}`,fingerprint=JSON.stringify([actorId,command]);
      const previous=state.receipts[receiptId];if(previous){if(previous.fingerprint!==fingerprint)throw new PlotCommandError('ID de evento reutilizado con otros datos');return previous.result as {key:string;text:string};}
      const channel=account?.twitch?.login??'unknown';
      const pending=Object.values(state.markets).filter(m=>m.source==='plot'&&m.prediction.channel===channel&&!['resolved','void'].includes(m.phase));
      const byCode=(code:string)=>{const matches=pending.filter(m=>m.shortId===code);if(!matches.length)throw new PlotCommandError(`No hay un mercado pendiente con código ${code} en este canal. Usá !plot mercados para verlos.`);return matches[0];};
      // Ambiguity guard: never debit points or mutate a market guessed from position or recency.
      const resolveTarget=(id?:string,extra?:(m:Market)=>boolean)=>{const candidates=extra?pending.filter(extra):pending;if(id)return byCode(id);if(candidates.length===1)return candidates[0];throw new PlotCommandError(candidates.length?'Hay varios mercados pendientes. Indicá el código: usá !plot mercados para verlos.':'No hay una predicción de Plot pendiente en este canal.');};
      let text:string;let target:Market|undefined;
      if(command.kind==='create'){
        const id=`plot-${createHash('sha256').update(channelId+':'+eventId).digest('hex').slice(0,32)}`,stamp=now();
        const prediction=predictionSchema.parse({id,channel,title:command.title,status:'ACTIVE',createdAt:stamp,predictionWindowSeconds:120,outcomes:command.options.map((title,i)=>({id:String(i+1),title}))});
        if(new Set(prediction.outcomes.map(o=>o.title.toLocaleLowerCase())).size!==prediction.outcomes.length||prediction.outcomes.length>6)throw new PlotCommandError('Ingresá entre 2 y 6 opciones distintas.');
        target={key:`plot:${channel}:${id}`,prediction,phase:'open',demo:false,source:'plot',ownerTwitchId:channelId,creatorTwitchId:owner?channelId:actorId,shortId:this.nextShortId(state,channel),version:1,createdAt:stamp,updatedAt:stamp,sourceCheckedAt:stamp};
        state.markets[target.key]=target;
        text=`${prediction.title} · ${prediction.outcomes.map((o,i)=>`!${i+1} ${o.title}`).join(' · ')} · Código ${target.shortId} · 100 puntos por apuesta con !plot apostar ${target.shortId}, 1. Abierta 2 minutos.`;
      }else if(command.kind==='list'){
        if(!pending.length)text='No hay predicciones de Plot pendientes en este canal.';
        else text=pending.map(m=>{const v=this.view(state,m);
          // Include each option's share so the chat renderer can draw an aligned bar; the token stays parseable.
          return `${m.shortId} · ${v.phase==='open'?'abierta':'esperando resultado'} · ${m.prediction.title} · ${v.outcomes.map((o,i)=>`!${i+1} ${o.title} ${Math.round(o.share)}%`).join(' · ')}`;}).join(' | ');
      }else{
        target=resolveTarget(command.id);
        if(command.kind==='lock'){
          if(target.phase!=='open')throw new PlotCommandError('Las apuestas de ese mercado ya están cerradas.');
          target.phase='locked';target.operatorLockedAt??=now();target.operatorLockedBy??=account?.wallet;target.prediction.status='LOCKED';target.prediction.lockedAt??=now();
          text=`Apuestas cerradas (${target.shortId}). Usá !plot resolver ${target.shortId}, 1 (número ganador) o !plot cancelar ${target.shortId}.`;
        }else if(command.kind==='resolve'){
          if(this.view(state,target).phase!=='locked')throw new PlotCommandError('Primero cerrá las apuestas con !plot cerrar.');
          const chosen=target.prediction.outcomes[command.option-1];
          if(!chosen)throw new PlotCommandError('Esa opción no existe en esta predicción.');
          this.settle(state,target,chosen.id,'Resultado confirmado por el streamer');
          target.settlement={source:'streamer',wallet:account?.wallet,at:now()};target.prediction.status='RESOLVED';target.prediction.winningOutcomeId=chosen.id;target.prediction.endedAt=now();
          text=`Resultado (${target.shortId}): ${chosen.title}. Revisá tus puntos en Plot.`;
        }else if(command.kind==='cancel'){
          this.settle(state,target,null,'Cancelada por el streamer: reembolso de apuestas');
          target.settlement={source:'streamer',wallet:account?.wallet,at:now()};target.prediction.status='CANCELED';target.prediction.winningOutcomeId=null;target.prediction.endedAt=now();
          text=`Predicción ${target.shortId} cancelada: devolvimos tus puntos automáticamente.`;
        }else{
          if(command.kind!=='bet')throw new PlotCommandError('Operación no soportada');
          const chosen=target.prediction.outcomes[command.option-1];
          if(!chosen)throw new PlotCommandError(`Esa opción no existe. Opciones: ${target.prediction.outcomes.map((o,i)=>`!${i+1} ${o.title}`).join(' · ')}.`);
          const actorAccount=Object.values(state.accounts).find(a=>a.twitch?.id===actorId);
          if(!actorAccount)throw new PlotCommandError('Vinculá tu cuenta de Twitch con Plot para apostar desde el chat.');
          this.betOnDraft(state,actorAccount,target,chosen.id,CHAT_BET_POINTS);
          text=`Apostaste ${CHAT_BET_POINTS} puntos a "${chosen.title}" (${target.shortId}).`;
        }
        target.updatedAt=now();
      }
      const result={key:target?.key??'',text};state.receipts[receiptId]={fingerprint,result};return result;
    });
  }
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
        m={key,prediction:p,ownerTwitchId:state.streamers[p.channel.toLowerCase()]?.twitchId??Object.values(state.accounts).find(a=>a.twitch?.login===p.channel.toLowerCase())?.twitch?.id,phase:'open',demo,version:1,createdAt:now(),updatedAt:now(),sourceCheckedAt:now()};state.markets[key]=m;
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
    m.winnerId=winner??undefined;m.reason=reason;m.settlement={source:m.demo?'demo':'twitch',at:now()};
    if(!winner||!winningPool) {
      // Automatic refund: credited inside the same transaction, once per position, even for offline accounts.
      if(winner)m.reason=bets.length?'No hubo apuestas a la opción ganadora. Todas las apuestas fueron reembolsadas.':'La predicción no recibió apuestas.';
      // Terminal refunded phase: winnerId/reason still distinguish an owner resolve with no winning bets from a cancellation.
      m.phase='void';
      const groups=new Map<string,Bet[]>();
      // Idempotency: positions already credited (refund/claim/distribution) are never re-credited.
      const refundable=bets.filter(b=>!b.claimed&&b.creditMethod===undefined);
      for(const b of refundable){b.payout=b.amount;b.claimed=true;b.creditedAt=now();b.creditMethod='refund';groups.set(b.accountId,[...(groups.get(b.accountId)??[]),b]);}
      for(const [accountId,group] of groups){const amount=group.reduce((n,b)=>n+b.amount,0);if(amount>0)this.ledger(state,state.accounts[accountId],'refund',amount,m.key);}
      return;
    }
    const fees=pointFees(pool);this.creditFees(state,m,fees);m.fees=fees;
    // Largest remainder allocation conserves every distributable point after the two shares.
    const allocation=winners.map(b=>{const numerator=BigInt(b.amount)*BigInt(fees.winners);return {bet:b,paid:Number(numerator/BigInt(winningPool)),remainder:numerator%BigInt(winningPool)};});
    let remaining=fees.winners-allocation.reduce((sum,a)=>sum+a.paid,0);
    allocation.sort((a,b)=>a.remainder===b.remainder?a.bet.id.localeCompare(b.bet.id):a.remainder>b.remainder?-1:1);
      for(const a of allocation){if(remaining>0){a.paid++;remaining--;}a.bet.payout=a.paid;}
    m.phase='resolved';
  }
  async bet(token:string,key:string,outcomeId:string,amount:number,requestId:string) {
    if(!Number.isSafeInteger(amount)||amount<=0||amount>1_000_000)throw new Error('Ingresá puntos enteros entre 1 y 1.000.000');
    return this.transaction(state=>{
      const account=this.account(state,token);const id=`${account.id}:${requestId}`;const fingerprint=JSON.stringify(['bet',key,outcomeId,amount]);
      const previous=state.receipts[id];if(previous){if(previous.fingerprint!==fingerprint)throw new Error('ID de operación reutilizado con otros datos');return previous.result;}
      this.requireViewer(state,account);
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
  /** Chat bet from a linked Twitch account, paid from the internal Plot balance (S19a). */
  async chatBet(twitchId:string,key:string,outcomeId:string,requestId:string) {
    return this.transaction<{betId:string;amount:number;outcomeId:string;balance:number}>(state=>{
      const account=Object.values(state.accounts).find(a=>a.twitch?.id===twitchId);
      if(!account)throw new PlotCommandError('Vinculá tu cuenta de Twitch con Plot para apostar desde el chat.');
      const id=`${account.id}:${requestId}`,fingerprint=JSON.stringify(['chatBet',key,outcomeId]);
      const previous=state.receipts[id];if(previous){if(previous.fingerprint!==fingerprint)throw new PlotCommandError('ID de operación reutilizado con otros datos');return previous.result as {betId:string;amount:number;outcomeId:string;balance:number};}
      this.requireViewer(state,account);
      const m=state.markets[key];if(!m||!this.view(state,m).canBet)throw new PlotCommandError('La apuesta está cerrada o falta actualizar Twitch');
      if(!m.prediction.outcomes.some(o=>o.id===outcomeId))throw new PlotCommandError('Opción inválida');
      const amount=CHAT_BET_POINTS;
      const pool=state.bets.filter(b=>b.marketKey===key).reduce((sum,b)=>sum+b.amount,0);if(!Number.isSafeInteger(pool+amount))throw new PlotCommandError('El pozo alcanzó el límite');
      this.ledger(state,account,'bet',-amount,key);
      const bet:Bet={id:randomUUID(),accountId:account.id,wallet:account.wallet,marketKey:key,outcomeId,amount,payout:0,claimed:false,createdAt:now()};state.bets.push(bet);
      const result={betId:bet.id,amount,outcomeId,balance:account.balance};state.receipts[id]={fingerprint,result};return result;
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
      const registration=state.streamers[name]??=( {channel:name,wallet,assignedAt:now()} );this.collectStreamerFees(state,Object.values(state.accounts).find(a=>a.wallet===wallet)!);return registration;
    });
  }
  async linkTwitch(token:string,identity:TwitchIdentity){
    if(!/^\d+$/.test(identity.id)||!/^[a-z0-9_]{1,40}$/.test(identity.login))throw new Error('Identidad de Twitch inválida');
    return this.transaction(state=>{
      const a=this.account(state,token);
      // Viewers may link without a wallet; streamer registration still requires one below.
      if(a.twitch&&a.twitch.id!==identity.id)throw new Error('Esta cuenta ya tiene otra cuenta de Twitch conectada. Desconectala primero.');
      const previousOwner=Object.values(state.accounts).find(other=>other.id!==a.id&&other.twitch?.id===identity.id);
      if(previousOwner)throw new Error('Esta cuenta de Twitch ya está vinculada a otra cuenta de Plot');
      const owner=state.streamers[identity.login];
      if(owner?.twitchId&&owner.wallet&&owner.wallet!==a.wallet)throw new Error('El canal ya está vinculado a otra wallet');
      if(!state.channels.includes(identity.login)&&state.channels.length>=30)throw new Error('Quitá un canal seguido antes de conectar otro');
      for(const [name,s] of Object.entries(state.streamers))if(s.twitchId===identity.id&&s.wallet!==a.wallet)delete state.streamers[name];
      a.twitch={...identity};
      // Channel registration is a streamer capability: only wallet-backed accounts claim channels.
      if(a.wallet&&!state.channels.includes(identity.login))state.channels.push(identity.login);
      if(a.wallet)state.streamers[identity.login]={channel:identity.login,wallet:a.wallet,twitchId:identity.id,assignedAt:now()};
      this.grantStartingPoints(state,a);this.collectStreamerFees(state,a);
      return {twitch:a.twitch,channel:identity.login};
    });
  }
  async unlinkTwitch(token:string){
    return this.transaction(state=>{const a=this.account(state,token);for(const [channel,s] of Object.entries(state.streamers))if(s.twitchId&&s.wallet===a.wallet)delete state.streamers[channel];delete a.twitch;delete a.botEnabled;delete a.botEpoch;return {ok:true};});
  }
  /** Linking Google keeps the accountId and balance; a Google identity owned by another account is a conflict, never a merge. */
  async linkGoogle(token:string,identity:{id:string;email?:string;displayName:string;linkedAt:string}){
    if(!/^[0-9A-Za-z_-]{1,128}$/.test(identity.id))throw new Error('Identidad de Google inválida');
    return this.transaction(state=>{
      const a=this.account(state,token);
      if(a.google&&a.google.id!==identity.id)throw new Error('Esta cuenta ya tiene otra cuenta de Google conectada. Desconectala primero.');
      const previousOwner=Object.values(state.accounts).find(other=>other.id!==a.id&&other.google?.id===identity.id);
      if(previousOwner)throw new Error('Esta cuenta de Google ya está vinculada a otra cuenta de Plot');
      a.google={...identity};
      return {google:a.google};
    });
  }
  async unlinkGoogle(token:string){
    return this.transaction(state=>{const a=this.account(state,token);if(!a.twitch&&!a.wallet)throw new Error('No podés desconectar tu único método de acceso');delete a.google;return {ok:true};});
  }
  /** Read-only JSON snapshot for auditors and repair tools; callers must never mutate it. */
  exportStateJson():string {return JSON.stringify(this.state);}
  private streamer(state:State,token:string,key?:string){
    const a=this.account(state,token);// Real channels require the linked Twitch identity; the demo channel stays with its assigned wallet.
    const channels=this.managedChannels(state,a);
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
    this.settle(state,m,winnerId,'Vista previa');return {phase:m.phase,reason:m.reason,pool:this.view(state,m).totalPoints,fees:m.fees,bets:this.roster(state,m)};
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
