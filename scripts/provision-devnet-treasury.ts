import {Keypair} from '@solana/web3.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

// Run on the vault host. The generated key travels only through process memory
// and loopback into encrypted vault storage; stdout contains public metadata only.
if(process.env.POINTS_NETWORK!=='devnet')throw new Error('Esta herramienta solo admite devnet');
const vault=new URL(process.env.VAULT_URL??'http://127.0.0.1:8100');
if(!['127.0.0.1','localhost','[::1]'].includes(vault.hostname))throw new Error('La provisión debe ejecutarse junto al vault por loopback');
const name='PLOT_DEVNET_TREASURY_KEYPAIR';
const receiptFile=resolve(process.argv[2]??'data/managed-devnet-treasury.json');
const response=await fetch(new URL('/api/secrets',vault),{signal:AbortSignal.timeout(10000)});
if(!response.ok)throw new Error(`No se pudo listar nombres del vault: HTTP ${response.status}`);
const metadata=await response.json() as {secrets:{name:string}[]};
if(metadata.secrets.some(s=>s.name===name)){
  const receipt=JSON.parse(await readFile(receiptFile,'utf8')) as {network:string;secretName:string;address:string};
  if(receipt.network!=='devnet'||receipt.secretName!==name)throw new Error('El secreto ya existe y no coincide con el recibo; no se sobrescribe');
  console.log(JSON.stringify({...receipt,reused:true}));
}else{
  const keypair=Keypair.generate();
  const saved=await fetch(new URL('/api/secrets',vault),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,value:JSON.stringify(Array.from(keypair.secretKey)),description:'Plot automated withdrawals. Dedicated DEVNET treasury; never fund this key on mainnet.'}),signal:AbortSignal.timeout(10000)});
  if(!saved.ok)throw new Error(`El vault no confirmó el guardado: HTTP ${saved.status}`);
  const receipt={network:'devnet',secretName:name,address:keypair.publicKey.toBase58(),createdAt:new Date().toISOString()};
  await mkdir(dirname(receiptFile),{recursive:true,mode:0o700});
  await writeFile(receiptFile,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({...receipt,reused:false}));
}
