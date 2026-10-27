import type {Prediction} from './prediction.js';
export type TwitchPreview={prediction:Prediction;market?:{byteMarketId?:string;error?:string|null;rateLimited?:boolean}};
