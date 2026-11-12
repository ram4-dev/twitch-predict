import {validateSignedFunding} from './funding-signed-transaction.js';
import {randomUUID} from 'node:crypto';
import {ComputeBudgetProgram,Connection,Keypair,PublicKey,SystemProgram,Transaction,TransactionInstruction} from '@solana/web3.js';
import {usdcTransfer} from './funding-transfer.js';
import {getBase58Decoder} from '@solana/kit';
import {DEVNET_GENESIS} from './byte-model.js';
import {fundingAmount,fundingPackageAmount,POINT_PACKAGES,publicOrder,POINTS_PER_USDC,MAINNET_GENESIS,USDC_MAINNET,USDC_DEVNET,type FundingNetwork,type Currency,type FundingOrder,type FundingEstimate} from './funding-model.js';
import type {Points} from './points.js';

export interface FundingChain {
  getGenesisHash():Promise<string>;
  getLatestBlockhash(commitment:'finalized'):Promise<{blockhash:string;lastValidBlockHeight:number}>;
  sendRawTransaction(raw:Buffer,options:{skipPreflight:boolean;maxRetries:number}):Promise<string>;
  getSignatureStatuses(signatures:string[],options:{searchTransactionHistory:boolean}):ReturnType<Connection['getSignatureStatuses']>;
  getBlockHeight(commitment:'finalized'):Promise<number>;
  getTransaction(signature:string,options:{commitment:'finalized';maxSupportedTransactionVersion:number}):ReturnType<Connection['getTransaction']>;
}
export type FundingOptions={chain?:FundingChain;treasury?:Keypair;price?:()=>Promise<string>;enabled?:boolean};
const memoProgram=new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export class Funding {
  private chain:FundingChain;
  private treasury?:Keypair;
  private treasuryAddress?:PublicKey;
  private price:()=>Promise<string>;
  readonly enabled:boolean;
  readonly network:FundingNetwork;
  private operations=new Map<string,Promise<ReturnType<typeof publicOrder>>>();
  constructor(private points:Points,environment:NodeJS.ProcessEnv=process.env,options:FundingOptions={}) {
    const network=environment.POINTS_NETWORK??'devnet';
    if(network!=='devnet'&&network!=='mainnet-beta')throw new Error('POINTS_NETWORK debe ser devnet o mainnet-beta');
    this.network=network;
    this.enabled=options.enabled??environment.POINTS_PAYMENTS_ENABLED==='true';
    this.chain=options.chain??new Connection(environment.POINTS_RPC_URL||(this.network==='devnet'?'https://api.devnet.solana.com':'https://api.mainnet-beta.solana.com'),{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})});
    this.treasury=options.treasury;
    // Provision through vault-env. Never return or log the server's signing key.
    if(this.enabled&&!this.treasury&&environment.POINTS_TREASURY_KEYPAIR){
      try{this.treasury=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(environment.POINTS_TREASURY_KEYPAIR)));}
      catch{throw new Error('POINTS_TREASURY_KEYPAIR no tiene un formato válido');}
    }
    this.treasuryAddress=environment.POINTS_TREASURY_ADDRESS?new PublicKey(environment.POINTS_TREASURY_ADDRESS):this.treasury?.publicKey;
    if(this.treasury&&this.treasuryAddress&&!this.treasury.publicKey.equals(this.treasuryAddress))throw new Error('La clave de tesorería no coincide con POINTS_TREASURY_ADDRESS');
    this.price=options.price??(async()=>{
      const response=await fetch('https://api.coinbase.com/v2/prices/SOL-USDC/spot',{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('No se pudo cotizar SOL. Intentá de nuevo.');
      const {data}=await response.json() as {data:{amount:string;base:string;currency:string}};
      const age=Date.now()-Date.parse(response.headers.get('date')??'');
      if(!Number.isFinite(age)||age>90000||age< -10000||data.base!=='SOL'||data.currency!=='USDC'||!/^\d+(\.\d{1,6})?$/.test(data.amount))throw new Error('La cotización de SOL no está actualizada');
      return data.amount;
    });
  }
  config(){return {enabled:this.enabled&&!!this.treasuryAddress,withdrawalsEnabled:this.enabled&&!!this.treasury,network:this.network,pointsPerUsdc:POINTS_PER_USDC,currencies:['USDC','SOL'],packages:POINT_PACKAGES,treasury:this.treasuryAddress?.toBase58()??null,reason:!this.enabled?'Compras y retiros todavía no están habilitados.':!this.treasuryAddress?'Falta configurar la tesorería.':null};}
  private async ready(direction:FundingOrder['direction']){
    if(!this.enabled||!this.treasuryAddress)throw new Error(this.config().reason??'Tesorería no disponible');
    if(direction==='withdraw'&&!this.treasury)throw new Error('Los retiros necesitan un firmante de tesorería.');
    if(await this.chain.getGenesisHash()!==(this.network==='devnet'?DEVNET_GENESIS:MAINNET_GENESIS))throw new Error(`El RPC de puntos debe corresponder a Solana ${this.network}`);
    return {publicKey:this.treasuryAddress,signer:this.treasury};
  }
  async quote(token:string,direction:FundingOrder['direction'],currency:Currency,input:string|{packageId:string}){
    const account=this.points.me(token);if(!account.wallet)throw new Error('Conectá Phantom primero');
    const treasury=await this.ready(direction),wallet=new PublicKey(account.wallet);
    if(wallet.equals(treasury.publicKey))throw new Error('La tesorería no puede operar como usuario');
    const solPrice=currency==='SOL'?await this.price():'1';
    if(typeof input!=='string'&&direction!=='deposit')throw new Error('Los paquetes son para comprar puntos');
    const amount=typeof input==='string'?fundingAmount(direction,currency,input,solPrice):fundingPackageAmount(currency,input.packageId,solPrice);
    if(direction==='withdraw'&&amount.points>account.balance)throw new Error('Saldo insuficiente');
    const id=randomUUID(),latest=await this.chain.getLatestBlockhash('finalized');
    const sender=direction==='deposit'?wallet:treasury.publicKey,recipient=direction==='deposit'?treasury.publicKey:wallet;
    const tx=new Transaction({feePayer:sender,...latest});
    // Explicit fee instructions prevent Phantom from rewriting the quoted message.
    // 200,000 CU at 1,000 micro-lamports/CU caps the priority fee at 200 lamports.
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({units:200_000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}));
    if(currency==='SOL')tx.add(SystemProgram.transfer({fromPubkey:sender,toPubkey:recipient,lamports:BigInt(amount.units)}));
    else tx.add(...usdcTransfer(sender,recipient,BigInt(amount.units),new PublicKey(this.network==='devnet'?USDC_DEVNET:USDC_MAINNET)));
    tx.add(new TransactionInstruction({programId:memoProgram,keys:[],data:Buffer.from(`plot:${id}`)}));
    const order=await this.points.fundingQuote(token,{id,network:this.network,wallet:account.wallet,direction,currency,...amount,solPrice,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),status:'quoted',transaction:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),lastValidBlockHeight:latest.lastValidBlockHeight});
    return publicOrder(order);
  }
  async estimate(direction:FundingOrder['direction'],currency:Currency,input:string|{packageId:string}):Promise<FundingEstimate>{
    if(typeof input!=='string'&&direction!=='deposit')throw new Error('Los paquetes son para comprar puntos');
    const solPrice=currency==='SOL'?await this.price():'1';
    const amount=typeof input==='string'?fundingAmount(direction,currency,input,solPrice):fundingPackageAmount(currency,input.packageId,solPrice);
    return {direction,currency,...amount,solPrice,expiresAt:new Date(Date.now()+60000).toISOString()};
  }
  list(token:string){return this.points.fundingOrders(token).map(publicOrder);}
  submit(token:string,id:string,signed?:string){
    // Authentication precedes deduplication; a second account cannot join another user's request.
    const order=this.points.fundingOrder(token,id);
    if(order.network!==this.network)throw new Error('La operación pertenece a otra red');
    const key=`${order.accountId}:${id}`;
    const running=this.operations.get(key);if(running)return running;
    const operation=this.execute(token,order,signed).finally(()=>this.operations.delete(key));this.operations.set(key,operation);return operation;
  }
  private async execute(token:string,initial:FundingOrder,signed?:string){
    const treasury=await this.ready(initial.direction);let order=initial;
    if(order.status==='quoted'){
      if(Date.parse(order.expiresAt)<=Date.now())throw new Error('La cotización venció. Pedí una nueva.');
      const expected=Transaction.from(Buffer.from(order.transaction,'base64'));
      let tx:Transaction;
      if(order.direction==='withdraw'){tx=expected;tx.sign(treasury.signer!);}
      else {
        if(!signed)throw new Error('Falta la firma de Phantom');
        tx=validateSignedFunding(expected,Transaction.from(Buffer.from(signed,'base64')));
      }
      const raw=tx.serialize();if(!tx.signature)throw new Error('Firma inválida');
      const signature=getBase58Decoder().decode(tx.signature);
      // One atomic commit reserves withdrawal points and records the exact signed bytes BEFORE broadcasting.
      order=await this.points.fundingSubmit(token,order.id,signature,raw.toString('base64'));
    }
    if(order.status!=='pending')return publicOrder(order);
    const result=await this.reconcile(token,order);
    if(result.status!=='pending')return result;
    try{await this.chain.sendRawTransaction(Buffer.from(order.signedTransaction!,'base64'),{skipPreflight:false,maxRetries:2});}
    catch{/* An uncertain send remains pending. Retrying always broadcasts the same signature. */}
    return this.reconcile(token,this.points.fundingOrder(token,order.id));
  }
  private async reconcile(token:string,order:FundingOrder){
    const {value:[status]}=await this.chain.getSignatureStatuses([order.signature!],{searchTransactionHistory:true});
    if(status?.confirmationStatus==='finalized'){
      if(status.err)return publicOrder(await this.points.fundingFinish(token,order.id,'failed'));
      const transaction=await this.chain.getTransaction(order.signature!,{commitment:'finalized',maxSupportedTransactionVersion:0});
      // Do not accept a signature alone: finalized bytes must match the exact quoted transfer.
      if(transaction?.meta&&Buffer.from(transaction.transaction.message.serialize()).equals(Transaction.from(Buffer.from(order.signedTransaction??order.transaction,'base64')).serializeMessage())){
        return publicOrder(await this.points.fundingFinish(token,order.id,transaction.meta.err?'failed':'confirmed'));
      }
    }
    if(!status&&await this.chain.getBlockHeight('finalized')>order.lastValidBlockHeight){
      // A second archival read after the finalized height prevents racing a newly visible confirmation.
      const {value:[again]}=await this.chain.getSignatureStatuses([order.signature!],{searchTransactionHistory:true});
      if(!again)return publicOrder(await this.points.fundingFinish(token,order.id,'expired'));
    }
    return publicOrder(order);
  }
}
