import assert from 'node:assert/strict';
import {Keypair,Transaction,type SignatureStatus} from '@solana/web3.js';
import {getBase58Decoder} from '@solana/kit';
import {DEVNET_GENESIS} from '../../src/byte-model.js';
import type {FundingChain} from '../../src/funding.js';
export class FundingChainFixture implements FundingChain {
  statuses=new Map<string,SignatureStatus>();transactions=new Map<string,Transaction>();broadcasts=0;failSend=false;height=10;genesis=DEVNET_GENESIS;
  tokenBalance=1_000_000_000n;missingUsdc=false;
  async getTokenAccountBalance(){if(this.missingUsdc)throw new Error('could not find account');return {context:{slot:1},value:{amount:String(this.tokenBalance),decimals:6,uiAmount:Number(this.tokenBalance)/1e6,uiAmountString:String(Number(this.tokenBalance)/1e6)}};}
  async getGenesisHash(){return this.genesis;}
  async getLatestBlockhash(){return {blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100};}
  async getBlockHeight(){return this.height;}
  async sendRawTransaction(raw:Buffer){
    this.broadcasts++;if(this.failSend)throw new Error('RPC timeout');
    const tx=Transaction.from(raw);assert(tx.verifySignatures());const signature=getBase58Decoder().decode(tx.signature!);
    this.transactions.set(signature,tx);this.statuses.set(signature,{slot:1,confirmations:1,err:null,confirmationStatus:'confirmed'});return signature;
  }
  async getSignatureStatuses(signatures:string[]){return {context:{slot:1},value:signatures.map(s=>this.statuses.get(s)??null)};}
  async getTransaction(signature:string){
    const tx=this.transactions.get(signature);if(!tx)return null;
    return {slot:1,blockTime:Math.floor(Date.now()/1000),meta:{err:null,fee:5000,preBalances:[],postBalances:[]},transaction:{message:tx.compileMessage(),signatures:[signature]}};
  }
  finalize(signature:string,failed=false){this.statuses.set(signature,{slot:1,confirmations:null,err:failed?{InstructionError:[0,'InsufficientFunds']}:null,confirmationStatus:'finalized'});}
}
