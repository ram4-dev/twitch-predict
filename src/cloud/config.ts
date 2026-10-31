import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync('extension/manifest.json','utf8')); 
export function cloudConfig(env:NodeJS.ProcessEnv=process.env){
 const origin=new URL(env.AUTH_ORIGIN??'');
 if(origin.protocol!=='https:'||origin.origin!==env.AUTH_ORIGIN||origin.username||origin.password)throw new Error('AUTH_ORIGIN debe ser un origen HTTPS canónico');
 const channels=(env.PLOT_CHANNELS??'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(channels.some(c=>! /^[a-z0-9_]{1,40}$/.test(c)))throw new Error('PLOT_CHANNELS inválido');
 if(!env.DATABASE_URL)throw new Error('Falta DATABASE_URL');
 const extensionId=[...createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32)].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
 // Chrome Web Store assigns its own ID; keep the unpacked beta ID supported too.
 const extensionIds=[extensionId,'gedkjfnfpjploiedjaljkmdhoolajhbd'];
 return {origin:origin.origin,channels,extensionId,extensionIds,environment:{...env,PLOT_CLOUD:'1'},database:env.DATABASE_URL,namespace:env.PLOT_NAMESPACE??'plot-staging'};
}
