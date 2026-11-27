import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {Keypair,PublicKey,type AccountInfo} from '@solana/web3.js';
import {paymentReceiptKey} from '../src/cloud/plot/payment.js';
import {twitchMarketHash,twitchOutcomeHash} from '../src/cloud/plot/identity.js';
import {SolanaPlotAdapter,creditInstruction,changeMarketInstruction,resolveInstruction,plotAddresses,token2022Ata,TOKEN_2022,verifiedTestConnection,type PlotSolanaTransport} from '../src/cloud/plot/solana.js';
const tag=(name:string)=>createHash('sha256').update(`account:${name}`).digest().subarray(0,8);
const account=(owner:PublicKey,data:Buffer):AccountInfo<Buffer>=>({owner,data,lamports:1,executable:false,rentEpoch:0});
const k=()=>Keypair.generate().publicKey;

test('instructions follow Anchor f6bb39d account order and u64 encoding',()=>{
 const program=k(),authority=k(),mint=k(),owner=k(),treasury=k(),streamer=k(),key='ab'.repeat(32),a=plotAddresses(program);
 const credit=creditInstruction({program,authority,mint,owner,key,amount:'600'});
 assert.equal(credit.data.toString('hex'),'8c2b79f6b050a7b0'+key+'5802000000000000');
 assert.deepEqual(credit.keys.map(x=>x.pubkey.toBase58()),[authority,a.config,mint,owner,token2022Ata(owner,mint),a.mintAuthority,a.payment(key),TOKEN_2022,new PublicKey('11111111111111111111111111111111')].map(x=>x.toBase58()));
 assert.equal(changeMarketInstruction({program,actor:authority,identity:key,operation:'lock_market'}).data.toString('hex'),'6b08b85bdf0db426');
 const resolve=resolveInstruction({program,resolver:authority,identity:key,mint,treasury,streamer,winner:1});assert.equal(resolve.data.toString('hex'),'9b1750ad2e4a17ef01');assert.equal(resolve.keys[6].pubkey.toBase58(),token2022Ata(treasury,mint).toBase58());
 assert.throws(()=>creditInstruction({program,authority,mint,owner,key,amount:'18446744073709551616'}));
});

