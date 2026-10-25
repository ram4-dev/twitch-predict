import { z } from 'zod';
export const predictionSchema = z.object({
  id: z.string().min(1).max(128), channel: z.string().regex(/^[a-zA-Z0-9_]{1,40}$/),
  title: z.string().min(1).max(200), status: z.enum(['ACTIVE', 'LOCKED', 'RESOLVED', 'CANCELED']),
  createdAt: z.string().datetime(), predictionWindowSeconds: z.number().int().min(1).max(1800),
  outcomes: z.array(z.object({ id: z.string().min(1).max(128), title: z.string().min(1).max(100) })).min(2).max(8),
  winningOutcomeId: z.string().nullable().optional(),
}).refine(p => new Set(p.outcomes.map(o => o.id)).size === p.outcomes.length, 'Duplicate outcome IDs');
export type Prediction = z.infer<typeof predictionSchema>;
export function closesAt(p: Prediction) { return Date.parse(p.createdAt) + p.predictionWindowSeconds * 1000; }
export const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'; // Public Twitch web client identifier, not a secret.
export const TWITCH_QUERY = `query MirrorPredictions($channel: String!) { channel(name: $channel) { activePredictionEvents { id title status createdAt predictionWindowSeconds winningOutcome { id } outcomes { id title } } } }`;
