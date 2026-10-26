// Test transport only: imported by scripts/e2e-server.ts, never the production entrypoint.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Transaction,PublicKey} from '@solana/web3.js';
import {getBase58Decoder} from '@solana/kit';
const path=process.env.BYTE_FIXTURE_FILE;
const original=globalThis.fetch;
const program='24Vpfc8vEZtTnC9yLmbBHx13PyV8aEHVYBF5YE4BgRYK';
globalThis.fetch=async(input,options)=>{
  const url=String(input);
  if(!url.startsWith('https://app.bytearena.fun/')&&url!=='https://api.devnet.solana.com')return original(input,options);
  const state=JSON.parse(await readFile(path,'utf8'));
  const save=async()=>{const temporary=path+'.'+randomUUID();await writeFile(temporary,JSON.stringify(state));await rename(temporary,path);};
  if(url==='https://api.devnet.solana.com'){
    const body=JSON.parse(options.body);let result;
    if(body.method==='getGenesisHash')result=state.genesis??'EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
    else if(body.method==='getBalance')result={context:{slot:100},value:2_000_000_000};
    else if(body.method==='getLatestBlockhash')result={context:{slot:100},value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:10000}};
    else if(body.method==='getBlockHeight')result=100;
    else if(body.method==='getSignatureStatuses')result={context:{slot:100},value:body.params[0].map(sig=>state.signatures[sig]?{slot:100,confirmations:1,err:null,confirmationStatus:state.pending?'processed':'confirmed'}:null)};
    else if(body.method==='sendTransaction'){
      const tx=Transaction.from(Buffer.from(body.params[0],'base64'));
      if(!tx.verifySignatures()||tx.instructions.length!==1)throw new Error('E2E requires a real valid Ed25519 transaction');
      const ix=tx.instructions[0];if(ix.programId.toBase58()!==program||ix.data.length!==33||!ix.data.subarray(0,8).equals(Buffer.from([222,62,67,220,63,166,126,33])))throw new Error('Incorrect byte instruction');
      const market=state.markets.find(m=>m.chain.market===ix.keys[0].pubkey.toBase58());if(!market||!market.bettable)throw new Error('Market not bettable');
      const option=ix.data[8],amount=Number(ix.data.readBigUInt64LE(9));
      if(amount<100000||amount>100000000||market.total+amount>2000000000)throw new Error('Bet outside limits');
      const [vault]=PublicKey.findProgramAddressSync([Buffer.from('vault'),ix.keys[0].pubkey.toBuffer()],ix.programId);
      const [bet]=PublicKey.findProgramAddressSync([Buffer.from('bet'),ix.keys[0].pubkey.toBuffer(),tx.feePayer.toBuffer(),ix.data.subarray(17,25)],ix.programId);
      if(!vault.equals(ix.keys[1].pubkey)||!bet.equals(ix.keys[2].pubkey))throw new Error('Wrong PDA');
      result=getBase58Decoder().decode(tx.signature);
      if(!state.signatures[result]){market.pools[option]+=amount;market.total+=amount;market.bettors++;state.signatures[result]={marketId:market.id,amount,option};state.broadcasts++;await save();}
    }else return Response.json({jsonrpc:'2.0',id:body.id,error:{code:-32601,message:'Unexpected fixture RPC method'}});
    return Response.json({jsonrpc:'2.0',id:body.id,result});
  }
  const endpoint=new URL(url);
  if(endpoint.pathname==='/api/bets/open')return Response.json({enabled:true,sol:{cluster:'devnet',programId:program,maxBet:100000000,maxPool:2000000000}});
  if(endpoint.pathname.startsWith('/api/partner/')&&new Headers(options?.headers).get('authorization')!=='Bearer byte-e2e-only')return Response.json({error:'Unauthorized fixture'},{status:401});
  if(endpoint.pathname==='/api/partner/markets'&&options?.method==='POST'){
    if(state.partnerError)return Response.json({error:'fixture partner failure'},{status:state.partnerError});
    const body=JSON.parse(options.body),openMs=Date.now();
    const market={id:`pm_${randomUUID()}`,title:body.title,options:body.options,currency:body.currency,status:'open',bettable:true,resolvable:false,openMs,closeMs:openMs+body.windowSecs*1000,chain:{market:new PublicKey(Uint8Array.from({length:32},(_,i)=>i+state.markets.length+1)).toBase58(),settled:false},pools:body.options.map(()=>0),total:0,bettors:0,winner:null,invalidReason:null};
    state.markets.push(market);await save();return Response.json({market},{status:201});
  }
  if(endpoint.pathname==='/api/partner/markets')return Response.json({markets:state.markets.filter(m=>endpoint.searchParams.get('status')==='open'?m.status==='open':m.status!=='open')});
  const id=endpoint.pathname.split('/')[endpoint.pathname.startsWith('/api/predictions/')?3:4];
  const market=state.markets.find(m=>m.id===id);
  if(!market)return Response.json({error:'Not found'},{status:404});
  if(endpoint.pathname.endsWith('/resolve')){const body=JSON.parse(options.body);market.status='resolved';market.winner=body.winner;market.bettable=false;market.resolvable=false;state.resolutions++;await save();}
  if(endpoint.pathname.endsWith('/invalidate')){const body=JSON.parse(options.body);market.status='invalid';market.invalidReason=body.reason;market.bettable=false;market.resolvable=false;state.invalidations++;await save();}
  if(endpoint.pathname.includes('/chain-sync')){state.syncs++;await save();}
  return Response.json({market});
};
