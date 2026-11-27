import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {ensurePredictionSubscriptions} from '../src/cloud/plot/twitch-adapter.js';
test('EventSub registration validates broadcaster authorization and creates only missing subscription',async()=>{
 const posts:string[]=[];const request:typeof fetch=async (input,init)=>{
  const url=String(input);
  if(url.includes('/validate'))return Response.json({client_id:'client',user_id:'b',scopes:['channel:read:predictions']});
  if(url.endsWith('/token'))return Response.json({access_token:'app-fixture'});
  if(init?.method==='POST'){posts.push(JSON.parse(String(init.body)).type);return Response.json({});}
  return Response.json({data:[{type:'channel.prediction.lock',status:'enabled',condition:{broadcaster_user_id:'b'},transport:{method:'webhook',callback:'https://plot.example/api/plot/v1/twitch/eventsub'}}],pagination:{}});
 };
 await ensurePredictionSubscriptions({clientId:'client',clientSecret:'fixture',userToken:'fixture',secret:'fixture-secret',callback:'https://plot.example/api/plot/v1/twitch/eventsub'},request);
 assert.deepEqual(posts,['channel.prediction.end']);
 await assert.rejects(ensurePredictionSubscriptions({clientId:'wrong',clientSecret:'fixture',userToken:'fixture',secret:'fixture-secret',callback:'https://plot.example/api/plot/v1/twitch/eventsub'},request));
});
