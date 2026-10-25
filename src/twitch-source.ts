import { TWITCH_CLIENT_ID, TWITCH_QUERY, closesAt, type Prediction } from './prediction.js';
import { parseTwitchPrediction } from './extension-model.js';
import type { Points } from './points.js';
const fields='id title status createdAt predictionWindowSeconds lockedAt endedAt winningOutcome {id} channel {name} outcomes {id title color totalPoints totalUsers}';
export class TwitchSource {
  private requests=new Map<string,{at:number;task:Promise<Prediction>}>();
  private syncing?:Promise<void>;
  lastError:string|null=null;
  constructor(readonly points:Points) {}
  private async gql(query:string,variables:Record<string,string>) {
    const response=await fetch('https://gql.twitch.tv/gql',{method:'POST',headers:{'Client-ID':TWITCH_CLIENT_ID,'Content-Type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error(`Twitch HTTP ${response.status}`);
    const json=await response.json();if(json.errors)throw new Error(json.errors.map((e:{message:string})=>e.message).join('; '));return json.data;
  }
  prediction(id:string,channel:string):Promise<Prediction> {
    const key=`${channel}:${id}`;const cached=this.requests.get(key);if(cached&&Date.now()-cached.at<2000)return cached.task;
    const task=(async()=>{
      const data=await this.gql(`query SourcePrediction($id:ID!) { predictionEvent(id:$id) { ${fields} } }`,{id});
      if(!data?.predictionEvent||data.predictionEvent.channel?.name?.toLowerCase()!==channel.toLowerCase())throw new Error('Twitch no confirmó esta predicción para el canal');
      return parseTwitchPrediction(data.predictionEvent,channel);
    })();
    this.requests.set(key,{at:Date.now(),task});
    if(this.requests.size>500)for(const [key,value] of this.requests)if(Date.now()-value.at>2000)this.requests.delete(key);
    void task.catch(()=>this.requests.delete(key));return task;
  }
  sync() {
    if(this.syncing)return this.syncing;
    this.syncing=this.refresh().finally(()=>{this.syncing=undefined;});return this.syncing;
  }
  private async refresh() {
    const failures:string[]=[];
    for(const channel of this.points.channels()) {
      try {
        const data=await this.gql(TWITCH_QUERY,{channel});
        if(!Array.isArray(data?.channel?.activePredictionEvents))throw new Error('Canal sin respuesta válida');
        for(const raw of data.channel.activePredictionEvents) {
          const p=parseTwitchPrediction(raw,channel);
          if((p.status==='ACTIVE'&&closesAt(p)>Date.now())||this.points.markets().some(m=>m.prediction.id===p.id&&m.prediction.channel===channel))await this.points.accept(p);
        }
      }catch(e){failures.push(`${channel}: ${(e as Error).message}`);}
    }
    // Track saved IDs even after they disappear from activePredictionEvents or the extension closes.
    const pending=this.points.pendingSources();
    for(let i=0;i<pending.length;i+=4)await Promise.all(pending.slice(i,i+4).map(async p=>{
      try {await this.points.accept(await this.prediction(p.id,p.channel));}catch(e){failures.push(`${p.channel}: ${(e as Error).message}`);}
    }));
    this.lastError=failures.length?failures.join('; '):null;
  }
}
