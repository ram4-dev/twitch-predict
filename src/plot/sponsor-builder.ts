import { createHash } from 'node:crypto';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { buildIdlPlotInstruction, type PlotIdl } from './instructions.js';
import type { SponsorDependencies, SponsorRequest } from './sponsor.js';

const TOKEN = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ATA = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const POSITION_SPACE = 92; // ae18a73: Anchor discriminator plus Position::INIT_SPACE.
const MAX = 0xffffffffffffffffn;
const pda = (program: PublicKey, ...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds,program)[0];
const disc = (name: string) => createHash('sha256').update(`account:${name}`).digest().subarray(0,8);
const key = (data: Buffer, offset: number) => new PublicKey(data.subarray(offset,offset+32));
const eq = (data: Buffer, offset: number, expected: PublicKey) => key(data,offset).equals(expected);
function integer(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || value.length > 20) throw new Error('Invalid integer');
  const n = BigInt(value); if (n > MAX) throw new Error('Integer overflow'); return n;
}
/** Only instantiate with a separately genesis-verified connection and server-owned
 * session-to-wallet lookup. Account decoding is pinned to the f6bb39d IDL. */
export function createPlotSponsorBuilder(options: {connection:Connection; expectedGenesis:string; idl:PlotIdl; program:PublicKey; mint:PublicKey; sponsor:PublicKey; ownsWallet:(userId:string,wallet:PublicKey)=>Promise<boolean>; authorizeMarket:(userId:string,identity:Buffer,operation:SponsorRequest['operation'])=>Promise<boolean>}): SponsorDependencies['build'] {
  const {connection,expectedGenesis,idl,program,mint,sponsor,ownsWallet,authorizeMarket} = options;
  if (!expectedGenesis) throw new Error('Expected genesis is required');
  return async (request: SponsorRequest) => {
    if (await connection.getGenesisHash() !== expectedGenesis) throw new Error('Unexpected network genesis');
    const owner = new PublicKey(request.wallet);
    if (!await ownsWallet(request.userId,owner)) throw new Error('Wallet not linked to session');
    if (!request.parameters || typeof request.parameters !== 'object' || Array.isArray(request.parameters)) throw new Error('Invalid parameters');
    const params = request.parameters as Record<string,unknown>;
    const fields = request.operation === 'claim' ? ['marketIdentity'] : ['amount','marketIdentity','option','sequence'];
    if (Object.keys(params).sort().join(',') !== fields.join(',') || typeof params.marketIdentity !== 'string' || !/^[0-9a-f]{64}$/.test(params.marketIdentity)) throw new Error('Invalid parameters');
    const identity = Buffer.from(params.marketIdentity,'hex');
    if (!await authorizeMarket(request.userId,identity,request.operation)) throw new Error('Market not authorized');
    const config = pda(program,Buffer.from('config'));
    const market = pda(program,Buffer.from('market'),config.toBuffer(),identity);
    const position = pda(program,Buffer.from('position'),market.toBuffer(),owner.toBuffer());
    const tokenAccount = pda(ATA,owner.toBuffer(),TOKEN.toBuffer(),mint.toBuffer());
    const [cfg,mkt,pos,mintAccount,token] = await connection.getMultipleAccountsInfo([config,market,position,mint,tokenAccount], 'confirmed');
    if (!cfg || !cfg.owner.equals(program) || cfg.data.length !== 174 || !cfg.data.subarray(0,8).equals(disc('Config')) || cfg.data[8] !== 1 || !eq(cfg.data,41,mint)) throw new Error('Invalid config');
    if (!mkt || !mkt.owner.equals(program) || mkt.data.length !== 449 || !mkt.data.subarray(0,8).equals(disc('Market')) || !eq(mkt.data,8,config) || mkt.data[40] !== 1 || !mkt.data.subarray(41,73).equals(identity)) throw new Error('Invalid market');
    if (!mintAccount || !mintAccount.owner.equals(TOKEN) || mintAccount.data.length < 82 || mintAccount.data[44] !== 0 || mintAccount.data[45] !== 1) throw new Error('Invalid PLOT mint');
    if (!token || !token.owner.equals(TOKEN) || token.data.length < 165 || !eq(token.data,0,mint) || !eq(token.data,32,owner) || token.data[108] !== 1) throw new Error('Invalid user token account');
    if (pos && (!pos.owner.equals(program) || pos.data.length !== POSITION_SPACE || !pos.data.subarray(0,8).equals(disc('Position')) || pos.data[8] !== 1 || !eq(pos.data,9,market) || !eq(pos.data,41,owner))) throw new Error('Invalid position');
    let option: number | undefined, amount: bigint | undefined, sequence: bigint | undefined;
    if (request.operation === 'place_prediction') {
      option = params.option as number; amount = integer(params.amount); sequence = integer(params.sequence);
      if (mkt.data[297] < 2 || mkt.data[297] > 6 || !Number.isInteger(option) || option < 0 || option >= mkt.data[297] || amount === 0n || token.data.readBigUInt64LE(64) < amount || mkt.data[446] !== 0) throw new Error('Prediction unavailable');
      const now = await connection.getBlockTime(await connection.getSlot('confirmed'));
      if (now === null || BigInt(now) >= mkt.data.readBigInt64LE(298)) throw new Error('Market closed');
      if (pos ? (pos.data[73] !== option || pos.data.readBigUInt64LE(82) !== sequence || pos.data[90] !== 0) : sequence !== 0n) throw new Error('Invalid position sequence');
      if (sequence === MAX || (pos && pos.data.readBigUInt64LE(74) > MAX-amount) || mkt.data.readBigUInt64LE(362) > MAX-amount || mkt.data.readBigUInt64LE(314+option*8) > MAX-amount) throw new Error('Prediction overflow');
    } else if (!pos || pos.data[90] !== 0 || ![2,3].includes(mkt.data[446])) throw new Error('Claim unavailable');
    const instruction = buildIdlPlotInstruction(idl,program,{operation:request.operation,owner,payer:sponsor,mint,marketIdentity:identity,existingPosition:!!pos,option,amount,sequence});
    const lifetime = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({feePayer:sponsor,recentBlockhash:lifetime.blockhash}).add(instruction);
    const rent = !pos ? await connection.getMinimumBalanceForRentExemption(POSITION_SPACE,'confirmed') : 0;
    if (!Number.isSafeInteger(rent) || rent < 0) throw new Error('Invalid rent estimate');
    return {transaction,lastValidBlockHeight:lifetime.lastValidBlockHeight,rentLamports:BigInt(rent),newAccounts:pos ? 0 : 1};
  };
}
