import {TWITCH_CLIENT_ID} from './prediction.js';

export type TwitchChannelResult={login:string;displayName:string;live:boolean};
const QUERY='query PlotChannelSearch($q:String!){searchUsers(userQuery:$q,first:10){edges{node{id login displayName stream{id}}}}}';

/** Uses the same public Twitch web GraphQL source as the prediction mirror. */
export class TwitchChannelSearch {
 private cache=new Map<string,{expires:number;results:TwitchChannelResult[]}>();
 constructor(private readonly transport:typeof fetch=fetch){}
 async search(input:string):Promise<TwitchChannelResult[]>{
  const query=input.trim().replace(/^@/,'').toLowerCase();
  if(!/^[a-z0-9_]{2,40}$/.test(query))throw new Error('Ingresá al menos dos caracteres del usuario de Twitch.');
  const now=Date.now(),cached=this.cache.get(query);if(cached&&cached.expires>now)return cached.results;
  const response=await this.transport('https://gql.twitch.tv/gql',{method:'POST',headers:{'Client-ID':TWITCH_CLIENT_ID,'Content-Type':'application/json'},body:JSON.stringify({query:QUERY,variables:{q:query}}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('No pudimos consultar Twitch. Probá de nuevo.');
  const data=await response.json() as {errors?:unknown;data?:{searchUsers?:{edges?:Array<{node?:{login?:unknown;displayName?:unknown;stream?:unknown}}>} }};
  if(data.errors||!Array.isArray(data.data?.searchUsers?.edges))throw new Error('Twitch no devolvió resultados. Probá de nuevo.');
  const results=data.data.searchUsers.edges.flatMap(({node})=>{
   if(typeof node?.login!=='string'||! /^[a-z0-9_]{1,40}$/.test(node.login)||typeof node.displayName!=='string')return [];
   return [{login:node.login,displayName:node.displayName.slice(0,100),live:!!node.stream}];
  }).slice(0,10);
  if(this.cache.size>=200)this.cache.delete(this.cache.keys().next().value!);
  this.cache.set(query,{expires:now+15000,results});return results;
 }
}
