// Only loaded by the isolated E2E server, never by the application launcher.
import {readFile,writeFile} from 'node:fs/promises';
await writeFile(process.env.E2E_SERVER_PID_FILE,String(process.pid));
const original=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
  if(String(input)!=='https://gql.twitch.tv/gql')return original(input,options);
  const fixtures=JSON.parse(await readFile(process.env.TWITCH_FIXTURE_FILE,'utf8'));
  const {query,variables}=JSON.parse(options.body);
  if(query.includes('predictionEvent(')){const prediction=fixtures.find(p=>p.id===variables.id);return Response.json({data:{predictionEvent:prediction?{...prediction,channel:{name:prediction.channel}}:null}});}
  return Response.json({data:{channel:{activePredictionEvents:fixtures.filter(p=>p.channel===variables.channel&&p.status==='ACTIVE')}}});
};
