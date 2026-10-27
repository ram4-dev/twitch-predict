import {cloudConfig} from './config.js';
import {Documents} from './documents.js';
import {cloudApp} from './app.js';
const config=cloudConfig(),documents=new Documents(config.database,config.namespace);
await documents.migrate();
const app=cloudApp(documents);
const server=app.listen(Number(process.env.PORT??3000),'0.0.0.0',()=>console.log('Plot API ready'));
process.on('SIGTERM',()=>{app.locals.liveMarkets.close();server.close(()=>{void documents.close();});setTimeout(()=>process.exit(1),25000).unref();});
