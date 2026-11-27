import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {claimAvailable,predictionAvailable} from '../mobile/src/lib/plot-action-guards.js';
import type {PlotAccount} from '../mobile/src/lib/plot-account-client.js';
import type {PlotReadMarket} from '../mobile/src/lib/plot-read-client.js';
const account:PlotAccount={wallet:'w',balance:'600',readStatus:'finalized',positions:[{marketId:'m',optionId:'yes',optionIndex:0,sequence:'1',stake:'600',payout:'960',claimed:false,chainStatus:'resolved'}]};
const market:PlotReadMarket={id:'m',broadcasterId:'b',predictionId:'p',marketIdentity:'ab'.repeat(32),title:'Match',options:[{id:'yes',label:'Sí',optionIndex:0,stake:'600'},{id:'no',label:'No',optionIndex:1,stake:'400'}],twitchStatus:'open',winnerId:null,chainStatus:'open',streamerFee:null,treasuryFee:null,closesAt:'2030-01-01',timeoutAt:'2030-01-02'};
test('prediction requires both sources open, finalized balance, and verified options',()=>{assert.equal(predictionAvailable(account,market),true);assert.equal(predictionAvailable({...account,balance:null},market),false);assert.equal(predictionAvailable(account,{...market,twitchStatus:'locked'}),false);assert.equal(predictionAvailable(account,{...market,options:[{...market.options[0],stake:null}]}),false);});
test('claim requires consistent terminal chain state and known nonzero payout',()=>{const resolved={...market,chainStatus:'resolved' as const};assert.equal(claimAvailable(account,resolved),true);assert.equal(claimAvailable(account,market),false);assert.equal(claimAvailable({...account,readStatus:'confirming'},resolved),false);assert.equal(claimAvailable({...account,positions:[{...account.positions[0],payout:null}]},resolved),false);});
