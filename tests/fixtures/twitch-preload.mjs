// Only loaded by the isolated E2E server, never by the application launcher.
import {readFile,writeFile} from 'node:fs/promises';
await writeFile(process.env.E2E_SERVER_PID_FILE,String(process.pid));
const original=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
  const url=String(input);
  if(url.startsWith('https://id.twitch.tv/oauth2/')||url==='https://api.twitch.tv/helix/users'){
    const user=JSON.parse(await readFile(process.env.TWITCH_OAUTH_FIXTURE,'utf8'));
    if(url.endsWith('/token'))return Response.json({access_token:'e2e-access-token',refresh_token:'e2e-refresh-token',token_type:'bearer'});
    if(url.endsWith('/validate'))return Response.json({client_id:'e2e-client',user_id:user.id,login:user.login,expires_in:3600});
    if(url.endsWith('/users'))return Response.json({data:[user]});
    return new Response(null,{status:200});
  }
  if(url!=='https://gql.twitch.tv/gql')return original(input,options);
  const fixtures=JSON.parse(await readFile(process.env.TWITCH_FIXTURE_FILE,'utf8'));
  const {query,variables}=JSON.parse(options.body);
  if(query.includes('searchUsers(')){const names=[...new Set([...fixtures.map(p=>p.channel),'eggsterr','summit1g'])].filter(n=>n.toLowerCase().includes(variables.q.toLowerCase())).slice(0,10);return Response.json({data:{searchUsers:{edges:names.map(login=>({node:{login,displayName:login,stream:login==='eggsterr'?{id:'live'}:null}}))}}});}
  if(fixtures.some(p=>p.channel===variables.channel&&p.sourceError))return new Response(null,{status:503});
  if(query.includes('predictionEvent(')){const prediction=fixtures.find(p=>p.id===variables.id);return Response.json({data:{predictionEvent:prediction?{...prediction,channel:{name:prediction.channel}}:null}});}
  return Response.json({data:{user:variables.channel==='missing_streamer_fixture'?null:{id:'fixture-user',displayName:variables.channel,stream:variables.channel==='offline_streamer_fixture'?null:{title:'Stream de prueba',viewersCount:1234}},channel:{activePredictionEvents:fixtures.filter(p=>p.channel===variables.channel&&p.status==='ACTIVE')}}});
};
