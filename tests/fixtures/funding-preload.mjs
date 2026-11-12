// Test-only transport. Runs only in the isolated Playwright server; never imported by production.
import {readFile,writeFile} from 'node:fs/promises';
import {Keypair,Transaction} from '@solana/web3.js';
import {getBase58Decoder} from '@solana/kit';
const fixture=process.env.FUNDING_FIXTURE_FILE;
if(fixture&&process.env.MARKET_MODE!=='byte'){
  process.env.POINTS_PAYMENTS_ENABLED='true';
  process.env.POINTS_RPC_URL='https://funding-rpc.invalid';
  process.env.POINTS_TREASURY_KEYPAIR=JSON.stringify(Array.from(Keypair.fromSeed(new Uint8Array(32).fill(42)).secretKey));
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url==='https://api.coinbase.com/v2/prices/SOL-USDC/spot')return Response.json({data:{amount:'150',base:'SOL',currency:'USDC'}},{headers:{date:new Date().toUTCString()}});
    if(url!=='https://funding-rpc.invalid')return original(input,init);
    const request=JSON.parse(init.body),state=JSON.parse(await readFile(fixture,'utf8'));
    let result;
    switch(request.method){
      case 'getTokenAccountBalance':result={context:{slot:1},value:{amount:'1000000000',decimals:6,uiAmount:1000,uiAmountString:'1000'}};break;
      case 'getGenesisHash':result='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';break;
      case 'getLatestBlockhash':result={context:{slot:1},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}};break;
      case 'getBlockHeight':result=state.height??10;break;
      case 'getSignatureStatuses':result={context:{slot:1},value:request.params[0].map(signature=>state.transactions[signature]?{slot:1,confirmations:state.finalize?null:1,err:state.fail?{InstructionError:[0,'InsufficientFunds']}:null,confirmationStatus:state.finalize?'finalized':'confirmed'}:null)};break;
      case 'sendTransaction':{
        const tx=Transaction.from(Buffer.from(request.params[0],'base64'));if(!tx.verifySignatures())throw new Error('Unsigned funding transfer');
        result=getBase58Decoder().decode(tx.signature);state.transactions[result]=request.params[0];state.broadcasts++;await writeFile(fixture,JSON.stringify(state));break;
      }
      case 'getTransaction':{
        const raw=state.transactions[request.params[0]];if(!raw){result=null;break;}
        const tx=Transaction.from(Buffer.from(raw,'base64'));
        result={slot:1,blockTime:Math.floor(Date.now()/1000),meta:{err:state.fail?{InstructionError:[0,'InsufficientFunds']}:null,fee:5000,preBalances:[],postBalances:[]},transaction:{message:tx.compileMessage(),signatures:[request.params[0]]}};break;
      }
      default:throw new Error(`Unexpected funding RPC: ${request.method}`);
    }
    return Response.json({jsonrpc:'2.0',id:request.id,result});
  };
}
