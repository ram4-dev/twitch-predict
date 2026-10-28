export {searchTwitch} from './twitch-search.js';
import {useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {createRoot} from 'react-dom/client';
import ExpandableSearchBar from '@/components/ui/expandable-search-bar';
import {twitchChannel} from '../mobile-model.js';
import type {TwitchChannelResult} from '../twitch-search.js';

function ChannelSearch({current,activeChannel,onSelect,lookup}:{current:string;activeChannel:string;onSelect:(channel:string)=>Promise<void>;lookup:(query:string,signal:AbortSignal)=>Promise<TwitchChannelResult[]>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const search=async(query:string)=>{
  if(busy)return;
  let channel:string;try{channel=twitchChannel(query);}catch(e){setError((e as Error).message);return;}
  setError('');setBusy(true);try{await onSelect(channel);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <><div className="extension-channel-control"><span className="channel-identity"><span className="channel-current" data-channel={current}>{current?`@${current}`:'Elegí un streamer'}</span>{/^[a-z0-9_]{1,40}$/.test(current)&&current.toLowerCase()!==activeChannel&&<a className="channel-stream-link" href={`https://www.twitch.tv/${current}`} target="_blank" rel="noopener noreferrer" aria-label={`Abrir stream de ${current} en Twitch`} title="Abrir stream en Twitch"><ArrowUpRight size={15}/></a>}</span><ExpandableSearchBar expandDirection="left" width={400} placeholder="Nombre o enlace de Twitch…" inputLabel="Canal de Twitch" openLabel="Buscar canal" submitLabel="Buscar streamer" loading={busy} lookup={lookup} onSearch={query=>void search(query)} onClear={()=>setError('')}/></div>{error&&<p className="points-error" role="status">{error}</p>}</>;
}
export function mountChannelSearch(node:HTMLElement,onSelect:(channel:string)=>Promise<void>,lookup:(query:string,signal:AbortSignal)=>Promise<TwitchChannelResult[]>){
 const root=createRoot(node);
 const update=(current:string,activeChannel='')=>root.render(<ChannelSearch current={current} activeChannel={activeChannel} onSelect={onSelect} lookup={lookup}/>);
 update('');return update;
}
