/** Compatibility layer for Anchor program commit f6bb39d. Verify against generated IDL before deployment. */
import {createHash} from 'node:crypto';
import {Connection,PublicKey,SystemProgram,Transaction,TransactionInstruction,type AccountInfo,type Keypair} from '@solana/web3.js';
import type {CreditReceipt,PlotChain} from './chain.js';
import {twitchMarketHash} from './identity.js';
import type {ChainMarketState,ReconciledPlotMarketChain} from './twitch.js';

export const TOKEN_2022=new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const hash=(s:string)=>createHash('sha256').update(s).digest().subarray(0,8);
const meta=(pubkey:PublicKey,isSigner=false,isWritable=false)=>({pubkey,isSigner,isWritable});
const seed=(hex:string)=>{if(!/^[0-9a-f]{64}$/.test(hex))throw new Error('Expected 32-byte lowercase hash');return Buffer.from(hex,'hex');};
const amountBytes=(value:string)=>{if(!/^[1-9][0-9]*$/.test(value)||BigInt(value)>18446744073709551615n)throw new Error('Invalid PLOT amount');const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(value));return b;};
export function plotAddresses(program:PublicKey){
 const pda=(seeds:Buffer[])=>PublicKey.findProgramAddressSync(seeds,program)[0];
 const config=pda([Buffer.from('config')]);return {config,mintAuthority:pda([Buffer.from('mint_authority')]),payment:(key:string)=>pda([Buffer.from('payment'),config.toBuffer(),seed(key)]),position:(market:PublicKey,owner:PublicKey)=>pda([Buffer.from('position'),market.toBuffer(),owner.toBuffer()]),market:(identity:string)=>pda([Buffer.from('market'),config.toBuffer(),seed(identity)])};
}
export function token2022Ata(owner:PublicKey,mint:PublicKey){return PublicKey.findProgramAddressSync([owner.toBuffer(),TOKEN_2022.toBuffer(),mint.toBuffer()],ASSOCIATED_TOKEN)[0];}
export function creditInstruction(args:{program:PublicKey;authority:PublicKey;mint:PublicKey;owner:PublicKey;key:string;amount:string}){
 const {program,authority,mint,owner,key}=args,a=plotAddresses(program);
 return new TransactionInstruction({programId:program,keys:[meta(authority,true,true),meta(a.config),meta(mint,false,true),meta(owner),meta(token2022Ata(owner,mint),false,true),meta(a.mintAuthority),meta(a.payment(key),false,true),meta(TOKEN_2022),meta(SystemProgram.programId)],data:Buffer.concat([hash('global:credit_points'),seed(key),amountBytes(args.amount)])});
}
export function changeMarketInstruction(args:{program:PublicKey;actor:PublicKey;identity:string;operation:'lock_market'|'cancel_market'}){
 const a=plotAddresses(args.program);return new TransactionInstruction({programId:args.program,keys:[meta(args.actor,true),meta(a.config),meta(a.market(args.identity),false,true)],data:hash(`global:${args.operation}`)});
}
export function resolveInstruction(args:{program:PublicKey;resolver:PublicKey;identity:string;mint:PublicKey;treasury:PublicKey;streamer:PublicKey;winner:number}){
 if(!Number.isInteger(args.winner)||args.winner<0||args.winner>5)throw new Error('Invalid option');
 const a=plotAddresses(args.program);return new TransactionInstruction({programId:args.program,keys:[meta(args.resolver,true),meta(a.config),meta(a.market(args.identity),false,true),meta(args.mint,false,true),meta(args.treasury),meta(args.streamer),meta(token2022Ata(args.treasury,args.mint),false,true),meta(token2022Ata(args.streamer,args.mint),false,true),meta(a.mintAuthority),meta(TOKEN_2022)],data:Buffer.concat([hash('global:resolve_market'),Buffer.from([args.winner])])});
}
function checkedAccount(account:AccountInfo<Buffer>|null,program:PublicKey,name:string,minLength:number){
 if(!account)return null;if(!account.owner.equals(program)||account.data.length<minLength||!account.data.subarray(0,8).equals(hash(`account:${name}`)))throw new Error(`Invalid ${name} account`);return account.data;
}
export type MarketBinding={identity:string; optionHashes:Record<string,string>};
/** No network or key is selected here. The integrator supplies a verified RPC and authority-specific sender. */
export interface PlotSolanaTransport { account(address:PublicKey):Promise<AccountInfo<Buffer>|null>; send(instruction:TransactionInstruction,authority:'payment'|'resolver'):Promise<string> }
export class SolanaPlotAdapter implements PlotChain,ReconciledPlotMarketChain {
 constructor(private transport:PlotSolanaTransport,private config:{program:PublicKey;mint:PublicKey;paymentAuthority:PublicKey;resolver:PublicKey;binding:(broadcaster:string,prediction:string)=>Promise<MarketBinding>}){}
 private async assertConfig(){
  const data=checkedAccount(await this.transport.account(plotAddresses(this.config.program).config),this.config.program,'Config',174);
  if(!data||data[8]!==1||!data.subarray(41,73).equals(this.config.mint.toBuffer())||!data.subarray(73,105).equals(this.config.paymentAuthority.toBuffer())||!data.subarray(105,137).equals(this.config.resolver.toBuffer()))throw new Error('Plot config mismatch');
 }
 async findPaymentReceipt(key:string):Promise<CreditReceipt|null>{
  await this.assertConfig();
  const data=checkedAccount(await this.transport.account(plotAddresses(this.config.program).payment(key)),this.config.program,'PaymentReceipt',113);if(!data)return null;
  if(data[8]!==1||!data.subarray(81,113).equals(seed(key)))throw new Error('Invalid PaymentReceipt');
  const mint=new PublicKey(data.subarray(41,73));if(!mint.equals(this.config.mint))throw new Error('PaymentReceipt mint mismatch');
  return {key,wallet:new PublicKey(data.subarray(9,41)).toBase58(),amount:data.readBigUInt64LE(73).toString(),signature:null,finalized:true};
 }
 async submitCredit(input:{key:string;wallet:string;amount:string}){await this.assertConfig();return this.transport.send(creditInstruction({program:this.config.program,authority:this.config.paymentAuthority,mint:this.config.mint,owner:new PublicKey(input.wallet),...input}), 'payment');}
 private async market(broadcaster:string,prediction:string){
  await this.assertConfig();
  const binding=await this.config.binding(broadcaster,prediction),a=plotAddresses(this.config.program),data=checkedAccount(await this.transport.account(a.market(binding.identity)),this.config.program,'Market',449);
  if(binding.identity!==twitchMarketHash(broadcaster,prediction))throw new Error('Market identity mapping mismatch');
  if(!data||!data.subarray(8,40).equals(a.config.toBuffer())||data[40]!==1||!data.subarray(41,73).equals(seed(binding.identity)))throw new Error('Market account mismatch');
  const count=data[297];if(count<2||count>6)throw new Error('Invalid option count');
  const state=data[446],winner=data[447];if(state>3||state===2&&winner>=count)throw new Error('Invalid market state');
  return {binding,data,count,state,winner};
 }
 async read(broadcaster:string,prediction:string):Promise<ChainMarketState>{
  const m=await this.market(broadcaster,prediction),phase=(['open','locked','resolved','canceled'] as const)[m.state];
  const hashValue=m.data.subarray(105+m.winner*32,137+m.winner*32).toString('hex');
  const winner=Object.entries(m.binding.optionHashes).find(([,value])=>value===hashValue)?.[0];
  if(phase==='resolved'&&!winner)throw new Error('Winner mapping missing');return {phase,...(phase==='resolved'?{winner}: {})};
 }
 async marketView(broadcaster:string,prediction:string){
  const m=await this.market(broadcaster,prediction),phase=(['open','locked','resolved','canceled'] as const)[m.state],options:{id:string;optionIndex:number;stake:string}[]=[];
  for(let i=0;i<m.count;i++){
   const optionHash=m.data.subarray(105+i*32,137+i*32).toString('hex');
   const matches=Object.entries(m.binding.optionHashes).filter(([,value])=>value===optionHash);
   if(matches.length!==1)throw new Error('Option mapping mismatch');
   options.push({id:matches[0][0],optionIndex:i,stake:m.data.readBigUInt64LE(314+i*8).toString()});
  }
  if(new Set(options.map(o=>o.id)).size!==m.count||Object.keys(m.binding.optionHashes).length!==m.count)throw new Error('Option mapping mismatch');
  const gross=m.data.readBigUInt64LE(362),treasuryBps=BigInt(m.data.readUInt16LE(442)),streamerBps=BigInt(m.data.readUInt16LE(444));
  return {chainStatus:phase,options,streamerFee:phase==='resolved'?(gross*streamerBps/10000n).toString():phase==='canceled'?'0':null,treasuryFee:phase==='resolved'?(gross*treasuryBps/10000n).toString():phase==='canceled'?'0':null};
 }
 async account(wallet:string,markets:{broadcaster:string;prediction:string}[]){
  await this.assertConfig();const owner=new PublicKey(wallet),addresses=plotAddresses(this.config.program);
  const token=await this.transport.account(token2022Ata(owner,this.config.mint));let balance='0';
  if(token){if(!token.owner.equals(TOKEN_2022)||token.data.length<165||!token.data.subarray(0,32).equals(this.config.mint.toBuffer())||!token.data.subarray(32,64).equals(owner.toBuffer())||![1,2].includes(token.data[108]))throw new Error('Invalid PLOT token account');balance=token.data.readBigUInt64LE(64).toString();}
  const positions:{marketId:string;optionId:string;optionIndex:number;sequence:string;stake:string;payout:string|null;claimed:boolean;chainStatus:ChainMarketState['phase']}[]=[];
  for(const item of markets){
   const m=await this.market(item.broadcaster,item.prediction),marketAddress=addresses.market(m.binding.identity);
   const data=checkedAccount(await this.transport.account(addresses.position(marketAddress,owner)),this.config.program,'Position',92);if(!data)continue;
   if(data[8]!==1||!data.subarray(9,41).equals(marketAddress.toBuffer())||!data.subarray(41,73).equals(owner.toBuffer())||data[73]>=m.count||![0,1].includes(data[90]))throw new Error('Invalid position');
   const optionHash=m.data.subarray(105+data[73]*32,137+data[73]*32).toString('hex'),optionId=Object.entries(m.binding.optionHashes).find(([,value])=>value===optionHash)?.[0];
   if(!optionId)throw new Error('Position option mapping missing');
   const stake=data.readBigUInt64LE(74),phase=(['open','locked','resolved','canceled'] as const)[m.state];let payout:string|null=null;
   if(phase==='canceled')payout=stake.toString();
   if(phase==='resolved'){
    const total=m.data.readBigUInt64LE(314+m.winner*8),net=m.data.readBigUInt64LE(370);
    if(total===0n)throw new Error('Invalid winning total');payout=(data[73]===m.winner?stake*net/total:0n).toString();
   }
   positions.push({marketId:`${item.broadcaster}:${item.prediction}`,optionId,optionIndex:data[73],sequence:data.readBigUInt64LE(82).toString(),stake:stake.toString(),payout,claimed:data[90]===1,chainStatus:phase});
  }
  return {wallet:owner.toBase58(),balance,positions,readStatus:'finalized' as const};
 }
 async lock(broadcaster:string,prediction:string){const m=await this.market(broadcaster,prediction);await this.transport.send(changeMarketInstruction({program:this.config.program,actor:this.config.resolver,identity:m.binding.identity,operation:'lock_market'}),'resolver');}
 async cancel(broadcaster:string,prediction:string){const m=await this.market(broadcaster,prediction);await this.transport.send(changeMarketInstruction({program:this.config.program,actor:this.config.resolver,identity:m.binding.identity,operation:'cancel_market'}),'resolver');}
 async resolve(broadcaster:string,prediction:string,winner:string){
  const m=await this.market(broadcaster,prediction),expected=seed(m.binding.optionHashes[winner]??'');let option=-1;
  for(let i=0;i<m.count;i++)if(m.data.subarray(105+i*32,137+i*32).equals(expected)){option=i;break;}
  if(option<0)throw new Error('Winner mapping mismatch');
  await this.transport.send(resolveInstruction({program:this.config.program,resolver:this.config.resolver,identity:m.binding.identity,mint:this.config.mint,treasury:new PublicKey(m.data.subarray(378,410)),streamer:new PublicKey(m.data.subarray(410,442)),winner:option}),'resolver');
 }
}
/** Explicit opt-in. Local RPC must be loopback; devnet requires its genesis hash. */
export async function verifiedTestConnection(url:string,network:'localnet'|'devnet',expectedLocalGenesis?:string){
 if(network!=='localnet'&&network!=='devnet')throw new Error('Explicit test network required');
 if(network==='localnet'&&!expectedLocalGenesis)throw new Error('Local genesis required');
 const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Invalid RPC URL');
 if(network==='localnet'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw new Error('Localnet RPC must be loopback');
 const connection=new Connection(url,'finalized'),genesis=await connection.getGenesisHash();
 if(network==='devnet'&&genesis!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw new Error('RPC is not devnet');
 if(network==='localnet'&&(genesis!==expectedLocalGenesis||['5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'].includes(genesis)))throw new Error('RPC is not localnet');
 return connection;
}

/** Connect this only to a connection returned by verifiedTestConnection. */
export function finalizedRpcTransport(connection:Connection,send:PlotSolanaTransport['send']):PlotSolanaTransport{
 return {account:address=>connection.getAccountInfo(address,'finalized'),send};
}

/** Opens only an explicitly selected and genesis-verified test cluster; callers supply test-only keys. */
export async function testRpcTransport(args:{url:string;network:'localnet'|'devnet';expectedLocalGenesis?:string;payment:Keypair;resolver:Keypair}):Promise<PlotSolanaTransport>{
 const connection=await verifiedTestConnection(args.url,args.network,args.expectedLocalGenesis);
 return finalizedRpcTransport(connection,async(instruction,authority)=>{
  const signer=args[authority],{blockhash}=await connection.getLatestBlockhash('finalized');
  const transaction=new Transaction({feePayer:signer.publicKey,recentBlockhash:blockhash}).add(instruction);transaction.sign(signer);
  return connection.sendRawTransaction(transaction.serialize(),{skipPreflight:false,maxRetries:0});
 });
}
