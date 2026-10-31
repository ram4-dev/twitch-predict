export {searchTwitch} from './twitch-search.js';
import {useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {createRoot} from 'react-dom/client';
import ExpandableSearchBar from '@/components/ui/expandable-search-bar';
import {twitchChannel} from '../mobile-model.js';
import type {TwitchChannelResult} from '../twitch-search.js';

function englishChannelError(error:unknown){
 const message=error instanceof Error?error.message:String(error);
 return ({
  'Pegá el enlace de un canal de Twitch.':'Paste a Twitch channel link.',
  'Ingresá el nombre del streamer o su enlace de Twitch.':'Enter the streamer name or their Twitch link.',
  'No pudimos buscar en Twitch. Probá de nuevo.':'Twitch search failed. Try again.',
 } as Record<string,string>)[message]??message;
}
function ChannelSearch({current,activeChannel,onSelect,lookup}:{current:string;activeChannel:string;onSelect:(channel:string)=>Promise<void>;lookup:(query:string,signal:AbortSignal)=>Promise<TwitchChannelResult[]>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const search=async(query:string)=>{
  if(busy)return;
  let channel:string;try{channel=twitchChannel(query);}catch(e){setError(englishChannelError(e));return;}
  setError('');setBusy(true);try{await onSelect(channel);}catch(e){setError(englishChannelError(e));}finally{setBusy(false);}
 };
 return <><div className="extension-channel-control"><span className="channel-identity"><span className="channel-current" data-channel={current}>{current?`@${current}`:'Choose a streamer'}</span>{/^[a-z0-9_]{1,40}$/.test(current)&&current.toLowerCase()!==activeChannel&&<a className="channel-stream-link" href={`https://www.twitch.tv/${current}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${current}'s stream on Twitch`} title="Open stream on Twitch"><ArrowUpRight size={15}/></a>}</span><ExpandableSearchBar expandDirection="left" width={400} placeholder="Twitch name or link…" inputLabel="Twitch channel" openLabel="Search channel" submitLabel="Search streamer" closeLabel="Close search" resultsLabel="Twitch channels" liveLabel="Live" offlineLabel="Channel" lookupError="Twitch search failed. Try again." emptyLabel="No Twitch channels found." loading={busy} lookup={lookup} onSearch={query=>void search(query)} onClear={()=>setError('')}/></div>{error&&<p className="points-error" role="status">{error}</p>}</>;
}
export function mountChannelSearch(node:HTMLElement,onSelect:(channel:string)=>Promise<void>,lookup:(query:string,signal:AbortSignal)=>Promise<TwitchChannelResult[]>){
 const root=createRoot(node);
 const update=(current:string,activeChannel='')=>root.render(<ChannelSearch current={current} activeChannel={activeChannel} onSelect={onSelect} lookup={lookup}/>);
 update('');return update;
}
