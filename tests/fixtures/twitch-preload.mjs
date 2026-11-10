// Only loaded by the isolated E2E server, never by the application launcher.
import {readFile,writeFile} from 'node:fs/promises';
await writeFile(process.env.E2E_SERVER_PID_FILE,String(process.pid));
const original=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
  const url=String(input);
  if(url.startsWith('https://id.twitch.tv/oauth2/')||url.startsWith('https://api.twitch.tv/helix/users')){
    // E2E tests may write either fixture path (test-results is wiped per run; .e2e-fixtures is stable):
    // the most recently written one wins, so tests flipping identities always read their own value.
    let oauthRaw='';let oauthTime=0;for(const p of ['test-results/twitch-oauth.json','.e2e-fixtures/twitch-oauth.json']){try{const raw=await readFile(p,'utf8');const stat=await (await import('node:fs/promises')).stat(p);if(stat.mtimeMs>=oauthTime){oauthRaw=raw;oauthTime=stat.mtimeMs;}}catch{/* path absent */}}
    const user=JSON.parse(oauthRaw||'{}');
    if(url.endsWith('/token'))return Response.json({access_token:'e2e-access-token',refresh_token:'e2e-refresh-token',token_type:'bearer',expires_in:3600});
    if(url.endsWith('/validate'))return Response.json({client_id:'e2e-client',user_id:user.id,login:user.login,scopes:user.scopes??['channel:bot'],expires_in:3600});
    if(url.includes('/users?login='))return Response.json({data:[]});
    if(url.endsWith('/users'))return Response.json({data:[user]});
    return new Response(null,{status:200});
  }
  // Get Moderators fixture: mode file takes precedence (E2E flips it between steps), then the env var.
  // 'deny' → empty list; 'outage' → network failure; JSON array → list of user ids.
  if(url.startsWith('https://api.twitch.tv/helix/moderation/moderators')){
    let mode='';try{mode=(await readFile(new URL('../../.e2e-fixtures/moderators-mode',import.meta.url).pathname,'utf8')).trim();}catch{/* No mode file: fall back to the env var (default deny). */}
    if(!mode)mode=process.env.TWITCH_MODERATORS_FIXTURE??'';
    if(mode==='outage')throw new TypeError('fetch failed: fixture network outage');
    if(mode==='deny')return Response.json({data:[]});
    let users=[];try{users=JSON.parse(mode);}catch{/* mode is not a JSON list: treat as an empty deny list. */}
    return Response.json({data:users.map(id=>({user_id:String(id)}))});
  }
  if(url!=='https://gql.twitch.tv/gql')return original(input,options);
  // GQL market fixture: E2E tests write test-results/twitch-fixture.json; the launcher seeds its own tmp copy.
  let fixtures=[];for(const p of ['test-results/twitch-fixture.json',process.env.TWITCH_FIXTURE_FILE??'']){try{fixtures=JSON.parse(await readFile(p,'utf8'));break;}catch{/* try next path */}}
  const {query,variables}=JSON.parse(options.body);
  if(query.includes('searchUsers(')){const names=[...new Set([...fixtures.map(p=>p.channel),'eggsterr','summit1g'])].filter(n=>n.toLowerCase().includes(variables.q.toLowerCase())).slice(0,10);return Response.json({data:{searchUsers:{edges:names.map(login=>({node:{login,displayName:login,stream:login==='eggsterr'?{id:'live'}:null}}))}}});}
  if(fixtures.some(p=>p.channel===variables.channel&&p.sourceError))return new Response(null,{status:503});
  if(query.includes('predictionEvent(')){const prediction=fixtures.find(p=>p.id===variables.id);return Response.json({data:{predictionEvent:prediction?{...prediction,channel:{name:prediction.channel}}:null}});}
  return Response.json({data:{user:variables.channel==='missing_streamer_fixture'?null:{id:'fixture-user',displayName:variables.channel,stream:variables.channel==='offline_streamer_fixture'?null:{title:'Stream de prueba',viewersCount:1234}},channel:{activePredictionEvents:fixtures.filter(p=>p.channel===variables.channel&&['ACTIVE','LOCKED'].includes(p.status)&&!p.inactive)}}});
};
