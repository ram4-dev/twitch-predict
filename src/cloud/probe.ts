import {cloudConfig} from './config.js';
import {Documents} from './documents.js';
import {Points} from '../points.js';
import {TwitchSource} from '../twitch-source.js';
import {ByteService} from '../byte.js';
const config=cloudConfig(),docs=new Documents(config.database,config.namespace);
try{
 await docs.pool.query('SELECT 1');
 const points=new Points('',docs);await points.load();
 const source=new TwitchSource(points),byte=new ByteService('',process.env.BYTE_API_KEY??'',undefined,fetch,docs);await byte.load();
 const byteConfig=await byte.config(),markets=await byte.list();
 const predictions=await source.active(config.channels[0]??'eggsterr');
 console.log(JSON.stringify({database:true,byte:byteConfig.enabled,network:byteConfig.sol.cluster,partnerMarkets:markets.length,twitch:true,activePredictions:predictions.length}));
}catch{console.error('Cloud network probe failed');process.exitCode=1;}finally{await docs.close();}
