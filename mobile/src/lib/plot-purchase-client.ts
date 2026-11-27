import type { PlotAuthenticatedTransport } from './plot-account-client';
import type { PlotStorage } from './plot-fixture-client';
export type PlotPurchase = { key:string; package:'small'|'medium'; stage:'creating'|'pending'|'paid'|'submitted'|'finalized' };
/** Test-only payment orders; key is persisted before the network and reused after reopening. */
export class PlotPurchaseClient {
  private queue:Promise<unknown>=Promise.resolve();
  private readonly key:string;
  constructor(private readonly store:PlotStorage,private readonly transport:PlotAuthenticatedTransport,scope:string,private readonly wallet:string){this.key=`plot.purchase.v1.${scope}`;}
  private run<T>(fn:()=>Promise<T>):Promise<T>{const p=this.queue.then(fn);this.queue=p.catch(()=>{});return p;}
  private async load():Promise<PlotPurchase|null>{const raw=await this.store.getItem(this.key);return raw?JSON.parse(raw):null;}
  private save(order:PlotPurchase){return this.store.setItem(this.key,JSON.stringify(order));}
  state(){return this.run(()=>this.load());}
  start(id:string,pack:'small'|'medium'){return this.run(async()=>{const prev=await this.load();if(prev&&prev.stage!=='finalized')throw new Error('Hay una compra pendiente.');if(!id||id.length>128)throw new Error('Clave de compra inválida.');const order:PlotPurchase={key:id,package:pack,stage:'creating'};await this.save(order);return this.create(order);});}
  private async create(order:PlotPurchase){await this.transport.request('/api/plot/v1/orders',{method:'POST',body:JSON.stringify({idempotencyKey:order.key,package:order.package})});order.stage='pending';await this.save(order);return order;}
  resume(){return this.run(async()=>{const order=await this.load();if(!order)throw new Error('No hay compra pendiente.');return order.stage==='creating'?this.create(order):order;});}
  confirm(){return this.run(async()=>{const order=await this.load();if(!order||!['pending','paid'].includes(order.stage))throw new Error('No hay compra para confirmar.');await this.transport.request(`/api/plot/v1/orders/${encodeURIComponent(order.key)}/confirm`,{method:'POST'});order.stage='paid';await this.save(order);return order;});}
  reconcile(){return this.run(async()=>{const order=await this.load();if(!order||order.stage==='creating'||order.stage==='finalized')throw new Error('No hay compra para conciliar.');const raw=await this.transport.request(`/api/plot/v1/orders/${encodeURIComponent(order.key)}/reconcile`,{method:'POST'});if(!raw||typeof raw!=='object'||!('finalized' in raw)||typeof raw.finalized!=='boolean'||!('wallet' in raw)||raw.wallet!==this.wallet||!('amount' in raw)||raw.amount!==(order.package==='small'?'600':'400'))throw new Error('Respuesta de compra inválida.');order.stage=raw.finalized?'finalized':'submitted';await this.save(order);return order;});}
}
