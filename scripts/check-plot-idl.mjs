// Verify the provisional or generated IDL before enabling the handwritten server adapter.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const path=process.argv[2];if(!path)throw new Error('Usage: node scripts/check-plot-idl.mjs <generated-idl.json>');
const idl=JSON.parse(readFileSync(path,'utf8'));
const defs={
 credit_points:[['payment_authority',1,1],['config',0,0],['mint',0,1],['owner',0,0],['destination',0,1],['mint_authority',0,0],['receipt',0,1],['token_program',0,0],['system_program',0,0]],
 lock_market:[['actor',1,0],['config',0,0],['market',0,1]],cancel_market:[['actor',1,0],['config',0,0],['market',0,1]],
 resolve_market:[['resolver',1,0],['config',0,0],['market',0,1],['mint',0,1],['treasury',0,0],['streamer',0,0],['treasury_ata',0,1],['streamer_ata',0,1],['mint_authority',0,0],['token_program',0,0]],
};
const args={credit_points:[{name:'payment_hash',type:{array:['u8',32]}},{name:'amount',type:'u64'}],lock_market:[],cancel_market:[],resolve_market:[{name:'winner',type:'u8'}]};
for(const [name,expected] of Object.entries(defs)){
 const ix=idl.instructions.find(i=>i.name===name);assert.ok(ix,`Missing ${name}`);
 assert.deepEqual(ix.accounts.map(a=>[a.name,Number(!!a.signer),Number(!!a.writable)]),expected,name);
 assert.deepEqual(ix.discriminator,[...createHash('sha256').update(`global:${name}`).digest().subarray(0,8)],name);
 assert.deepEqual(ix.args,args[name],name);
}
const fields={
 Config:[['version','u8'],['admin','pubkey'],['mint','pubkey'],['payment_authority','pubkey'],['resolver','pubkey'],['treasury','pubkey'],['treasury_bps','u16'],['streamer_bps','u16'],['bump','u8']],
 PaymentReceipt:[['initialized','bool'],['owner','pubkey'],['mint','pubkey'],['amount','u64'],['payment_hash',{array:['u8',32]}]],
 Position:[['initialized','bool'],['market','pubkey'],['owner','pubkey'],['option','u8'],['stake','u64'],['sequence','u64'],['claimed','bool'],['bump','u8']],
 Market:[['config','pubkey'],['rules_version','u8'],['identity',{array:['u8',32]}],['creator','pubkey'],['option_ids',{array:[{array:['u8',32]},6]}],['option_count','u8'],['close','i64'],['timeout','i64'],['totals',{array:['u64',6]}],['gross','u64'],['net','u64'],['treasury','pubkey'],['streamer','pubkey'],['treasury_bps','u16'],['streamer_bps','u16'],['state','u8'],['winner','u8'],['bump','u8']],
};
for(const [name,expected] of Object.entries(fields)){
 const account=idl.accounts.find(a=>a.name===name),type=idl.types.find(t=>t.name===name);assert.ok(account&&type,`Missing ${name}`);
 assert.deepEqual(account.discriminator,[...createHash('sha256').update(`account:${name}`).digest().subarray(0,8)],name);
 assert.deepEqual(type.type.fields.map(f=>[f.name,f.type]),expected,name);
}
console.log('Plot adapter layout matches IDL:',path);
