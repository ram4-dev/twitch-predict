import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Action, Copy, Notice, Screen, Title, styles } from '../../components/ui';
import { plotFixtureV1 } from '../../fixtures/plot-v1';
import { estimatePayout } from '../../lib/plot-onchain';

export default function PlotDemo() {
  const [amount, setAmount] = useState('600');
  const [option, setOption] = useState('yes');
  const [enabled, setEnabled] = useState(false);
  const market = plotFixtureV1.markets[0];
  let estimate: string | null = null;
  try { estimate = estimatePayout(market, option, amount); } catch { /* Invalid input is shown below. */ }
  return <Screen>
    <Title>PLOT de prueba</Title>
    <Notice>Ejemplo local. No conecta una wallet, no compra puntos y no envía transacciones. PLOT está separado de Byte y del saldo retirable.</Notice>
    {!enabled ? <Action title="Abrir ejemplo" onPress={() => setEnabled(true)} /> : <>
      <View style={styles.panel}>
        <Copy style={styles.section}>Saldo de ejemplo: {plotFixtureV1.balance} PLOT</Copy>
        <Copy>Inicio de sesión y compra de prueba: pendientes de integración.</Copy>
      </View>
      <View style={styles.panel}>
        <Copy style={styles.section}>{market.title}</Copy>
        <Copy>Abierta · Elegí un resultado</Copy>
        {market.options.map(item => <Action key={item.id} title={`${item.label}${option === item.id ? ' · elegida' : ''}`} secondary={option !== item.id} onPress={() => setOption(item.id)} />)}
        <Copy>Monto en PLOT</Copy>
        <TextInput accessibilityLabel="Monto en PLOT" keyboardType="number-pad" value={amount} onChangeText={setAmount} style={styles.input} />
        <Copy>{estimate === null ? 'Ingresá una cantidad entera válida.' : `Cobro total estimado: ${estimate} PLOT`}</Copy>
        {estimate !== null && <Copy>Ganancia neta estimada: {(BigInt(estimate) - BigInt(amount)).toString()} PLOT</Copy>}
        <Copy>La estimación incluye tu apuesta y las comisiones del 2% para el streamer y 2% para tesorería. Puede cambiar.</Copy>
        <Action title="Firma pendiente de integración" disabled onPress={() => {}} />
      </View>
      <Title>Historial de ejemplo</Title>
      {plotFixtureV1.positions.map(position => {
        const item = plotFixtureV1.markets.find(m => m.id === position.marketId)!;
        const chosen = item.options.find(o => o.id === position.optionId)!;
        const winner = item.options.find(o => o.id === item.winnerId);
        return <View key={item.id} style={styles.panel}>
          <Copy style={styles.section}>{item.title}</Copy>
          <Copy>{item.status === 'cancelled' ? 'Cancelada · devolución completa' : `Ganó ${winner?.label} · perdió ${item.options.filter(o => o.id !== item.winnerId).map(o => o.label).join(', ')}`}</Copy>
          <Copy>Tu opción: {chosen.label} · Apuesta: {position.stake} PLOT</Copy>
          <Copy>Cobro total: {position.payout} PLOT · Neto: {(BigInt(position.payout) - BigInt(position.stake)).toString()} PLOT</Copy>
          <Copy>Comisión streamer: {item.streamerFee} PLOT · Tesorería: {item.treasuryFee} PLOT</Copy>
          <Action title="Cobro pendiente de integración" disabled onPress={() => {}} />
        </View>;
      })}
    </>}
  </Screen>;
}
