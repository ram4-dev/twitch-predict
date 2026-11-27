import {createHash} from 'node:crypto';
import {PublicKey,type Connection} from '@solana/web3.js';
/** Test networks only: bind an IDL override to the exact deployed upgradeable binary. */
export async function verifyTestProgramBinary(connection:Pick<Connection,'getAccountInfo'>,program:PublicKey,expected:string){
 if(!/^[a-f0-9]{64}$/.test(expected))throw new Error('Invalid test program digest');
 const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),account=await connection.getAccountInfo(program,'finalized');
 if(!account?.executable||!account.owner.equals(loader)||account.data.length!==36||account.data.readUInt32LE(0)!==2)throw new Error('Invalid test program');
 const data=await connection.getAccountInfo(new PublicKey(account.data.subarray(4,36)),'finalized');
 if(!data||!data.owner.equals(loader)||data.data.length<=45||data.data.readUInt32LE(0)!==3||createHash('sha256').update(data.data.subarray(45)).digest('hex')!==expected)throw new Error('Test program digest mismatch');
}
