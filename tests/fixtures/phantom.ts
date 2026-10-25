import {generateKeyPairSync,sign} from 'node:crypto';
import {getAddressDecoder} from '@solana/kit';
import type {Page,BrowserContext} from '@playwright/test';
export function testWallet(){const pair=generateKeyPairSync('ed25519');const key=pair.publicKey.export({format:'der',type:'spki'});return {address:getAddressDecoder().decode(key.subarray(-32)),sign:(message:number[])=>Array.from(sign(null,Buffer.from(message),pair.privateKey))};}
export async function phantomProvider(target:Page|BrowserContext,wallet=testWallet(),cancel=false){
  await target.exposeBinding('__fixtureSign',(_source,message:number[])=>wallet.sign(message));
  await target.addInitScript(({address,cancel})=>{
    const windowWithWallet=window as unknown as {phantom:unknown;__fixtureSign(message:number[]):Promise<number[]>};
    windowWithWallet.phantom={solana:{isPhantom:true,connect:async()=>{if(cancel)throw Object.assign(new Error('Rejected'),{code:4001});return {publicKey:{toString:()=>address}};},signMessage:async(message:Uint8Array)=>({signature:new Uint8Array(await windowWithWallet.__fixtureSign(Array.from(message))),publicKey:{toString:()=>address}})}};
  },{address:wallet.address,cancel});return wallet;
}
export async function signIn(page:Page){const wallet=await phantomProvider(page);await page.goto('/onboarding');await page.getByRole('button',{name:'Conectar Phantom',exact:true}).click();await page.waitForURL('**/#markets');return wallet;}
