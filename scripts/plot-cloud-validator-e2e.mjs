// Test-only end-to-end: ephemeral keys, isolated validator, PostgreSQL namespace/schema and Portless HTTP.
// PLOT_E2E_PG_URL and PORTLESS_URL are required; pass Anchor programs/plot path as argv[2].
import {createRequire} from 'node:module';
import {createPrivateKey,sign,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {Documents} from '../src/cloud/documents.ts';
import {cloudApp} from '../src/cloud/app.ts';
import {createPlotRuntimeFromEnv} from '../src/cloud/plot/runtime.ts';
import {changeMarketInstruction} from '../src/cloud/plot/solana.ts';
import {twitchMarketHash,twitchOutcomeHash} from '../src/cloud/plot/identity.ts';
import {TwitchProjection} from '../src/cloud/plot/twitch.ts';
import pg from 'pg';
const root=process.argv[2],db=process.env.PLOT_E2E_PG_URL,base=process.env.PORTLESS_URL;
if(!root?.startsWith('/')||!db||!base||!process.env.PORT)throw new Error('Require absolute Anchor path, PLOT_E2E_PG_URL and Portless');
const require=createRequire(join(root,'tests/package.json')),anchor=require('@coral-xyz/anchor'),web3=require('@solana/web3.js'),spl=require('@solana/spl-token');
const idl=JSON.parse(readFileSync(join(root,'idl/plot.json'),'utf8')),programId=new web3.PublicKey(idl.address),admin=web3.Keypair.generate(),payment=web3.Keypair.generate(),resolver=web3.Keypair.generate(),sponsor=web3.Keypair.generate(),alice=process.env.PLOT_E2E_KEEP_OPEN==='1'?{publicKey:new web3.PublicKey(process.env.PLOT_E2E_WALLET_PUBLIC_KEY??'')}:web3.Keypair.generate(),streamer=web3.Keypair.generate(),mint=web3.Keypair.generate();
const pda=(...seeds)=>web3.PublicKey.findProgramAddressSync(seeds,programId)[0],config=pda(Buffer.from('config')),mintAuthority=pda(Buffer.from('mint_authority')),systemProgram=web3.SystemProgram.programId,tokenProgram=spl.TOKEN_2022_PROGRAM_ID;
const ledger=mkdtempSync(join(tmpdir(),'plot-cloud-validator-')),namespace='plot_e2e_'+randomUUID(),sponsorDatabase='plot_sponsor_'+randomUUID().replaceAll('-','');
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const port=await freePort();let faucet;do{faucet=await freePort();}while(Math.abs(faucet-port)<=2);let gossip;do{gossip=await freePort();}while(Math.abs(gossip-port)<=2||Math.abs(gossip-faucet)<=2);
const validator=spawn('solana-test-validator',['--mint',admin.publicKey.toBase58(),'--gossip-port',String(gossip),'--ledger',ledger,'--rpc-port',String(port),'--faucet-port',String(faucet),'--upgradeable-program',programId.toBase58(),join(root,'onchain/target/deploy/plot.so'),admin.publicKey.toBase58(),'--quiet'],{stdio:['ignore','ignore','pipe']});
let logs='';validator.stderr.on('data',c=>{logs+=c;});let connection,docs,server,runtime,adminPool;
try{
 connection=new web3.Connection(`http://127.0.0.1:${port}`,'confirmed');let ready=false;
 for(let i=0;i<120;i++){if(validator.exitCode!==null)throw new Error(`Validator exited ${logs}`);try{await connection.getLatestBlockhash();ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
 if(!ready)throw new Error('Validator unavailable');
 for(const key of [admin,payment,resolver,sponsor]){const sig=await connection.requestAirdrop(key.publicKey,2*web3.LAMPORTS_PER_SOL);await connection.confirmTransaction(sig,'confirmed');}
 const provider=new anchor.AnchorProvider(connection,new anchor.Wallet(admin),{commitment:'confirmed'}),program=new anchor.Program(idl,provider),[programData]=web3.PublicKey.findProgramAddressSync([programId.toBuffer()],new web3.PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'));
 await program.methods.initializeConfig(payment.publicKey,resolver.publicKey,admin.publicKey,200,200).accountsStrict({admin:admin.publicKey,program:programId,programData,config,systemProgram}).rpc();
 await program.methods.initializeMint(0).accountsStrict({admin:admin.publicKey,config,mint:mint.publicKey,mintAuthority,tokenProgram,systemProgram}).signers([mint]).rpc();
 if(process.env.PLOT_E2E_KEEP_OPEN==='1')await spl.getOrCreateAssociatedTokenAccount(connection,admin,mint.publicKey,alice.publicKey,false,'confirmed',undefined,tokenProgram);
 else {const ata=spl.getAssociatedTokenAddressSync(mint.publicKey,alice.publicKey,false,tokenProgram);assert.equal(await connection.getAccountInfo(ata),null);assert.equal(await connection.getBalance(alice.publicKey),0);}
 const broadcaster='test-broadcaster',prediction='test-prediction',outcomes=['yes','no'],identity=twitchMarketHash(broadcaster,prediction),hashes=Object.fromEntries(outcomes.map(x=>[x,twitchOutcomeHash(broadcaster,prediction,x)]));
 const now=await connection.getBlockTime(await connection.getSlot('confirmed')),windowSeconds=process.env.PLOT_E2E_KEEP_OPEN==='1'?3600:90,market=pda(Buffer.from('market'),config.toBuffer(),Buffer.from(identity,'hex'));
 const marketSig=await program.methods.createMarket([...Buffer.from(identity,'hex')],outcomes.map(o=>[...Buffer.from(hashes[o],'hex')]),new anchor.BN(now+windowSeconds),new anchor.BN(now+windowSeconds+120),streamer.publicKey).accountsStrict({operator:resolver.publicKey,config,market,systemProgram}).signers([resolver]).rpc();
 await connection.confirmTransaction(marketSig,'finalized');
 docs=new Documents(db,namespace);await docs.migrate();const projection=new TwitchProjection(docs.pool,namespace);await projection.register({wallet:streamer.publicKey.toBase58(),twitch:{id:broadcaster}},{broadcaster,prediction,outcomes,closesAt:new Date((now+windowSeconds)*1000).toISOString(),timeoutAt:new Date((now+windowSeconds+120)*1000).toISOString()});
 adminPool=new pg.Pool({connectionString:db});await adminPool.query(`CREATE DATABASE "${sponsorDatabase}"`);
 const sponsorUrl=new URL(db);sponsorUrl.pathname=`/${sponsorDatabase}`;
 const testEnv={DATABASE_URL:db,PLOT_ONCHAIN_ENABLED:'true',PLOT_TEST_NETWORK:'localnet',PLOT_TEST_RPC_URL:`http://127.0.0.1:${port}`,PLOT_TEST_GENESIS:await connection.getGenesisHash(),PLOT_PROGRAM_ID:programId.toBase58(),PLOT_MINT:mint.publicKey.toBase58(),PLOT_PAYMENT_KEYPAIR:JSON.stringify([...payment.secretKey]),PLOT_RESOLVER_KEYPAIR:JSON.stringify([...resolver.secretKey]),PLOT_SPONSOR_KEYPAIR:JSON.stringify([...sponsor.secretKey]),PLOT_SPONSOR_DATABASE_URL:sponsorUrl.toString(),PLOT_SPONSOR_MAX_FEE:'100000',PLOT_SPONSOR_MAX_RENT:'100000000',PLOT_SPONSOR_MAX_PER_USER:'200200000',PLOT_SPONSOR_MAX_GLOBAL:'200200000',PLOT_SPONSOR_MAX_NEW_ACCOUNTS:'1',PLOT_SPONSOR_MAX_ACCOUNTS_PER_USER:'1',PLOT_SPONSOR_MAX_ACCOUNTS_GLOBAL:'1',PLOT_SPONSOR_MAX_REQUESTS_PER_HOUR:'10',PLOT_MOCK_CONFIRM_ENABLED:'true'};
 runtime=await createPlotRuntimeFromEnv(docs,testEnv);assert.ok(runtime);
 const authOrigin=process.env.PLOT_E2E_AUTH_ORIGIN??'https://plot.example';
 const app=cloudApp(docs,{AUTH_ORIGIN:authOrigin,DATABASE_URL:db,PLOT_NAMESPACE:namespace,PLOT_E2E_LOCAL_ORIGIN:'true',PLOT_TEST_NETWORK:'localnet'},runtime.dependencies);server=app.listen(Number(process.env.PORT),'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=async(path,body,headers={})=>fetch(`${base}${path}`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 if(process.env.PLOT_E2E_KEEP_OPEN==='1'){
  let canceling=false;const cancel=()=>{if(canceling)return;canceling=true;void (async()=>{
   try{const signature=await provider.sendAndConfirm(new web3.Transaction().add(changeMarketInstruction({program:programId,actor:resolver.publicKey,identity,operation:'cancel_market'})),[resolver]);await connection.confirmTransaction(signature,'finalized');await projection.ingest({id:`local-cancel:${identity}`,broadcaster,prediction,kind:'cancel',source:'streamer'});console.log('Local test market canceled and finalized');}catch{console.error('Local test cancellation failed');canceling=false;}
  })();};process.on('SIGUSR2',cancel);
  console.log(JSON.stringify({mode:'local-test',controlPid:process.pid,apiPort:Number(process.env.PORT),apiUrl:base,rpcPort:port,program:programId.toBase58(),mint:mint.publicKey.toBase58(),wallet:alice.publicKey.toBase58(),marketIdentity:identity}));
  await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});process.off('SIGUSR2',cancel);app.locals.liveMarkets.close();
 }else{
 const challengeResponse=await post('/api/auth/challenge',{address:alice.publicKey.toBase58()});assert.equal(challengeResponse.status,200);const challenge=await challengeResponse.json();
 const privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(alice.secretKey).subarray(0,32)]),format:'der',type:'pkcs8'}),signature=sign(null,Buffer.from(challenge.message),privateKey).toString('base64');
 const loginResponse=await post('/api/auth/verify',{challengeId:challenge.challengeId,signature});assert.equal(loginResponse.status,200);const login=await loginResponse.json();const headers={authorization:`Bearer ${login.token}`,'Idempotency-Key':'fixture-prediction'};
 const purchaseHeaders={authorization:headers.authorization};
 const order=await post('/api/plot/v1/orders',{idempotencyKey:'fixture-purchase',package:'small'},purchaseHeaders);assert.equal(order.status,200);
 assert.equal((await post('/api/plot/v1/orders/fixture-purchase/confirm',{},purchaseHeaders)).status,200);
 const creditResponse=await post('/api/plot/v1/orders/fixture-purchase/reconcile',{},purchaseHeaders);assert.equal(creditResponse.status,200);const credit=await creditResponse.json();assert.ok(credit.signature);
 const status=await connection.getSignatureStatuses([credit.signature],{searchTransactionHistory:true});if(status.value[0]?.confirmationStatus!=='finalized')await connection.confirmTransaction(credit.signature,'finalized');
 assert.equal((await post('/api/plot/v1/orders/fixture-purchase/reconcile',{},purchaseHeaders)).status,200);
 const markets=await fetch(`${base}/api/plot/v1/markets`);assert.equal(markets.status,200);const marketData=await markets.json();assert.equal(marketData.markets[0].marketIdentity,identity);assert.equal(marketData.markets[0].options[0].optionIndex,0);
 const denied=await post('/api/plot/v1/intents',{wallet:alice.publicKey.toBase58(),operation:'place_prediction',parameters:{marketIdentity:identity,option:0,amount:'400',sequence:'0'}},{'Idempotency-Key':'no-session'});assert.equal(denied.status,401);
 const preparedResponse=await post('/api/plot/v1/intents',{wallet:alice.publicKey.toBase58(),operation:'place_prediction',parameters:{marketIdentity:identity,option:0,amount:'400',sequence:'0'}},headers);assert.equal(preparedResponse.status,200);const prepared=await preparedResponse.json();
 const transaction=web3.Transaction.from(Buffer.from(prepared.transaction,'base64'));transaction.partialSign(alice);
 const submittedResponse=await post(`/api/plot/v1/intents/${prepared.id}/submit`,{transaction:transaction.serialize({requireAllSignatures:false}).toString('base64')},headers);assert.equal(submittedResponse.status,200);const submitted=await submittedResponse.json();
 const confirmation=await connection.confirmTransaction({signature:submitted.signature,blockhash:transaction.recentBlockhash,lastValidBlockHeight:prepared.lastValidBlockHeight},'finalized');assert.equal(confirmation.value.err,null);
 const accountResponse=await fetch(`${base}/api/plot/v1/account`,{headers:{authorization:headers.authorization}});assert.equal(accountResponse.status,200);const account=await accountResponse.json();assert.equal(account.wallet,alice.publicKey.toBase58());assert.equal(account.balance,'200');assert.equal(account.positions[0].stake,'400');assert.equal(account.positions[0].sequence,'1');assert.equal(account.positions[0].optionIndex,0);assert.equal(await connection.getBalance(alice.publicKey),0);
 const canceled=await provider.sendAndConfirm(new web3.Transaction().add(changeMarketInstruction({program:programId,actor:resolver.publicKey,identity,operation:'cancel_market'})),[resolver]);await connection.confirmTransaction(canceled,'finalized');
 const claimHeaders={authorization:headers.authorization,'Idempotency-Key':'fixture-claim'};
 const claimResponse=await post('/api/plot/v1/intents',{wallet:alice.publicKey.toBase58(),operation:'claim',parameters:{marketIdentity:identity}},claimHeaders);assert.equal(claimResponse.status,200);const claim=await claimResponse.json();
 const claimTx=web3.Transaction.from(Buffer.from(claim.transaction,'base64'));claimTx.partialSign(alice);
 const sentClaim=await post(`/api/plot/v1/intents/${claim.id}/submit`,{transaction:claimTx.serialize({requireAllSignatures:false}).toString('base64')},claimHeaders);assert.equal(sentClaim.status,200);const claimResult=await sentClaim.json();
 const claimFinal=await connection.confirmTransaction({signature:claimResult.signature,blockhash:claimTx.recentBlockhash,lastValidBlockHeight:claim.lastValidBlockHeight},'finalized');assert.equal(claimFinal.value.err,null);
 const finalResponse=await fetch(`${base}/api/plot/v1/account`,{headers:{authorization:headers.authorization}});const final=await finalResponse.json();assert.equal(final.balance,'600');assert.equal(final.positions[0].payout,'400');assert.equal(final.positions[0].claimed,true);assert.equal(await connection.getBalance(alice.publicKey),0);
 console.log('PASS: cloud SIWS, mock purchase with sponsored ATA creation, sponsor prediction and cancel/claim via PostgreSQL and zero-SOL validator');app.locals.liveMarkets.close();
 }
}finally{
 if(server)await new Promise(r=>server.close(()=>r()));if(docs)await docs.close();if(runtime)await runtime.close();if(adminPool){await adminPool.query(`DROP DATABASE IF EXISTS "${sponsorDatabase}"`);await adminPool.end();}
 if(connection)connection._rpcWebSocket.close();if(validator.exitCode===null&&validator.signalCode===null){validator.kill('SIGTERM');await new Promise(r=>validator.once('exit',r));}rmSync(ledger,{recursive:true,force:true});
}
