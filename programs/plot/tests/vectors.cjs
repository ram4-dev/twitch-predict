// SHA-256 domain followed by UTF-8 strings with u32 little-endian byte lengths.
const crypto = require('node:crypto');
const { PublicKey } = require('@solana/web3.js');
const idl = require('../idl/plot.json');
const program = new PublicKey(idl.address);
function hash(domain, parts) {
  const h = crypto.createHash('sha256').update(Buffer.from(domain, 'utf8'));
  for (const part of parts) { const b = Buffer.from(part, 'utf8'), n = Buffer.alloc(4); n.writeUInt32LE(b.length); h.update(n).update(b); }
  return h.digest();
}
const marketHash = hash('plot:market:v1', ['twitch', 'channel-123', 'prediction-456']);
const paymentHash = hash('plot:payment:v1', ['example-provider', 'test', 'payment-789']);
const outcomeHash = hash('plot:outcome:v1', ['channel-123', 'prediction-456', 'outcome-1']);
const find = (...seeds) => { const [key, bump] = PublicKey.findProgramAddressSync(seeds, program); return { address: key.toBase58(), bump }; };
const config = find(Buffer.from('config'));
const market = find(Buffer.from('market'), new PublicKey(config.address).toBuffer(), marketHash);
const owner = new PublicKey('11111111111111111111111111111111');
const output = { program: program.toBase58(), marketHash: marketHash.toString('hex'), paymentHash: paymentHash.toString('hex'), outcomeHash: outcomeHash.toString('hex'), config, mintAuthority: find(Buffer.from('mint_authority')), market, position: find(Buffer.from('position'), new PublicKey(market.address).toBuffer(), owner.toBuffer()), receipt: find(Buffer.from('payment'), new PublicKey(config.address).toBuffer(), paymentHash), owner: owner.toBase58() };
console.log(JSON.stringify(output, null, 2));
