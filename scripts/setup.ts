import { mkdir, writeFile, access } from 'node:fs/promises';
import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { randomBytes } from 'node:crypto';
await mkdir('data', { recursive: true, mode: 0o700 });
try { await access('data/wallet.json'); } catch {
  await writeFile('data/wallet.json', JSON.stringify([...Keypair.generate().secretKey]), { mode: 0o600 });
}
try { await access('data/bridge-token'); } catch {
  await writeFile('data/bridge-token', randomBytes(32).toString('hex'), { mode: 0o600 });
}
const { readFile } = await import('node:fs/promises');
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile('data/wallet.json', 'utf8'))));
const rpc = new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed');
console.log('Wallet pública de prueba:', wallet.publicKey.toBase58());
const balance = await rpc.getBalance(wallet.publicKey);
console.log('Balance SOL:', balance / LAMPORTS_PER_SOL);
if (balance < 100_000_000) {
  const signature = await rpc.requestAirdrop(wallet.publicKey, LAMPORTS_PER_SOL);
  const latest = await rpc.getLatestBlockhash();
  await rpc.confirmTransaction({ signature, ...latest }, 'confirmed');
  console.log('Airdrop confirmado:', signature);
}
