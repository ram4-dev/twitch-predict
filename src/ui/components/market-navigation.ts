import type {MouseEvent} from 'react';

export function marketHref(key:string){const url=new URL(location.href);url.searchParams.set('market',key);return url.href;}
export function navigateMarket(event:MouseEvent<HTMLAnchorElement>,open:()=>void){if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();open();}
