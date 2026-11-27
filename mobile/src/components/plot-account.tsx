import React from 'react';
import { View } from 'react-native';
import { Action, Copy, Notice, Title, styles } from './ui';
import type { PlotAccount } from '../lib/plot-account-client';
import type { IntentState } from '../lib/plot-intent-client';

/** Authenticated screen fragment; the caller supplies a verified session and operation handlers. */
export function PlotAccountView({ account, intent, busy, onReconcile, onClaim }: { account: PlotAccount; intent: IntentState | null; busy: boolean; onReconcile: () => void; onClaim: (marketId: string) => void }) {
  const pending = !!intent && !['confirmed','failed','expired_absent'].includes(intent.stage);
  const confirmed = account.readStatus === 'finalized';
  return <>
    <Title>Tu cuenta PLOT</Title>
    <Copy>Saldo PLOT: {confirmed && account.balance !== null ? `${account.balance} PLOT` : 'confirmando'}</Copy>
    {!confirmed && <Notice>La lectura de Solana está confirmándose. No se pueden iniciar operaciones.</Notice>}
    {pending && <View style={styles.panel}>
      <Copy style={styles.section}>Operación pendiente</Copy>
      <Copy>{intent.stage === 'preparing' || intent.stage === 'prepared' ? 'Preparación pendiente; conservamos la misma clave.' : 'Envío pendiente de confirmación. No vuelvas a enviarlo.'}</Copy>
      <Action title="Revisar operación" disabled={busy} onPress={onReconcile} />
    </View>}
    {account.positions.map(position => <View key={`${position.marketId}:${position.optionId}`} style={styles.panel}>
      <Copy style={styles.section}>Mercado {position.marketId}</Copy>
      <Copy>Tu opción: {position.optionId} · Apuesta: {position.stake} PLOT</Copy>
      <Copy>Estado Solana: {position.chainStatus}</Copy>
      {confirmed && position.payout !== null ? <Copy>Cobro total: {position.payout} PLOT · Neto: {(BigInt(position.payout) - BigInt(position.stake)).toString()} PLOT</Copy> : <Copy>Cobro y resultado neto: confirmando</Copy>}
      <Action title={position.claimed ? 'Cobrado' : 'Cobrar PLOT'} disabled={busy || pending || !confirmed || position.claimed || position.payout === null || position.payout === '0' || !['resolved','canceled'].includes(position.chainStatus)} onPress={() => onClaim(position.marketId)} />
    </View>)}
  </>;
}
