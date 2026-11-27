import {plotIdentityHash} from './identity.js';

/** Amounts are decimal PLOT strings; a provider never chooses the package or wallet. */
export interface PaymentOrder { id:string; environment:'test'; wallet:string; amount:string; status:'pending'|'paid'; }
export interface PaymentProvider {
 readonly name:string;
 createOrder(input:{id:string;wallet:string;amount:string}):Promise<PaymentOrder>;
 getOrder(id:string):Promise<PaymentOrder|null>;
}

/** In-memory test provider. Confirmation is deliberately unavailable through public HTTP. */
export class MockPaymentProvider implements PaymentProvider {
 readonly name='mock';
 private orders=new Map<string,PaymentOrder>();
 async createOrder(input:{id:string;wallet:string;amount:string}):Promise<PaymentOrder>{
  if(!input.id||!input.wallet||!/^([1-9][0-9]*)$/.test(input.amount))throw new Error('Invalid payment order');
  const previous=this.orders.get(input.id);
  if(previous){if(previous.wallet!==input.wallet||previous.amount!==input.amount)throw new Error('Order conflict');return {...previous};}
  const order:PaymentOrder={...input,environment:'test',status:'pending'};this.orders.set(input.id,order);return {...order};
 }
 async getOrder(id:string){const order=this.orders.get(id);return order?{...order}:null;}
 confirm(id:string){const order=this.orders.get(id);if(!order)throw new Error('Unknown order');order.status='paid';}
}

/** Canonical provider identity; separate environments cannot collide. */
export function paymentReceiptKey(provider:string,environment:string,id:string):string {
 return plotIdentityHash('plot:payment:v1',[provider,environment,id]);
}

/** Durable sandbox provider. Confirmation must be exposed only in explicitly enabled test flows. */
export class PostgresMockPaymentProvider implements PaymentProvider {
 readonly name='mock';
 constructor(private pool:import('pg').Pool,private namespace:string){}
 async createOrder(input:{id:string;wallet:string;amount:string}):Promise<PaymentOrder>{
  const {rows}=await this.pool.query(`INSERT INTO plot_private.plot_mock_payments(namespace,id,wallet,amount,status)
   VALUES($1,$2,$3,$4,'pending') ON CONFLICT(namespace,id) DO UPDATE SET id=excluded.id
   WHERE plot_mock_payments.wallet=excluded.wallet AND plot_mock_payments.amount=excluded.amount RETURNING id,wallet,amount,status`,[this.namespace,input.id,input.wallet,input.amount]);
  if(!rows.length)throw new Error('Order conflict');return {...rows[0],amount:String(rows[0].amount),environment:'test'};
 }
 async getOrder(id:string):Promise<PaymentOrder|null>{
  const {rows}=await this.pool.query('SELECT id,wallet,amount,status FROM plot_private.plot_mock_payments WHERE namespace=$1 AND id=$2',[this.namespace,id]);
  return rows.length?{...rows[0],amount:String(rows[0].amount),environment:'test'}:null;
 }
 async confirm(id:string,wallet:string){
  const result=await this.pool.query("UPDATE plot_private.plot_mock_payments SET status='paid' WHERE namespace=$1 AND id=$2 AND wallet=$3 RETURNING id",[this.namespace,id,wallet]);
  if(!result.rowCount)throw new Error('Unknown order');
 }
}
