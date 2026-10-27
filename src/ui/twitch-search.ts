import type {TwitchChannelResult} from '../twitch-search.js';
export async function searchTwitch(query:string,signal:AbortSignal,base=''):Promise<TwitchChannelResult[]>{
 const response=await fetch(`${base}/api/twitch/search?q=${encodeURIComponent(query)}`,{signal});
 if(!response.ok)throw new Error('No pudimos buscar en Twitch. Probá de nuevo.');
 const data=await response.json() as {channels:TwitchChannelResult[]};return data.channels;
}