test('reads verified receipt and finalized balances and settlement from program accounts',async()=>{
 const program=k(),mint=k(),payment=k(),resolver=k(),owner=k(),treasury=k(),streamer=k(),identity=twitchMarketHash('b','p'),key='bb'.repeat(32),yes='11'.repeat(32),no='22'.repeat(32),a=plotAddresses(program),marketAddress=a.market(identity),accounts=new Map<string,AccountInfo<Buffer>>();
 const config=Buffer.alloc(174);tag('Config').copy(config);config[8]=1;mint.toBuffer().copy(config,41);payment.toBuffer().copy(config,73);resolver.toBuffer().copy(config,105);accounts.set(a.config.toBase58(),account(program,config));
 const receipt=Buffer.alloc(113);tag('PaymentReceipt').copy(receipt);receipt[8]=1;owner.toBuffer().copy(receipt,9);mint.toBuffer().copy(receipt,41);receipt.writeBigUInt64LE(600n,73);Buffer.from(key,'hex').copy(receipt,81);accounts.set(a.payment(key).toBase58(),account(program,receipt));
 const market=Buffer.alloc(449);tag('Market').copy(market);a.config.toBuffer().copy(market,8);market[40]=1;Buffer.from(identity,'hex').copy(market,41);Buffer.from(yes,'hex').copy(market,105);Buffer.from(no,'hex').copy(market,137);market[297]=2;market.writeBigUInt64LE(600n,314);market.writeBigUInt64LE(400n,322);market.writeBigUInt64LE(1000n,362);market.writeBigUInt64LE(960n,370);market.writeUInt16LE(200,442);market.writeUInt16LE(200,444);treasury.toBuffer().copy(market,378);streamer.toBuffer().copy(market,410);market[446]=2;market[447]=0;accounts.set(marketAddress.toBase58(),account(program,market));
 const position=Buffer.alloc(92);tag('Position').copy(position);position[8]=1;marketAddress.toBuffer().copy(position,9);owner.toBuffer().copy(position,41);position.writeBigUInt64LE(600n,74);accounts.set(a.position(marketAddress,owner).toBase58(),account(program,position));
 const token=Buffer.alloc(165);mint.toBuffer().copy(token);owner.toBuffer().copy(token,32);token.writeBigUInt64LE(100n,64);token[108]=1;accounts.set(token2022Ata(owner,mint).toBase58(),account(TOKEN_2022,token));
 const sent:string[]=[];const transport:PlotSolanaTransport={async account(address){return accounts.get(address.toBase58())??null;},async send(ix){sent.push(ix.data.toString('hex'));return 'test-signature';},async sendMany(ixs){assert.equal(ixs.length,2);assert.equal(ixs[0].data.toString('hex'),'01');sent.push(ixs[1].data.toString('hex'));return 'credit-signature';}};
 const adapter=new SolanaPlotAdapter(transport,{program,mint,paymentAuthority:payment,resolver,binding:async()=>({identity,optionHashes:{yes,no}})});
 assert.deepEqual(await adapter.findPaymentReceipt(key),{key,wallet:owner.toBase58(),amount:'600',signature:null,finalized:true});
 assert.equal(await adapter.submitCredit({key,wallet:owner.toBase58(),amount:'600'}),'credit-signature');assert.equal(sent.shift()?.slice(0,16),'8c2b79f6b050a7b0');
 assert.deepEqual(await adapter.read('b','p'),{phase:'resolved',winner:'yes'});
 assert.deepEqual(await adapter.marketView('b','p'),{chainStatus:'resolved',options:[{id:'yes',optionIndex:0,stake:'600'},{id:'no',optionIndex:1,stake:'400'}],treasuryBps:200,streamerBps:200,streamerFee:'20',treasuryFee:'20'});
 const result=await adapter.account(owner.toBase58(),[{broadcaster:'b',prediction:'p'}]);assert.equal(result.balance,'100');assert.equal(result.positions[0].payout,'960');assert.equal(result.positions[0].optionIndex,0);assert.equal(result.positions[0].sequence,'0');
 market.writeUInt16LE(10001,442);await assert.rejects(adapter.marketView('b','p'));market.writeUInt16LE(200,442);
 market[446]=3;assert.equal((await adapter.account(owner.toBase58(),[{broadcaster:'b',prediction:'p'}])).positions[0].payout,'600');
 await adapter.resolve('b','p','yes');assert.equal(sent[0],'9b1750ad2e4a17ef00');
 receipt[81]=0;await assert.rejects(adapter.findPaymentReceipt(key));
});

test('network selection rejects remote localnet before connecting',async()=>{
 await assert.rejects(verifiedTestConnection('https://example.com','localnet','fixture'));
 await assert.rejects(verifiedTestConnection('http://127.0.0.1:8899','localnet'));
});

test('PDAs and identity hashes match Anchor f6bb39d published vectors',()=>{
 const program=new PublicKey('8mL78rx2dZufBaBiMnFQG2hCzENKd7euRWurZtp8gEpc'),a=plotAddresses(program);
 const marketHash=twitchMarketHash('channel-123','prediction-456'),paymentHash=paymentReceiptKey('example-provider','test','payment-789');
 assert.equal(marketHash,'6927e138b0220443bd0f9503f759f9fe3250423d7009796d2dfc98ccf3dae4a4');
 assert.equal(twitchOutcomeHash('channel-123','prediction-456','outcome-1'),'6dd45e7b18c7b149a932946229fef86ba782c98c87e31ae27ac23fd046dfd198');
 assert.equal(paymentHash,'1280aa2200c55e307f1bfb790c81441cc8d6397bb73aad9fd39ecc944498758a');
 assert.equal(a.config.toBase58(),'4zuNoPr5GjhnCHKGfPvdz4yEzCaujskpEbtEZiXLHL3X');
 assert.equal(a.market(marketHash).toBase58(),'ENfRt2ry5Eo57v33mdM4H8597ZJ1JPa5chgU4hCSLZDa');
 assert.equal(a.payment(paymentHash).toBase58(),'AMiB8JdEeUYRZQEsJe4LAxrhCYfUsFLjjc9ifXx3uKpb');
});
