import {test,expect} from '@playwright/test';
import {SystemInstruction,SystemProgram,Transaction,PublicKey} from '@solana/web3.js';
import {signIn} from './fixtures/phantom.js';
import {usdcAccount,TOKEN_PROGRAM} from '../src/funding-transfer.js';
import {USDC_DEVNET} from '../src/funding-model.js';
// Live PVE: genuine test-wallet authentication and actual RPC-built transactions.
// The injected wallet inspects and rejects the payment prompt, never signs or sends funds.
test.skip(process.env.PVE_FUNDING_SMOKE!=='true','Explicit live PVE devnet payment-prompt check');
const treasury='bEsfmEAaTA98rLftyi2jZ4XAzCBbqBvrJPKNW6rYJgp';
for(const currency of ['USDC','SOL'])test(`live PVE buy opens the Phantom payment request in ${currency}`,async({page,request})=>{
  const config=await(await request.get('/api/funding/config')).json();expect(config.enabled).toBe(true);expect(config.network).toBe('devnet');expect(config.treasury).toBe(treasury);
  const wallet=await signIn(page);let signingCalls=0;
  await page.exposeBinding('__inspectPayment',(_source,raw:number[])=>{
    signingCalls++;const tx=Transaction.from(Buffer.from(raw));expect(tx.feePayer?.toBase58()).toBe(wallet.address);
    if(currency==='SOL'){
      const transfer=SystemInstruction.decodeTransfer(tx.instructions.find(ix=>ix.programId.equals(SystemProgram.programId))!);expect(transfer.fromPubkey.toBase58()).toBe(wallet.address);expect(transfer.toPubkey.toBase58()).toBe(treasury);expect(transfer.lamports>0n).toBe(true);
    }else{
      const transfer=tx.instructions.find(ix=>ix.programId.equals(TOKEN_PROGRAM))!;expect(transfer).toBeTruthy();expect(transfer.keys[2].pubkey.toBase58()).toBe(usdcAccount(new PublicKey(treasury),new PublicKey(USDC_DEVNET)).toBase58());expect(transfer.data.readBigUInt64LE(1)).toBe(1_000_000n);
    }
  });
  await page.evaluate(()=>{const w=window as unknown as {__inspectPayment:(raw:number[])=>Promise<void>;phantom:{solana:{signTransaction:(tx:{serialize(options:unknown):Uint8Array})=>Promise<never>}}};w.phantom.solana.signTransaction=async tx=>{await w.__inspectPayment(Array.from(tx.serialize({requireAllSignatures:false,verifySignatures:false})));throw Object.assign(new Error('Payment cancelled by live smoke test'),{code:4001});};});
  const submitted:string[]=[];page.on('request',r=>{if(r.url().endsWith('/api/funding/submit'))submitted.push(r.url());});
  await page.getByRole('button',{name:'Saldo',exact:true}).click();await page.getByRole('radio',{name:'1.000 puntos 1 USDC',exact:true}).check();await page.getByRole('radio',{name:currency,exact:true}).check();
  await page.getByRole('button',{name:'Comprar con Phantom',exact:true}).click();
  await expect(page.locator('.funding-error')).toContainText('Cancelaste la operación en Phantom.');expect(signingCalls).toBe(1);expect(submitted).toEqual([]);await expect(page.locator('#own-balance')).toContainText('10.000');
  await page.setViewportSize({width:360,height:600});await page.locator('.funding-error').scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/pve-buy-${currency}.png`});
});
