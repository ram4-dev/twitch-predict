import {createHash} from 'node:crypto';

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
 return createHash('sha256').update(JSON.stringify([provider,environment,id])).digest('hex');
}
