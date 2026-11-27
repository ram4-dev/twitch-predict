import type {Pool} from 'pg';
import type {PaymentProvider} from './payment.js';
import {paymentReceiptKey} from './payment.js';
import {verifyReceipt,type PlotChain} from './chain.js';

/** Persistence and chain are separate: the receipt is authoritative after an ambiguous submission. */
export class PaymentReconciler {
 constructor(private pool:Pool,private namespace:string,private provider:PaymentProvider,private chain:PlotChain){}
 async create(input:{id:string;wallet:string;amount:string}) {
  if(!input.id||!input.wallet||!/^([1-9][0-9]*)$/.test(input.amount)||BigInt(input.amount)>18446744073709551615n)throw new Error('Invalid order');
  const key=paymentReceiptKey(this.provider.name,'test',input.id);
  const {rows}=await this.pool.query(`INSERT INTO plot_private.plot_payment_orders(namespace,id,provider,environment,wallet,amount,receipt_key,status)
   VALUES($1,$2,$3,'test',$4,$5,$6,'pending') ON CONFLICT(namespace,id) DO UPDATE SET id=excluded.id
   WHERE plot_payment_orders.provider=excluded.provider AND plot_payment_orders.wallet=excluded.wallet AND plot_payment_orders.amount=excluded.amount RETURNING id`,[this.namespace,input.id,this.provider.name,input.wallet,input.amount,key]);
  if(!rows.length)throw new Error('Order conflict');
  return this.provider.createOrder(input);
 }
 async reconcile(id:string) {
  const {rows}=await this.pool.query('SELECT * FROM plot_private.plot_payment_orders WHERE namespace=$1 AND id=$2',[this.namespace,id]);
  const row=rows[0];if(!row||row.provider!==this.provider.name)throw new Error('Unknown order');
  const expected={key:row.receipt_key as string,wallet:row.wallet as string,amount:String(row.amount)};
  const order=await this.provider.getOrder(id);
  if(!order||order.status!=='paid'||order.environment!=='test'||order.wallet!==expected.wallet||order.amount!==expected.amount)throw new Error('Payment not verified');
  await this.pool.query("UPDATE plot_private.plot_payment_orders SET status=CASE WHEN status='pending' THEN 'verified' ELSE status END,updated_at=now() WHERE namespace=$1 AND id=$2",[this.namespace,id]);
  const receipt=await this.chain.findPaymentReceipt(expected.key);
  if(receipt){verifyReceipt(receipt,expected);await this.pool.query("UPDATE plot_private.plot_payment_orders SET status=CASE WHEN status='finalized' THEN status ELSE $3 END,signature=$4,updated_at=now() WHERE namespace=$1 AND id=$2",[this.namespace,id,receipt.finalized?'finalized':'submitted',receipt.signature]);return receipt;}
  // Persist intent before submission; retries use the same on-chain receipt key.
  const claim=await this.pool.query("UPDATE plot_private.plot_payment_orders SET status='submitted',updated_at=now() WHERE namespace=$1 AND id=$2 AND status='verified' RETURNING id",[this.namespace,id]);
  if(!claim.rowCount)return {...expected,signature:row.signature??'',finalized:false};
  const signature=await this.chain.submitCredit(expected);
  await this.pool.query('UPDATE plot_private.plot_payment_orders SET signature=$3,updated_at=now() WHERE namespace=$1 AND id=$2 AND status<>\'finalized\'',[this.namespace,id,signature]);
  return { ...expected,signature,finalized:false };
 }
}
