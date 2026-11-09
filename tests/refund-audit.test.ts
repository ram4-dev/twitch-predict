import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Points} from '../src/points.js';
import {auditHistoricalRefunds} from '../src/refund-audit.js';
import {demoPrediction} from '../src/mirror.js';

async function fixture(work:(p:Points,dir:string)=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'refund-audit-'));
 try{const p=new Points(dir);await p.load();await work(p,dir);}finally{await rm(dir,{recursive:true,force:true});}
}

test('audit reports pending historical refunds without writing anything; repeated runs are stable',()=>fixture(async(p,dir)=>{
 const a=await p.createAccount(),b=await p.createAccount();
 const m=await p.accept(demoPrediction(),true);
 await p.bet(a.token,m.key,'victory',300,randomUUID());
 await p.bet(b.token,m.key,'defeat',700,randomUUID());
 // Simulate a historical cancellation processed by the old code: positions marked payable but never credited,
 // and no refund ledger entries (the old path left payout for a later manual claim).
 await p.demoResolve(m.key,null);
 const raw=JSON.parse(await readFile(`${dir}/points.json`,'utf8'));
 for(const bet of raw.bets){bet.claimed=false;bet.creditedAt=undefined;bet.creditMethod=undefined;bet.payout=bet.amount;}
 raw.ledger=raw.ledger.filter((l:{kind:string})=>l.kind!=='refund');
 await writeFile(`${dir}/points.json`,JSON.stringify(raw));
 const loaded=new Points(dir);await loaded.load();
 const report=auditHistoricalRefunds(loaded);
 assert.equal(report.pending.reduce((n,r)=>n+r.amount,0),1000);
 assert.equal(report.conflicts.length,0);
 // Dry-run: nothing changed on disk.
 const after=JSON.parse(await readFile(`${dir}/points.json`,'utf8'));
 assert.equal(after.bets.filter((b:{claimed:boolean})=>!b.claimed).length,2);
 const second=auditHistoricalRefunds(loaded);
 assert.deepEqual(second.pending.map((r:{betId:string})=>r.betId).sort(),report.pending.map((r:{betId:string})=>r.betId).sort());
}));

test('already credited and claimed positions are not reported; contradictions land in conflicts',()=>fixture(async(p,dir)=>{
 const a=await p.createAccount();
 const m=await p.accept(demoPrediction(),true);
 await p.bet(a.token,m.key,'victory',500,randomUUID());
 await p.demoResolve(m.key,null);
 const raw=JSON.parse(await readFile(`${dir}/points.json`,'utf8'));
 raw.bets[0].claimed=true;raw.bets[0].creditMethod='refund';raw.bets[0].creditedAt=new Date().toISOString();
 await writeFile(`${dir}/points.json`,JSON.stringify(raw));
 const loaded=new Points(dir);await loaded.load();
 assert.equal(auditHistoricalRefunds(loaded).pending.length,0);
 // Contradiction: marked refunded but never entered into the ledger.
 const raw2=JSON.parse(await readFile(`${dir}/points.json`,'utf8'));
 raw2.ledger=raw2.ledger.filter((l:{kind:string})=>l.kind!=='refund');
 await writeFile(`${dir}/points.json`,JSON.stringify(raw2));
 const loaded2=new Points(dir);await loaded2.load();
 const report=auditHistoricalRefunds(loaded2);
 assert.equal(report.pending.length,0);assert.equal(report.conflicts.length,1);
}));
test('ordinary resolved markets, paid history, aggregate refunds and partial credits are classified correctly',()=>fixture(async(p,dir)=>{
 const a=await p.createAccount(),b=await p.createAccount(),c=await p.createAccount();
 // Ordinary resolved market with a winner and a loser: neither is a refund debt.
 const m1=await p.accept(demoPrediction(),true);
 await p.bet(a.token,m1.key,'victory',300,randomUUID());
 await p.bet(b.token,m1.key,'defeat',700,randomUUID());
 await p.demoResolve(m1.key,'victory');
 // Legacy cancellation paid historically via claim.
 const m2=await p.accept(demoPrediction(),true);
 await p.bet(a.token,m2.key,'victory',200,randomUUID());
 await p.demoResolve(m2.key,null);
 // Current automatic refund: two 100 bets produce ONE aggregated 200 credit.
 const m3=await p.accept(demoPrediction(),true);
 await p.bet(b.token,m3.key,'victory',100,randomUUID());
 await p.bet(c.token,m3.key,'victory',100,randomUUID());
 await p.demoResolve(m3.key,null);
 // Rewrite m1/m2 to the legacy uncredited shape to exercise classification.
 const raw=JSON.parse(await readFile(`${dir}/points.json`,'utf8'));
 for(const bet of raw.bets){if(bet.marketKey===m2.key){bet.claimed=false;bet.creditMethod=undefined;bet.creditedAt=undefined;bet.payout=bet.amount;}}
 raw.ledger=raw.ledger.filter((l:{kind:string;marketKey:string})=>!(l.kind==='refund'&&l.marketKey===m2.key));
 await writeFile(`${dir}/points.json`,JSON.stringify(raw));
 const loaded=new Points(dir);await loaded.load();
 const report=auditHistoricalRefunds(loaded);
 const byMarket=(key:string)=>report.pending.filter(r=>r.marketKey===key).reduce((n,r)=>n+r.pending,0);
 // Ordinary resolved market: no debts.
 assert.equal(byMarket(m1.key),0);
 // Legacy cancellation paid by claim was rewritten to uncredited: pending debt 200.
 assert.equal(byMarket(m2.key),200);
 // Automatic refund with aggregated 200 credit covers both 100 positions: no debts, no conflicts.
 assert.equal(byMarket(m3.key),0);
 const conflicting=report.conflicts.filter(r=>r.marketKey===m3.key).length;
 assert.equal(conflicting,0);
 assert.equal(report.pending.length,1);
 // Partial credit scenario: one 100 refunded for a two-bet cancellation → ambiguity, not a guess.
 const raw2=JSON.parse(await readFile(`${dir}/points.json`,'utf8'));
 raw2.ledger=raw2.ledger.filter((l:{kind:string;marketKey:string})=>!(l.kind==='refund'&&l.marketKey===m3.key));
 raw2.ledger.push({id:randomUUID(),accountId:raw2.bets.find((x:{marketKey:string})=>x.marketKey===m3.key)!.accountId,kind:'refund',delta:100,balance:0,marketKey:m3.key,createdAt:new Date().toISOString()});
 await writeFile(`${dir}/points.json`,JSON.stringify(raw2));
 const loaded2=new Points(dir);await loaded2.load();
 const report2=auditHistoricalRefunds(loaded2);
 assert.equal(report2.pending.filter(r=>r.marketKey===m3.key).length,0);
 assert.equal(report2.conflicts.filter(r=>r.marketKey===m3.key).length,1);
}));
