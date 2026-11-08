import {useState,type FormEvent} from 'react';
import {Loader2,Search} from 'lucide-react';
import {searchTwitch} from './twitch-search.js';
import {streamerChannel} from './streamer-page.js';
import {Button} from './components/button.js';
import type {TwitchChannelResult} from '../twitch-search.js';

/** Public channel search for the landing: read-only navigation, no watch() writes. */
export function StreamerSearch(){
  const [query,setQuery]=useState(''),[results,setResults]=useState<TwitchChannelResult[]|undefined>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async(event:FormEvent)=>{
    event.preventDefault();setError('');
    const name=streamerChannel(query);
    if(!name){setError('Ingresá el nombre del streamer o su enlace de Twitch.');setResults(undefined);return;}
    setBusy(true);
    try{
      // Normalize before the API call: /api/twitch/search expects a bare login.
      setResults(await searchTwitch(name,new AbortController().signal));
    }catch(e){setError((e as Error).message);setResults(undefined);}
    finally{setBusy(false);}
  };
  return <div className="streamer-search">
    <form className="streamer-form" onSubmit={event=>void submit(event)}>
      <div className="form-row">
        <input aria-label="Buscar streamer" placeholder="@streamer o enlace de twitch.tv" value={query} maxLength={200} onChange={event=>setQuery(event.target.value)} disabled={busy}/>
        <Button type="submit" disabled={busy} aria-label="Buscar">{busy?<Loader2 size={16} className="animate-spin"/>:<Search size={16}/>}Buscar</Button>
      </div>
    </form>
    <p role={error?'alert':'status'} aria-live="polite" className="streamer-search-feedback">{error||''}</p>
    {results&&<ul className="streamer-results">
      {results.length===0&&<li className="streamer-result-empty">Twitch no devolvió resultados para esa búsqueda.</li>}
      {results.map(channel=><li key={channel.login}>
        <a className="streamer-result" href={`/s/twitch/${channel.login}`}>
          <span className="streamer-result-name">{channel.displayName}</span>
          <span className="streamer-result-meta">@{channel.login} · Twitch{channel.live?' · en vivo':''}</span>
        </a>
      </li>)}
    </ul>}
  </div>;
}
