// Exercise server instruction builders inside the Anchor checkout's isolated validator suite.
// Usage: node scripts/plot-validator-e2e.mjs /absolute/path/to/anchor/checkout/programs/plot
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=process.argv[2];if(!root||!root.startsWith('/'))throw new Error('Expected absolute Anchor programs/plot path');
let source=readFileSync(join(root,'tests/local.cjs'),'utf8');
function replace(from,to){if(!source.includes(from))throw new Error('Anchor test harness changed; review before running');source=source.replace(from,to);}
replace("const root = path.resolve(__dirname, '..');",`const root = ${JSON.stringify(root)};`);
replace('async function main() {',`async function main() {\n const adapter = await import(${JSON.stringify(pathToFileURL(resolve('src/cloud/plot/solana.ts')).href)});`);
replace('const port = await freePort();\n  let faucet; do { faucet = await freePort(); } while (Math.abs(faucet - port) <= 1);', 'const port = await freePort();\n  let faucet; do { faucet = await freePort(); } while (Math.abs(faucet - port) <= 2);\n  let gossip; do { gossip = await freePort(); } while (Math.abs(gossip-port) <= 2 || Math.abs(gossip-faucet) <= 1);');
replace("['--ledger', ledger, '--rpc-port'", "['--gossip-port', String(gossip), '--mint', admin.publicKey.toBase58(), '--ledger', ledger, '--rpc-port'");
replace("const credit = (owner, destination, n, amount) => program.methods.creditPoints(bytes(n), new BN(amount)).accountsStrict({paymentAuthority: admin.publicKey, config, mint: mint.publicKey, owner, destination, mintAuthority, receipt: receipt(n), tokenProgram, systemProgram}).rpc();", "const credit = (owner, destination, n, amount) => provider.sendAndConfirm(new web3.Transaction().add(adapter.creditInstruction({program:programId,authority:admin.publicKey,mint:mint.publicKey,owner,key:Buffer.from(bytes(n)).toString('hex'),amount:String(amount)})));");
replace("await program.methods.lockMarket().accountsStrict({actor: admin.publicKey, config, market}).rpc();", "await provider.sendAndConfirm(new web3.Transaction().add(adapter.changeMarketInstruction({program:programId,actor:admin.publicKey,identity:Buffer.from(identity).toString('hex'),operation:'lock_market'})));");
replace("const resolve = () => program.methods.resolveMarket(0).accountsStrict({resolver: admin.publicKey, config, market, mint: mint.publicKey, treasury: admin.publicKey, streamer: streamer.publicKey, treasuryAta: t, streamerAta: st, mintAuthority, tokenProgram}).rpc();", "const resolve = () => provider.sendAndConfirm(new web3.Transaction().add(adapter.resolveInstruction({program:programId,resolver:admin.publicKey,identity:Buffer.from(identity).toString('hex'),mint:mint.publicKey,treasury:admin.publicKey,streamer:streamer.publicKey,winner:0}))); ");
replace("await program.methods.cancelMarket().accountsStrict({actor: admin.publicKey, config, market: market2}).rpc();", "await provider.sendAndConfirm(new web3.Transaction().add(adapter.changeMarketInstruction({program:programId,actor:admin.publicKey,identity:Buffer.from(identity2).toString('hex'),operation:'cancel_market'})));");
const dir=mkdtempSync(join(tmpdir(),'plot-adapter-test-'));try{
 const script=join(dir,'local.cjs');writeFileSync(script,source);
 const result=spawnSync(process.execPath,['--import','tsx',script],{stdio:'inherit',env:{...process.env,NODE_PATH:join(root,'tests/node_modules')}});if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{rmSync(dir,{recursive:true,force:true});}
