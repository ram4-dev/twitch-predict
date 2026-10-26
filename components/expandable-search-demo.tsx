import {useState} from 'react';
import ExpandableSearchBar from '@/components/ui/expandable-search-bar';
export default function ExpandableSearchDemo(){
  const [query,setQuery]=useState('');
  return <section className="search-demo grid gap-8" aria-label="Ejemplos de búsqueda expandible">
    <div><p>Hacia la derecha</p><ExpandableSearchBar width={250} placeholder="Buscar streamer…" inputLabel="Búsqueda hacia la derecha" openLabel="Abrir búsqueda hacia la derecha" onSearch={setQuery}/></div>
    <div><p>Hacia la izquierda</p><div className="flex justify-end"><ExpandableSearchBar expandDirection="left" width={250} placeholder="Buscar streamer…" inputLabel="Búsqueda hacia la izquierda" openLabel="Abrir búsqueda hacia la izquierda" onSearch={setQuery}/></div></div>
    <p role="status">{query?`Búsqueda de ejemplo: ${query}`:'Probá buscar un canal de Twitch.'}</p>
  </section>;
}
