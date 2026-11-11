/** Integer-point settlement policy. Each 2% share rounds down; winners retain the remainder. */
export type PointFees={version:1;pool:number;streamer:number;platform:number;winners:number};
export function pointFees(pool:number):PointFees{
 if(!Number.isSafeInteger(pool)||pool<0)throw new Error('Pozo de puntos inválido');
 const share=Number(BigInt(pool)*2n/100n);
 return {version:1,pool,streamer:share,platform:share,winners:pool-share*2};
}
