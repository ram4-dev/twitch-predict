const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const anchor = require('@coral-xyz/anchor');
const web3 = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const BN = anchor.BN;
const root = path.resolve(__dirname, '..');
const idl = JSON.parse(readFileSync(path.join(root, 'target/idl/plot.json')));
const programId = new web3.PublicKey(idl.address);
const admin = web3.Keypair.generate();
const alice = web3.Keypair.generate();
const bob = web3.Keypair.generate();
const streamer = web3.Keypair.generate();
const mint = web3.Keypair.generate();
const pda = (...seeds) => web3.PublicKey.findProgramAddressSync(seeds, programId)[0];
const config = pda(Buffer.from('config'));
const mintAuthority = pda(Buffer.from('mint_authority'));
const systemProgram = web3.SystemProgram.programId;
const tokenProgram = spl.TOKEN_2022_PROGRAM_ID;
const bytes = n => Array(32).fill(n);
const ledger = mkdtempSync(path.join(tmpdir(), 'plot-validator-'));
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
async function main() {
  const port = await freePort();
  let faucet; do { faucet = await freePort(); } while (Math.abs(faucet - port) <= 1);
  const validator = spawn('solana-test-validator', ['--ledger', ledger, '--rpc-port', String(port), '--faucet-port', String(faucet), '--upgradeable-program', programId.toBase58(), path.join(root, 'onchain/target/deploy/plot.so'), admin.publicKey.toBase58(), '--quiet'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let logs = ''; validator.stderr.on('data', c => { logs += c; });
  let connection;
  try {
    connection = new web3.Connection(`http://127.0.0.1:${port}`, 'confirmed');
    let ready = false;
    for (let i = 0; i < 120; i++) { if (validator.exitCode !== null) throw Error(`validator exited: ${logs}`); try { await connection.getLatestBlockhash(); ready = true; break; } catch { await new Promise(r => setTimeout(r, 500)); } }
    if (!ready) throw Error(`validator unavailable: ${logs}`);
    for (const k of [admin, bob]) { const sig = await connection.requestAirdrop(k.publicKey, 2 * web3.LAMPORTS_PER_SOL); await connection.confirmTransaction(sig, 'confirmed'); }
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), { commitment: 'confirmed' });
    const program = new anchor.Program(idl, provider);
    const [programData] = web3.PublicKey.findProgramAddressSync([programId.toBuffer()], new web3.PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'));
    await program.methods.initializeConfig(admin.publicKey, admin.publicKey, admin.publicKey, 200, 200).accountsStrict({admin: admin.publicKey, program: programId, programData, config, systemProgram}).rpc();
    await program.methods.initializeMint(0).accountsStrict({admin: admin.publicKey, config, mint: mint.publicKey, mintAuthority, tokenProgram, systemProgram}).signers([mint]).rpc();
    const mintInfo = await spl.getMint(connection, mint.publicKey, 'confirmed', tokenProgram);
    assert.ok(spl.getNonTransferable(mintInfo)); assert.equal(mintInfo.mintAuthority.toBase58(), mintAuthority.toBase58());
    const ata = async owner => (await spl.getOrCreateAssociatedTokenAccount(connection, admin, mint.publicKey, owner, false, 'confirmed', undefined, tokenProgram)).address;
    const a = await ata(alice.publicKey), b = await ata(bob.publicKey), t = await ata(admin.publicKey), st = await ata(streamer.publicKey);
    const receipt = n => pda(Buffer.from('payment'), config.toBuffer(), Buffer.from(bytes(n)));
    const credit = (owner, destination, n, amount) => program.methods.creditPoints(bytes(n), new BN(amount)).accountsStrict({paymentAuthority: admin.publicKey, config, mint: mint.publicKey, owner, destination, mintAuthority, receipt: receipt(n), tokenProgram, systemProgram}).rpc();
    await credit(alice.publicKey, a, 1, 600); await credit(bob.publicKey, b, 2, 400); await credit(alice.publicKey, a, 1, 600);
    await assert.rejects(credit(alice.publicKey, a, 1, 601));
    await assert.rejects(spl.transfer(connection, admin, a, b, alice, 1, [], undefined, tokenProgram));
    const now = (await connection.getBlockTime(await connection.getSlot('confirmed')));
    const identity = bytes(3), market = pda(Buffer.from('market'), config.toBuffer(), Buffer.from(identity));
    await program.methods.createMarket(identity, [bytes(10), bytes(11)], new BN(now + 8), new BN(now + 60), streamer.publicKey).accountsStrict({operator: admin.publicKey, config, market, systemProgram}).rpc();
    const pos = owner => pda(Buffer.from('position'), market.toBuffer(), owner.toBuffer());
    const bet = (user, source, option, amount, seq) => program.methods.placePrediction(option, new BN(amount), new BN(seq)).accountsStrict({owner: user.publicKey, payer: admin.publicKey, config, market, position: pos(user.publicKey), mint: mint.publicKey, source, tokenProgram, systemProgram}).signers([user]).rpc();
    await assert.rejects(bet(bob, b, 1, 401, 0));
    assert.equal(await connection.getAccountInfo(pos(bob.publicKey)), null);
    await assert.rejects(program.methods.cancelMarket().accountsStrict({actor: bob.publicKey, config, market}).signers([bob]).rpc());
    assert.equal(await connection.getBalance(alice.publicKey), 0); await bet(alice, a, 0, 400, 0); assert.equal(await connection.getBalance(alice.publicKey), 0); await assert.rejects(bet(alice, a, 0, 400, 0)); await assert.rejects(bet(alice, a, 1, 200, 1)); await bet(alice, a, 0, 200, 1); await bet(bob, b, 1, 400, 0);
    await program.methods.lockMarket().accountsStrict({actor: admin.publicKey, config, market}).rpc();
    const resolve = () => program.methods.resolveMarket(0).accountsStrict({resolver: admin.publicKey, config, market, mint: mint.publicKey, treasury: admin.publicKey, streamer: streamer.publicKey, treasuryAta: t, streamerAta: st, mintAuthority, tokenProgram}).rpc();
    await assert.rejects(resolve());
    while ((await connection.getBlockTime(await connection.getSlot('confirmed'))) < now + 8) await new Promise(r => setTimeout(r, 500));
    await assert.rejects(program.methods.resolveMarket(0).accountsStrict({resolver: admin.publicKey, config, market, mint: mint.publicKey, treasury: admin.publicKey, streamer: streamer.publicKey, treasuryAta: t, streamerAta: t, mintAuthority, tokenProgram}).rpc());
    assert.equal((await spl.getAccount(connection, t, 'confirmed', tokenProgram)).amount, 0n);
    assert.equal((await program.account.market.fetch(market)).state, 1);
    await resolve(); await assert.rejects(resolve());
    const claim = user => program.methods.claim().accountsStrict({owner: user.publicKey, config, market, position: pos(user.publicKey), mint: mint.publicKey, destination: user === alice ? a : b, mintAuthority, tokenProgram}).signers([user]).rpc();
    await claim(alice); await assert.rejects(claim(alice)); await claim(bob);
    const balance = async address => (await spl.getAccount(connection, address, 'confirmed', tokenProgram)).amount;
    assert.equal(await balance(a), 960n); assert.equal(await balance(b), 0n); assert.equal(await balance(t), 20n); assert.equal(await balance(st), 20n);
    await credit(alice.publicKey, a, 4, 600); await credit(bob.publicKey, b, 5, 400);
    const identity2 = bytes(6), market2 = pda(Buffer.from('market'), config.toBuffer(), Buffer.from(identity2));
    const now2 = await connection.getBlockTime(await connection.getSlot('confirmed'));
    await program.methods.createMarket(identity2, [bytes(10), bytes(11)], new BN(now2 + 60), new BN(now2 + 120), streamer.publicKey).accountsStrict({operator: admin.publicKey, config, market: market2, systemProgram}).rpc();
    const pos2 = owner => pda(Buffer.from('position'), market2.toBuffer(), owner.toBuffer());
    for (const [user, source, option, amount] of [[alice, a, 0, 600], [bob, b, 1, 400]]) {
      await program.methods.placePrediction(option, new BN(amount), new BN(0)).accountsStrict({owner: user.publicKey, payer: admin.publicKey, config, market: market2, position: pos2(user.publicKey), mint: mint.publicKey, source, tokenProgram, systemProgram}).signers([user]).rpc();
    }
    await program.methods.cancelMarket().accountsStrict({actor: admin.publicKey, config, market: market2}).rpc();
    for (const [user, destination] of [[alice, a], [bob, b]]) {
      await program.methods.claim().accountsStrict({owner: user.publicKey, config, market: market2, position: pos2(user.publicKey), mint: mint.publicKey, destination, mintAuthority, tokenProgram}).signers([user]).rpc();
    }
    assert.equal(await balance(a), 1560n); assert.equal(await balance(b), 400n); assert.equal(await balance(t), 20n); assert.equal(await balance(st), 20n);
    assert.equal(await connection.getBalance(alice.publicKey), 0);
    const identity3 = bytes(7), market3 = pda(Buffer.from('market'), config.toBuffer(), Buffer.from(identity3));
    const now3 = await connection.getBlockTime(await connection.getSlot('confirmed'));
    await program.methods.createMarket(identity3, [10,11,12,13,14,15].map(bytes), new BN(now3 + 5), new BN(now3 + 60), streamer.publicKey).accountsStrict({operator: admin.publicKey, config, market: market3, systemProgram}).rpc();
    const position3 = pda(Buffer.from('position'), market3.toBuffer(), alice.publicKey.toBuffer());
    await program.methods.placePrediction(0, new BN(1), new BN(0)).accountsStrict({owner: alice.publicKey, payer: admin.publicKey, config, market: market3, position: position3, mint: mint.publicKey, source: a, tokenProgram, systemProgram}).signers([alice]).rpc();
    await program.methods.lockMarket().accountsStrict({actor: admin.publicKey, config, market: market3}).rpc();
    while ((await connection.getBlockTime(await connection.getSlot('confirmed'))) < now3 + 5) await new Promise(r => setTimeout(r, 500));
    await program.methods.resolveMarket(5).accountsStrict({resolver: admin.publicKey, config, market: market3, mint: mint.publicKey, treasury: admin.publicKey, streamer: streamer.publicKey, treasuryAta: t, streamerAta: st, mintAuthority, tokenProgram}).rpc();
    await program.methods.claim().accountsStrict({owner: alice.publicKey, config, market: market3, position: position3, mint: mint.publicKey, destination: a, mintAuthority, tokenProgram}).signers([alice]).rpc();
    assert.equal(await balance(a), 1560n);
    console.log('PASS: Token-2022, idempotent credit, zero-SOL sponsor, rollback, resolution, fees, cancellation and zero-winner refund');
  } finally { if (connection) connection._rpcWebSocket.close(); if (validator.exitCode === null && validator.signalCode === null) { validator.kill('SIGTERM'); await new Promise(resolve => validator.once('exit', resolve)); } rmSync(ledger, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
