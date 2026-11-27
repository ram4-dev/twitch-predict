/** Implementations must inspect the authoritative PaymentReceipt and verify every field. */
export interface CreditReceipt { key:string; wallet:string; amount:string; signature:string|null; finalized:boolean; }
export interface PlotChain {
 findPaymentReceipt(key:string):Promise<CreditReceipt|null>;
 /** Must use the same receipt key on every retry; the chain enforces uniqueness. */
 submitCredit(input:{key:string;wallet:string;amount:string}):Promise<string>;
}
export function verifyReceipt(receipt:CreditReceipt,expected:{key:string;wallet:string;amount:string}) {
 if(receipt.key!==expected.key||receipt.wallet!==expected.wallet||receipt.amount!==expected.amount)throw new Error('PaymentReceipt mismatch');
 return receipt;
}
