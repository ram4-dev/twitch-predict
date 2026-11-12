import {useEffect,useState} from 'react';
import {Buffer} from 'buffer';
import {Transaction} from '@solana/web3.js';
import {Button} from './components/button.js';
import {Input} from './components/input.js';
import {PhoneGlass as Glass} from './components/phone-glass.js';
import {createPointsClient,number} from './points-ui.js';
import {phantom} from '../byte-wallet.js';
import {POINT_PACKAGES,POINTS_PER_USDC,type PublicFundingOrder,type Currency} from '../funding-model.js';
import type {Funding} from '../funding.js';
import type {Points} from '../points.js';

const client=createPointsClient('',{get:async()=>localStorage.getItem('pointsToken'),set:async token=>localStorage.setItem('pointsToken',token)});
const units=(order:PublicFundingOrder)=>{
  const decimals=order.currency==='USDC'?6:9,value=BigInt(order.units),scale=10n**BigInt(decimals);
  return `${value/scale}.${(value%scale).toString().padStart(decimals,'0')}`;
};
const statusLabels={quoted:'Cotización pendiente',pending:'Confirmación pendiente',confirmed:'Confirmada',failed:'Falló en Solana',expired:'Expiró sin transferir'};
export function FundingPanel({onBalanceChanged}:{onBalanceChanged?:()=>void}={}){
  const [config,setConfig]=useState<ReturnType<Funding['config']>>(),[account,setAccount]=useState<ReturnType<Points['me']>>(),[orders,setOrders]=useState<PublicFundingOrder[]>([]);
  const [direction,setDirection]=useState<'deposit'|'withdraw'>('deposit'),[currency,setCurrency]=useState<Currency>('USDC'),[amount,setAmount]=useState(''),[packageId,setPackageId]=useState(''),[quote,setQuote]=useState<PublicFundingOrder>();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[clock,setClock]=useState(Date.now());
  const refresh=async()=>{
    const configuration=await client.request<ReturnType<Funding['config']>>('/api/funding/config');setConfig(configuration);
    if(!localStorage.getItem('pointsToken')){setAccount(undefined);setOrders([]);return;}
    const [me,list]=await Promise.all([client.me(),client.authRequest<PublicFundingOrder[]>('/api/funding/orders')]);setAccount(me);setOrders(list);
  };
  useEffect(()=>{
    let active=true,inFlight=false;
    const poll=async()=>{
      if(inFlight)return;inFlight=true;
      try{
        if(localStorage.getItem('pointsToken')){
          const list=await client.authRequest<PublicFundingOrder[]>('/api/funding/orders');
          // Recover the server's saved signature after reload or an uncertain network response.
          for(const order of list.filter(o=>o.status==='pending'))await client.authRequest('/api/funding/submit',{id:order.id});
        }
        if(active)await refresh();
      }catch(e){if(active)setError((e as Error).message);}finally{inFlight=false;}
    };
    void poll();const timer=setInterval(()=>void poll(),5000),tick=setInterval(()=>setClock(Date.now()),1000);
    return()=>{active=false;clearInterval(timer);clearInterval(tick);};
  },[]);
  useEffect(()=>{if(account)onBalanceChanged?.();},[account?.balance,onBalanceChanged]);
  const requestQuote=async()=>{
    setBusy(true);setError('');setMessage('');setQuote(undefined);
    try{setQuote(await client.authRequest<PublicFundingOrder>('/api/funding/quote',direction==='deposit'?{direction,currency,packageId}:{direction,currency,amount}));}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const confirm=async()=>{
    if(!quote||busy)return;setBusy(true);setError('');setMessage('');
    try{
      let signedTransaction:string|undefined;
      if(quote.direction==='deposit'){
        const provider=phantom();if(!provider?.signTransaction)throw new Error('Abrí esta página con Phantom instalada.');
        const connected=await provider.connect();if(connected.publicKey.toString()!==account?.wallet)throw new Error('La wallet cambió. Volvé a conectar tu cuenta.');
        const signed=await provider.signTransaction(Transaction.from(Buffer.from(quote.transaction,'base64')));
        signedTransaction=Buffer.from(signed.serialize()).toString('base64');
      }
      const result=await client.authRequest<PublicFundingOrder>('/api/funding/submit',{id:quote.id,signedTransaction});
      setQuote(undefined);setAmount('');
      setMessage(result.status==='confirmed'?result.direction==='deposit'?'Compra confirmada. Los puntos ya están en tu saldo.':'Retiro confirmado. Los fondos llegaron a tu wallet.':`Operación guardada. ${statusLabels[result.status]}.`);
      await refresh();
    }catch(e){setError((e as Error&{code?:number}).code===4001?'Cancelaste la operación en Phantom.':(e as Error).message);await refresh().catch(()=>undefined);}
    finally{setBusy(false);}
  };
  const expired=!!quote&&Date.parse(quote.expiresAt)<=clock;
  return <section className="phone-funding funding-page" aria-label="Tu saldo"><h2 className="funding-title">Tus puntos</h2><p>Comprá con USDC o SOL. Retirá a la wallet de tu cuenta.</p>
      <section className="funding-summary" aria-label="Saldo"><div><span>Saldo disponible</span><strong>{account?number(account.balance):'—'} <small>pts</small></strong><p>1 USDC = {number(config?.pointsPerUsdc??1000)} puntos</p></div><div className="funding-wallet">{account?.wallet?<><span>Wallet de tu cuenta</span><p title={account.wallet}>{account.wallet.slice(0,6)}…{account.wallet.slice(-6)}</p><span className="funding-muted">{config?.network==='mainnet-beta'?'SOL y USDC en Solana mainnet.':'SOL y USDC de devnet, sin valor real.'}</span></>:<a href="/onboarding?connect=phantom">Conectar Phantom →</a>}</div></section>
      {!config?<p role="status">Consultando disponibilidad…</p>:!config.enabled&&<p role="status">{config.reason}</p>}
      <div className="funding-layout"><Glass className="funding-panel"><h2>Comprar y retirar</h2><div className="funding-tabs" role="group" aria-label="Operación">{(['deposit','withdraw'] as const).map(value=><Button key={value} variant={direction===value?'default':'outline'} disabled={busy} aria-pressed={direction===value} type="button" onClick={()=>{setDirection(value);setQuote(undefined);setAmount('');setError('');setMessage('');}}>{value==='deposit'?'Comprar puntos':'Retirar puntos'}</Button>)}</div>
        <form className="funding-purchase" onSubmit={e=>{e.preventDefault();void requestQuote();}}>
          {direction==='deposit'?<>
            <fieldset className="funding-packages" disabled={busy}><legend>Elegí tus puntos</legend><div className="funding-package-grid">{POINT_PACKAGES.map(pack=><label key={pack.id} className="funding-package" data-selected={packageId===pack.id}><input type="radio" name="points-package" value={pack.id} checked={packageId===pack.id} onChange={()=>{setPackageId(pack.id);setQuote(undefined);setError('');setMessage('');}}/><span><strong>{number(pack.points)} <small>puntos</small></strong><span>{pack.points/POINTS_PER_USDC} USDC</span></span></label>)}</div></fieldset>
            {packageId&&<fieldset className="funding-payment" disabled={busy}><legend>Pagá con</legend>{(['USDC','SOL'] as const).map(value=><label key={value}><input type="radio" name="payment-currency" value={value} checked={currency===value} onChange={()=>{setCurrency(value);setQuote(undefined);setError('');}}/>{value}</label>)}</fieldset>}
          </>:<><label htmlFor="funding-currency">Moneda</label><select id="funding-currency" disabled={busy} value={currency} onChange={e=>{setCurrency(e.target.value as Currency);setQuote(undefined);}}><option>USDC</option><option>SOL</option></select><label htmlFor="funding-amount">Puntos a retirar</label><Input id="funding-amount" inputMode="numeric" autoComplete="off" required value={amount} disabled={busy} onChange={e=>{setAmount(e.target.value);setQuote(undefined);}} aria-describedby="funding-hint"/></>}
          <p id="funding-hint" className="funding-muted">{direction==='deposit'?'La compra se acredita cuando Solana confirma la transferencia.':'Los puntos disponibles se reservan al confirmar el retiro.'} {currency==='SOL'?'La conversión usa una cotización de SOL/USDC válida por 60 segundos.':''}</p>
          <Button type="submit" disabled={busy||!config?.enabled||!account?.wallet||(direction==='deposit'?!packageId:!amount)}>{busy?'Procesando…':'Ver cotización'}</Button>
        </form>
        {quote&&<section className="funding-quote" aria-label="Cotización"><h3>{quote.direction==='deposit'?'Vas a comprar':'Vas a retirar'}</h3><dl><dt>Puntos</dt><dd>{number(quote.points)}</dd><dt>{quote.direction==='deposit'?'Pagás':'Recibís'}</dt><dd>{units(quote)} {quote.currency}</dd>{quote.currency==='SOL'&&<><dt>1 SOL</dt><dd>{quote.solPrice} USDC</dd></>}<dt>Destino</dt><dd>{quote.direction==='deposit'?'Tesorería de plot':'Tu wallet conectada'}</dd></dl><p className="funding-muted">{quote.direction==='deposit'?'Phantom muestra el costo de red y la creación de cuenta USDC, si corresponde.':'La tesorería paga el costo de red del retiro.'}</p><p>{expired?'La cotización venció. Pedí una nueva.':`Vence en ${Math.max(0,Math.ceil((Date.parse(quote.expiresAt)-clock)/1000))} segundos.`}</p><Button type="button" disabled={busy||expired} onClick={()=>void confirm()}>{quote.direction==='deposit'?'Confirmar compra en Phantom':'Confirmar retiro'}</Button></section>}
        <p role="status" className={error?'funding-error':''}>{error||message}</p></Glass>
        <Glass className="funding-panel"><h2>Compras y retiros</h2>{!account?<p>Conectá tu wallet para ver los movimientos.</p>:!orders.some(o=>o.status!=='quoted')?<p>Todavía no tenés compras ni retiros.</p>:orders.filter(o=>o.status!=='quoted').slice(0,20).map(order=><article className="funding-row" key={order.id}><strong>{order.direction==='deposit'?'Compra':'Retiro'} · {number(order.points)} pts</strong><p>{units(order)} {order.currency} · {statusLabels[order.status]}</p><p className="funding-muted">{new Date(order.createdAt).toLocaleString('es-AR')}</p>{order.signature&&<a href={`https://explorer.solana.com/tx/${order.signature}${order.network==='devnet'?'?cluster=devnet':''}`} target="_blank" rel="noopener noreferrer">Ver en Solana ↗</a>}</article>)}</Glass></div>
    </section>;
}
