import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';

// Plan 2 session launcher: own Portless state and port (1362) so parallel E2E sessions never collide.
const port=process.env.E2E_PORT??'1362';
// Fixed internal app port: E2E hit the server directly (stable origin), the proxy front stays for humans.
const appPort=process.env.E2E_APP_PORT??'14622';
await mkdir('test-results',{recursive:true});
const directory=await mkdtemp(`${tmpdir()}/points-e2e-p2-`);
const pidFile=resolve(directory,'server.pid');
const fixture=resolve(directory,'twitch-fixture.json');await writeFile(fixture,'[]');
// E2E tests write this fixture path too; keep them aligned (relative to cwd, test-results may be wiped by playwright).
const byteFixture=resolve(directory,'byte-fixture.json');await writeFile(byteFixture,JSON.stringify({markets:[],signatures:{},broadcasts:0,resolutions:0,invalidations:0,syncs:0}));
await mkdir('.e2e-fixtures',{recursive:true});await writeFile(resolve('.e2e-fixtures/twitch-oauth.json'),JSON.stringify({id:'12345',login:'fixture_streamer',display_name:'Fixture Streamer'}));
const server=spawn('portless',['twitch-predict','--app-port',appPort,'--',process.execPath,'--import','tsx','--import',resolve('tests/fixtures/twitch-preload.mjs'),'--import',resolve('tests/fixtures/byte-preload.mjs'),'src/server.ts'],{stdio:'inherit',env:{...process.env,MARKET_MODE:process.env.E2E_MARKET_MODE==='byte'?'byte':'offchain',APP_ENV_FILE:'',BYTE_API_KEY:'byte-e2e-only',BYTE_BASE_URL:'https://app.bytearena.fun',BYTE_RPC_URL:'https://api.devnet.solana.com',BYTE_OPERATOR_WALLETS:'',BYTE_FIXTURE_FILE:byteFixture,TWITCH_CLIENT_ID:'e2e-client',TWITCH_CLIENT_SECRET:'e2e-only-secret',AUTH_ORIGIN:`http://twitch-predict.localhost:${appPort}`,TWITCH_OAUTH_FIXTURE:resolve('.e2e-fixtures/twitch-oauth.json'),PORTLESS_STATE_DIR:resolve(directory,'proxy'),PORTLESS_PORT:port,PORTLESS_HTTPS:'0',DATA_DIR:directory,TWITCH_FIXTURE_FILE:fixture,E2E_SERVER_PID_FILE:pidFile}});
// Publish the internal (proxy-free) port for E2E tests that bypass the portless front.
void (async()=>{for(let i=0;i<60;i++){try{const p=(await readFile(resolve(directory,'runtime-port'),'utf8')).trim();if(p){await mkdir('.e2e-fixtures',{recursive:true});await writeFile('.e2e-fixtures/internal-port',p);return;}}catch{/* The runtime port file appears only after portless starts; retry until it does. */}await new Promise(r=>setTimeout(r,500));}})();
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{if(stopping)return;stopping=true;void (async()=>{try{process.kill(Number(await readFile(pidFile,'utf8')),signal);}catch{/* The child may already have exited. */}server.kill(signal);})();});
server.on('exit',async code=>{try{execFileSync('portless',['proxy','stop'],{env:{...process.env,PORTLESS_STATE_DIR:resolve(directory,'proxy'),PORTLESS_PORT:port,PORTLESS_HTTPS:'0'},stdio:'ignore'});}catch{/* The isolated proxy may already be stopped. */}await rm(directory,{recursive:true,force:true});process.exit(code??0);});
