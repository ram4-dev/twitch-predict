import {cloudConfig} from './config.js';
import {Documents} from './documents.js';
import {cloudApp} from './app.js';
const config=cloudConfig(),documents=new Documents(config.database,config.namespace);
await documents.migrate();
const server=cloudApp(documents).listen(Number(process.env.PORT??3000),'0.0.0.0',()=>console.log('Plot API ready'));
process.on('SIGTERM',()=>{server.close(()=>{void documents.close();});setTimeout(()=>process.exit(1),25000).unref();});
