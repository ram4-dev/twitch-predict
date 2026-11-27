import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import { Action, Copy, Notice, Title, styles } from './ui';
import { usePlot } from '../lib/state';
import { walletProvider } from '../lib/wallet';
import { PlotSessionClient } from '../lib/plot-session-client';
import { PlotAccountClient, plotTransport, type PlotAccount } from '../lib/plot-account-client';
import { PlotHttpReadClient, type PlotReadMarket } from '../lib/plot-read-client';
import { PlotHttpIntentApi, PlotIntentController, type IntentState } from '../lib/plot-intent-client';
import { PlotWalletSigner } from '../lib/plot-transaction-signer';
import { accountFinalized, claimAvailable, predictionAvailable } from '../lib/plot-action-guards';
import { PlotPurchaseClient, type PlotPurchase } from '../lib/plot-purchase-client';

const secure = { getItem:SecureStore.getItemAsync, setItem:SecureStore.setItemAsync, deleteItem:SecureStore.deleteItemAsync };
type Runtime = { wallet:string; account:PlotAccountClient; markets:PlotHttpReadClient; intents:PlotIntentController; purchase:PlotPurchaseClient };
export function PlotReal() {
 const {base,kind}=usePlot();
 const wallet = useMemo(()=>walletProvider(kind),[kind]);
 const [runtime,setRuntime]=useState<Runtime|null>(null), [account,setAccount]=useState<PlotAccount|null>(null), [markets,setMarkets]=useState<PlotReadMarket[]>([]), [intent,setIntent]=useState<IntentState|null>(null), [purchase,setPurchase]=useState<PlotPurchase|null>(null), [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [selected,setSelected]=useState<Record<string,string>>({}), [amount,setAmount]=useState('600');
 useEffect(()=>{setRuntime(null);setAccount(null);setMarkets([]);setIntent(null);setPurchase(null);},[base,kind]);
 async function refresh(r:Runtime){const [a,m,i,p]=await Promise.all([r.account.read(),r.markets.markets(),r.intents.state(),r.purchase.state()]);setAccount(a);setMarkets(m);setIntent(i);setPurchase(p);}
 async function run(work:()=>Promise<void>){setBusy(true);setMessage('');try{await work();}catch(e){setMessage(e instanceof Error?e.message:'No se pudo completar la solicitud.');if(runtime)try{await refresh(runtime);}catch{/* Keep the original error and persisted state. */}}finally{setBusy(false);}}
 async function login(){if(!base)throw new Error('Configurá el servidor en Conexión.');const session=new PlotSessionClient(base,wallet,secure);const {wallet:address}=await session.login();const transport=plotTransport(base,()=>session.token(address));const scope=Buffer.from(`${base}|${address}`).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const r:Runtime={wallet:address,account:new PlotAccountClient(transport,address),markets:new PlotHttpReadClient(base),intents:new PlotIntentController(AsyncStorage,new PlotHttpIntentApi(transport),new PlotWalletSigner(wallet),scope),purchase:new PlotPurchaseClient(AsyncStorage,transport,scope,address)};setRuntime(r);await refresh(r);}
 const pending=!!intent&&!['confirmed','failed','expired_absent'].includes(intent.stage), pendingBuy=!!purchase&&purchase.stage!=='finalized';
 const confirmed=accountFinalized(account);
 async function preparePrediction(m:PlotReadMarket){if(!runtime||!account||!predictionAvailable(account,m))throw new Error('Mercado aún no confirmado.');const option=m.options.find(o=>o.id===selected[m.id]);if(!option||option.optionIndex===null)throw new Error('Elegí una opción confirmada.');const position=account.positions.find(p=>p.marketId===m.id);if(position&&position.optionId!==option.id)throw new Error('Ya elegiste otra opción.');if(!/^[1-9]\d*$/.test(amount)||BigInt(amount)>BigInt(account.balance!))throw new Error('Monto inválido o saldo insuficiente.');await runtime.intents.start(Crypto.randomUUID(),{wallet:runtime.wallet,operation:'place_prediction',parameters:{marketIdentity:m.marketIdentity,option:option.optionIndex,amount,sequence:position?.sequence??'0'}});await refresh(runtime);}
 async function prepareClaim(m:PlotReadMarket){if(!runtime||!account||!confirmed)throw new Error('Cuenta aún no confirmada.');const p=account.positions.find(x=>x.marketId===m.id);if(!p||!claimAvailable(account,m))throw new Error('No hay cobro confirmado.');await runtime.intents.start(Crypto.randomUUID(),{wallet:runtime.wallet,operation:'claim',parameters:{marketIdentity:m.marketIdentity}});await refresh(runtime);}
 return <>
  <Title>PLOT on-chain</Title><Notice>Modo de prueba. Las compras son simuladas; las operaciones on-chain requieren una firma y confirmación del servidor. PLOT no es saldo retirable ni Byte.</Notice>
  {!runtime?<Action title="Iniciar sesión con wallet" disabled={busy} onPress={()=>{void run(login);}}/>:<>
   <Copy>Wallet: {runtime.wallet.slice(0,6)}…{runtime.wallet.slice(-6)}</Copy>
   <Action title="Actualizar cuenta y mercados" secondary disabled={busy} onPress={()=>{void run(()=>refresh(runtime));}}/>
   <Copy style={styles.section}>Saldo PLOT: {confirmed?`${account!.balance} PLOT`:'confirmando'}</Copy>
   <View style={styles.panel}><Copy style={styles.section}>Compra de prueba</Copy><Copy>Paquete simulado: 600 PLOT. El crédito se muestra sólo tras confirmación.</Copy>
    {!pendingBuy?<Action title="Crear compra de prueba" disabled={busy} onPress={()=>{void run(async()=>{await runtime.purchase.start(Crypto.randomUUID(),'small');await refresh(runtime);});}}/>:<>
     <Copy>Compra: {purchase!.stage==='creating'?'preparando':purchase!.stage==='submitted'?'crédito confirmando':purchase!.stage==='paid'?'pago simulado confirmado':'pendiente'}</Copy>
     {purchase!.stage==='creating'?<Action title="Recuperar compra" disabled={busy} onPress={()=>{void run(async()=>{await runtime.purchase.resume();await refresh(runtime);});}}/>:<>
      {purchase!.stage==='pending'&&<Action title="Confirmar pago simulado" disabled={busy} onPress={()=>{void run(async()=>{await runtime.purchase.confirm();await refresh(runtime);});}}/>}
      <Action title="Revisar crédito" secondary disabled={busy} onPress={()=>{void run(async()=>{await runtime.purchase.reconcile();await refresh(runtime);});}}/>
     </>}
    </>}
   </View>
   {pending&&<View style={styles.panel}><Copy style={styles.section}>Operación pendiente</Copy><Copy>{['preparing','prepared'].includes(intent!.stage)?'Esperando preparación o firma.':'Envío pendiente; no se enviará de nuevo automáticamente.'}</Copy>
    {['preparing','prepared'].includes(intent!.stage)?<Action title={intent!.stage==='preparing'?'Recuperar preparación':'Firmar predicción o cobro'} disabled={busy} onPress={()=>{void run(async()=>{if(intent!.stage==='preparing')await runtime.intents.resumePreparation();else await runtime.intents.signAndSubmit();await refresh(runtime);});}}/>:<Action title="Revisar operación" disabled={busy} onPress={()=>{void run(async()=>{await runtime.intents.reconcile();await refresh(runtime);});}}/>}
   </View>}
   {intent&&!pending&&<Copy>Última operación: {intent.stage==='confirmed'?'confirmada':intent.stage==='expired_absent'?'vencida sin envío':'fallida'}</Copy>}
   <Title>Mercados</Title>{markets.length===0&&<Copy>No hay mercados disponibles.</Copy>}
   {markets.map(m=>{const position=account?.positions.find(p=>p.marketId===m.id), open=predictionAvailable(account,m);return <View key={m.id} style={styles.panel}>
    <Copy style={styles.section}>{m.title??'Mercado sin título confirmado'}</Copy><Copy>Solana: {m.chainStatus??'confirmando'} · Twitch: {m.twitchStatus}</Copy>{m.winnerId&&<Copy>Resultado Twitch: ganó {m.options.find(o=>o.id===m.winnerId)?.label??m.winnerId}; perdió {m.options.filter(o=>o.id!==m.winnerId).map(o=>o.label??o.id).join(', ')}</Copy>}
    {m.options.map(o=><Action key={o.id} title={`${o.label??'Opción sin nombre'}${selected[m.id]===o.id?' · elegida':''}`} secondary={selected[m.id]!==o.id} disabled={!open||busy||pending} onPress={()=>setSelected({...selected,[m.id]:o.id})}/>)}
    {open&&<><Copy>Monto en PLOT</Copy><TextInput accessibilityLabel={`Monto PLOT ${m.id}`} keyboardType="number-pad" value={amount} onChangeText={setAmount} style={styles.input}/><Copy>Estimación no disponible: faltan las reglas de comisión verificadas.</Copy><Action title="Preparar predicción" disabled={busy||pending||!selected[m.id]} onPress={()=>{void run(()=>preparePrediction(m));}}/></>}
    {position&&<><Copy>Tu opción: {m.options.find(o=>o.id===position.optionId)?.label??position.optionId} · Apuesta: {position.stake} PLOT</Copy><Copy>{!confirmed||m.chainStatus!==position.chainStatus||position.payout===null?'Cobro y neto: confirmando':`Cobro total: ${position.payout} PLOT · Neto: ${(BigInt(position.payout)-BigInt(position.stake)).toString()} PLOT`}</Copy><Copy>Comisión streamer: {m.streamerFee===null?'confirmando':`${m.streamerFee} PLOT`} · Tesorería: {m.treasuryFee===null?'confirmando':`${m.treasuryFee} PLOT`}</Copy><Action title={position.claimed?'Cobrado':'Preparar cobro'} disabled={busy||pending||!claimAvailable(account,m)} onPress={()=>{void run(()=>prepareClaim(m));}}/></>}
   </View>;})}
  </>}
  {!!message&&<Notice error>{message}</Notice>}
 </>;
}
