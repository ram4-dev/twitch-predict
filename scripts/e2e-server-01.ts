import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

// Session-1 isolated E2E launcher: own portless state dir and 1368 proxy port so it never
// collides with the coordinator's 1356/1358 servers or session 2's launcher.
const directory=await mkdtemp(`${tmpdir()}/plot-e2e-01-`);
await mkdir(resolve(directory,'fixtures'),{recursive:true});
const fixture=resolve(directory,'fixtures','twitch.json');
await writeFile(fixture,JSON.stringify({channels:[{id:'demo_streamer',login:'demo_streamer',displayName:'demo_streamer'}],predictions:[]}));
const byteFixture=resolve(directory,'fixtures','byte.json');
await writeFile(byteFixture,JSON.stringify({markets:[]}));
const pidFile=resolve(directory,'server.pid');
const PORT='1368';
const server=spawn('portless',['twitch-predict-p1',process.execPath,'--import','tsx','--import',resolve('tests/fixtures/twitch-preload.mjs'),'--import',resolve('tests/fixtures/byte-preload.mjs'),'src/server.ts'],{stdio:'inherit',env:{...process.env,MARKET_MODE:'offchain',APP_ENV_FILE:'',BYTE_API_KEY:'byte-e2e-only',BYTE_BASE_URL:'https://app.bytearena.fun',BYTE_RPC_URL:'https://api.devnet.solana.com',BYTE_OPERATOR_WALLETS:'',BYTE_FIXTURE_FILE:byteFixture,TWITCH_CLIENT_ID:'e2e-client',TWITCH_CLIENT_SECRET:'e2e-only-secret',AUTH_ORIGIN:`http://twitch-predict-p1.localhost:${PORT}`,TWITCH_OAUTH_FIXTURE:resolve('test-results/twitch-oauth.json'),PORTLESS_STATE_DIR:resolve(directory,'proxy'),PORTLESS_PORT:PORT,PORTLESS_HTTPS:'0',DATA_DIR:directory,TWITCH_FIXTURE_FILE:fixture,E2E_SERVER_PID_FILE:pidFile}});
server.on('exit',async code=>{try{execFileSync('portless',['proxy','stop'],{env:{...process.env,PORTLESS_STATE_DIR:resolve(directory,'proxy'),PORTLESS_PORT:PORT,PORTLESS_HTTPS:'0'},stdio:'ignore'});}catch{/* The isolated proxy may already be stopped. */}await rm(directory,{recursive:true,force:true});process.exit(code??0);});
void randomUUID;void readFile;
