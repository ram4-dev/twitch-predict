import { predictionSchema, closesAt, type Prediction } from './prediction.js';
export function parseTwitchPrediction(input: unknown, channel: string): Prediction {
  if (typeof input !== 'object' || !input) throw new Error('Predicción inválida de Twitch');
  const data = input as Record<string, unknown>;
  const winner = data.winningOutcome as { id?: string } | null;
  return predictionSchema.parse({ ...data, channel: channel.toLowerCase(), winningOutcomeId: winner?.id ?? data.winningOutcomeId ?? null });
}
export function isOpen(prediction: Prediction, now = Date.now()) { return prediction.status === 'ACTIVE' && closesAt(prediction) > now; }
export function countdown(prediction: Prediction, now = Date.now()) {
  if (prediction.status === 'RESOLVED') return 'Resolved';
  if (prediction.status === 'CANCELED') return 'Canceled';
  if (!isOpen(prediction, now)) return 'Staking closed';
  const seconds = Math.max(0, Math.ceil((closesAt(prediction) - now) / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export function pointShare(outcome: Prediction['outcomes'][number], outcomes: Prediction['outcomes']): number | null {
  if (outcomes.some(o => o.totalPoints == null)) return null;
  const total = outcomes.reduce((sum, o) => sum + o.totalPoints!, 0);
  return total ? Math.round(outcome.totalPoints! / total * 1000) / 10 : 0;
}
export function formatNumber(value: number | null | undefined) { return value == null ? '—' : new Intl.NumberFormat('en-US').format(value); }
export function totalMetric(outcomes: Prediction['outcomes'], metric: 'totalPoints' | 'totalUsers') {
  return outcomes.some(o => o[metric] == null) ? null : outcomes.reduce((sum, o) => sum + o[metric]!, 0);
}
export function statusLabel(status: Prediction['status']) { return { ACTIVE: 'Open', LOCKED: 'Closed', RESOLVED: 'Resolved', CANCELED: 'Canceled' }[status]; }
