import { createHash } from 'node:crypto';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import type { SponsorOperation } from './sponsor.js';

const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
type IdlInstruction = { name: string; discriminator: number[]; accounts: { name: string; signer?: boolean; writable?: boolean }[]; args: { name: string; type: unknown }[] };
export type PlotIdl = { address: string; instructions: IdlInstruction[] };
export type VettedPlotOperation = {
  operation: SponsorOperation; owner: PublicKey; payer?: PublicKey; mint: PublicKey; marketIdentity: Uint8Array;
  /** The backend must obtain this from authoritative RPC, not from the client. */
  existingPosition: boolean;
  option?: number; amount?: bigint; sequence?: bigint;
};
const expected = {
  place_prediction: ['owner','config','market','position','mint','source','token_program','system_program'],
  claim: ['owner','config','market','position','mint','destination','mint_authority','token_program'],
} as const;
const pda = (program: PublicKey, ...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, program)[0];
function u64(value: bigint | undefined): Buffer {
  if (value === undefined || value < 0n || value > 0xffffffffffffffffn) throw new Error('Invalid u64');
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes;
}
/** Low-level constructor. Caller MUST independently validate session ownership, market,
 * sequence, token account, balance and finalized state by RPC before calling it. */
export function buildIdlPlotInstruction(idl: PlotIdl, program: PublicKey, input: VettedPlotOperation): TransactionInstruction {
  if (idl.address !== program.toBase58()) throw new Error('IDL program mismatch');
  const matches = idl.instructions.filter(i => i.name === input.operation);
  if (matches.length !== 1) throw new Error('Missing or ambiguous IDL instruction');
  const ix = matches[0];
  const sponsoredRent = input.operation === 'place_prediction' && ix.accounts[1]?.name === 'payer';
  const names = sponsoredRent ? ['owner','payer','config','market','position','mint','source','token_program','system_program'] : expected[input.operation];
  const discriminator = createHash('sha256').update(`global:${input.operation}`).digest().subarray(0,8);
  const writable = input.operation === 'place_prediction' ? new Set([sponsoredRent ? 'payer' : 'owner','market','position','mint','source']) : new Set(['position','mint','destination']);
  if (ix.discriminator.length !== 8 || !Buffer.from(ix.discriminator).equals(discriminator) || ix.accounts.map(a => a.name).join(',') !== names.join(',') || ix.accounts.some(a => !!a.signer !== (a.name === 'owner' || (sponsoredRent && a.name === 'payer')) || !!a.writable !== writable.has(a.name))) throw new Error('Unsupported IDL layout');
  const expectedArgs = input.operation === 'claim' ? [] : ['option:u8','amount:u64','sequence:u64'];
  if (ix.args.map(a => `${a.name}:${a.type}`).join(',') !== expectedArgs.join(',')) throw new Error('Unsupported IDL arguments');
  if (input.marketIdentity.length !== 32) throw new Error('Invalid market identity');
  // Current contract charges owner for position creation, incompatible with zero SOL.
  if (!input.existingPosition && input.operation === 'claim') throw new Error('Position does not exist');
  if (!input.existingPosition && input.operation === 'place_prediction' && !sponsoredRent) throw new Error('Position creation requires owner rent; sponsor payer is not in this IDL');
  if (sponsoredRent && (!input.payer || input.payer.equals(input.owner))) throw new Error('Distinct sponsor payer required');
  const config = pda(program, Buffer.from('config'));
  const market = pda(program, Buffer.from('market'), config.toBuffer(), Buffer.from(input.marketIdentity));
  const position = pda(program, Buffer.from('position'), market.toBuffer(), input.owner.toBuffer());
  const ata = pda(ASSOCIATED_TOKEN, input.owner.toBuffer(), TOKEN_2022.toBuffer(), input.mint.toBuffer());
  const accounts: Record<string, PublicKey> = {owner:input.owner, ...(input.payer ? {payer: input.payer} : {}), config, market, position, mint:input.mint, source:ata, destination:ata, mint_authority:pda(program,Buffer.from('mint_authority')),token_program:TOKEN_2022,system_program:SystemProgram.programId};
  let data = Buffer.from(ix.discriminator);
  if (input.operation === 'place_prediction') {
    if (!Number.isInteger(input.option) || input.option! < 0 || input.option! > 255 || input.amount === 0n) throw new Error('Invalid prediction');
    data = Buffer.concat([data,Buffer.from([input.option!]),u64(input.amount),u64(input.sequence)]);
  }
  return new TransactionInstruction({programId:program,keys:ix.accounts.map(a => ({pubkey:accounts[a.name],isSigner:!!a.signer,isWritable:!!a.writable})),data});
}
