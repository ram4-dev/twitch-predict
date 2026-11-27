import React, { useCallback, useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Action, Copy, Notice, Screen, Title, styles } from '../../components/ui';
import { PlotFixtureClient } from '../../lib/plot-fixture-client';
import { estimatePayout, type PlotIntent, type PlotSnapshot, type PlotPort } from '../../lib/plot-onchain';

const fixture = new PlotFixtureClient(AsyncStorage);
export default function PlotDemo() { return <PlotFixtureScreen client={fixture} />; }
export function PlotFixtureScreen({ client }: { client: PlotPort }) {
  const [amount, setAmount] = useState('600');
  const [option, setOption] = useState('yes');
  const [enabled, setEnabled] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [snapshot, setSnapshot] = useState<PlotSnapshot | null>(null);
  const [pending, setPending] = useState<PlotIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    const [session, data] = await Promise.all([client.session(), client.read()]);
    setLoggedIn(session.loggedIn); setPending(session.pending); setSnapshot(data);
  }, [client]);
  useEffect(() => { if (enabled) refresh().catch(() => setMessage('No se pudo leer el ejemplo guardado.')); }, [enabled, refresh]);
  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('');
    try { await work(); await refresh(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar la operación de ejemplo.'); }
    finally { setBusy(false); }
  }
  const market = snapshot?.markets.find(m => m.id === 'open');
  const currentPosition = snapshot?.positions.find(p => p.marketId === market?.id);
  let estimate: string | null = null;
  try { if (market) estimate = estimatePayout(market, option, amount, currentPosition?.optionId === option ? currentPosition.stake : '0'); } catch { /* Invalid input is shown below. */ }
  const disabled = busy || !!pending;
  return <Screen>
    <Title>PLOT de prueba</Title>
    <Notice>Simulación local con datos de ejemplo. Ninguna acción conecta una wallet ni envía transacciones. PLOT está separado de Byte y del saldo retirable.</Notice>
    {!enabled ? <Action title="Abrir ejemplo" onPress={() => setEnabled(true)} /> : <>
      {!!message && <Notice>{message}</Notice>}
      {!snapshot ? <Copy>Cargando ejemplo…</Copy> : <>
        {!loggedIn ? <Action title="Iniciar sesión de ejemplo" disabled={busy} onPress={() => action(() => client.login(), 'Sesión de ejemplo iniciada.')} /> : <>
          <View style={styles.panel}>
            <Copy style={styles.section}>Saldo de ejemplo: {snapshot.balance} PLOT</Copy>
            <Action title="Comprar 600 PLOT de prueba" disabled={disabled} onPress={() => action(() => client.purchase('600'), 'Compra simulada pendiente.')} />
          </View>
          {pending && <View style={styles.panel}>
            <Copy style={styles.section}>Operación simulada pendiente</Copy>
            <Copy>Tipo: {pending.operation === 'purchase' ? 'compra' : pending.operation === 'predict' ? 'predicción' : 'cobro'}. Queda guardada si cerrás la app.</Copy>
            <Action title="Completar simulación pendiente" disabled={busy} onPress={() => action(() => client.reconcile(pending.id), 'Simulación completada localmente.')} />
          </View>}
          {market && <View style={styles.panel}>
            <Copy style={styles.section}>{market.title}</Copy>
            <Copy>Abierta · Elegí un resultado</Copy>
            {market.options.map(item => <Action key={item.id} title={`${item.label}${option === item.id ? ' · elegida' : ''}`} secondary={option !== item.id} onPress={() => setOption(item.id)} />)}
            <Copy>Monto en PLOT</Copy>
            <TextInput accessibilityLabel="Monto en PLOT" keyboardType="number-pad" value={amount} onChangeText={setAmount} style={styles.input} />
            <Copy>{estimate === null ? 'Ingresá una cantidad entera válida.' : `Cobro total estimado: ${estimate} PLOT`}</Copy>
            {estimate !== null && <Copy>Ganancia neta estimada: {(BigInt(estimate) - BigInt(amount) - BigInt(currentPosition?.optionId === option ? currentPosition.stake : '0')).toString()} PLOT</Copy>}
            <Copy>Incluye tu apuesta y comisiones del 2% para el streamer y 2% para tesorería. La estimación puede cambiar.</Copy>
            <Action title="Simular predicción" disabled={disabled || estimate === null || amount === '0'} onPress={() => action(() => client.predict(market.id, option, amount), 'Predicción simulada pendiente.')} />
          </View>}
          <Title>Historial de ejemplo</Title>
          {snapshot.positions.map(position => {
            const item = snapshot.markets.find(m => m.id === position.marketId)!;
            const chosen = item.options.find(o => o.id === position.optionId)!;
            const winner = item.options.find(o => o.id === item.winnerId);
            const terminal = item.status === 'cancelled' || item.status === 'resolved';
            return <View key={item.id} style={styles.panel}>
              <Copy style={styles.section}>{item.title}</Copy>
              <Copy>{item.status === 'cancelled' ? 'Cancelada · devolución completa' : item.status === 'resolved' ? `Ganó ${winner?.label} · perdió ${item.options.filter(o => o.id !== item.winnerId).map(o => o.label).join(', ')}` : 'Abierta · resultado pendiente'}</Copy>
              <Copy>Tu opción: {chosen.label} · Apuesta: {position.stake} PLOT</Copy>
              {terminal && <><Copy>Cobro total: {position.payout} PLOT · Neto: {(BigInt(position.payout) - BigInt(position.stake)).toString()} PLOT</Copy>
                <Copy>Comisión streamer: {item.streamerFee} PLOT · Tesorería: {item.treasuryFee} PLOT</Copy>
                <Action title={position.claimed ? 'Cobrado en simulación' : 'Simular cobro'} disabled={disabled || position.claimed || position.payout === '0'} onPress={() => action(() => client.claim(item.id), 'Cobro simulado pendiente.')} /></>}
            </View>;
          })}
        </>}
      </>}
    </>}
  </Screen>;
}
