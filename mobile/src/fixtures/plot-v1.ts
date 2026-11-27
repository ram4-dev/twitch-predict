import type { PlotSnapshot } from '../lib/plot-onchain.js';
/** Versioned examples only; no RPC or transaction is implied. */
export const plotFixtureV1: PlotSnapshot = {
  balance: '600',
  markets: [
    { id: 'open', title: '¿Gana el próximo mapa?', status: 'open', options: [{ id: 'yes', label: 'Sí', stake: '0' }, { id: 'no', label: 'No', stake: '400' }], streamerFee: '0', treasuryFee: '0' },
    { id: 'resolved', title: 'Final del torneo', status: 'resolved', options: [{ id: 'yes', label: 'Sí', stake: '600' }, { id: 'no', label: 'No', stake: '400' }], winnerId: 'yes', streamerFee: '20', treasuryFee: '20' },
    { id: 'cancelled', title: 'Partida cancelada', status: 'cancelled', options: [{ id: 'yes', label: 'Sí', stake: '600' }, { id: 'no', label: 'No', stake: '400' }], streamerFee: '0', treasuryFee: '0' },
  ],
  positions: [{ marketId: 'resolved', optionId: 'yes', stake: '600', payout: '960', claimed: false }, { marketId: 'cancelled', optionId: 'yes', stake: '600', payout: '600', claimed: false }],
};
