import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Action, Copy, Notice, Title, styles } from './ui';
import { PlotHttpReadClient, type PlotReadMarket, type PlotReadPort } from '../lib/plot-read-client';

export function PlotLiveMarkets({ base, client }: { base: string; client?: PlotReadPort }) {
  const [markets, setMarkets] = useState<PlotReadMarket[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!base && !client) { setError('Configurá el servidor en Conexión.'); return; }
    setBusy(true); setError('');
    try { setMarkets(await (client ?? new PlotHttpReadClient(base)).markets()); }
    catch (e) { setMarkets(null); setError(e instanceof Error ? e.message : 'No se pudo consultar PLOT.'); }
    finally { setBusy(false); }
  }, [base, client]);
  useEffect(() => { void refresh(); }, [refresh]);
  return <>
    <Title>Mercados PLOT</Title>
    <Notice>Lectura de Twitch. El estado y los importes de Solana siguen confirmándose; no hay operaciones habilitadas.</Notice>
    <Action title={busy ? 'Consultando…' : 'Actualizar mercados'} disabled={busy} onPress={() => { void refresh(); }} />
    {!!error && <Notice error>{error}</Notice>}
    {markets?.length === 0 && <Copy>No hay mercados disponibles.</Copy>}
    {markets?.map(m => <View key={m.id} style={styles.panel}>
      <Copy style={styles.section}>{m.title ?? 'Mercado sin título confirmado'}</Copy>
      <Copy>Estado Solana: confirmando</Copy>
      <Copy>Twitch: {({open:'abierto',locked:'cerrado',resolved:'resuelto',canceled:'cancelado'} as const)[m.twitchStatus]}</Copy>
      {m.options.map(o => <Copy key={o.id}>{o.label ?? 'Opción sin nombre'} · apuesta total: confirmando</Copy>)}
      <Copy>Comisiones: confirmando · Estimación no disponible</Copy>
      <Action title="Predicción no disponible" disabled onPress={() => {}} />
    </View>)}
  </>;
}
