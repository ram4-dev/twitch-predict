import {readFileSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {Pool,type PoolClient} from 'pg';

/** Private SQL aggregates. Every update locks the current committed row; no file or process lock is authoritative. */
export class Documents {
 readonly pool:Pool;
 private fence=new AsyncLocalStorage<{name:string;owner:string}>();
 withLease<T>(name:string,owner:string,work:()=>Promise<T>){return this.fence.run({name,owner},work);}
 private context=new AsyncLocalStorage<PoolClient>();
 constructor(url:string,readonly namespace='plot'){
  const parsed=new URL(url);if(!['postgres:','postgresql:'].includes(parsed.protocol))throw new Error('DATABASE_URL inválida');
  this.pool=new Pool({connectionString:url,max:5,connectionTimeoutMillis:15000,idleTimeoutMillis:30000,application_name:'plot-'+namespace});
  // pg emits pool errors outside request promises. Report no connection strings or upstream bodies.
  this.pool.on('error',()=>console.error('Database pool connection interrupted'));
 }
 async migrate(){await this.transaction(async client=>{await client.query("SELECT pg_advisory_xact_lock(173918, 1)");await client.query(readFileSync('migrations/001-cloud.sql','utf8'));});}
 private async transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T>{
  const inherited=this.context.getStore();if(inherited)return work(inherited);
  const client=await this.pool.connect();
  try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout = '10s'");await client.query("SET LOCAL statement_timeout = '20s'");const result=await this.context.run(client,()=>work(client));await client.query('COMMIT');return result;}
  catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
 }
 async read<T>(name:string,initial:()=>T):Promise<T>{
  const client=this.context.getStore()??this.pool;
  const result=await client.query('SELECT data FROM plot_private.documents WHERE namespace=$1 AND name=$2',[this.namespace,name]);
  return result.rows[0]?.data??initial();
 }
 async update<T,R>(name:string,initial:()=>T,work:(state:T)=>R|Promise<R>):Promise<{state:T;result:R}>{
  return this.transaction(async client=>{
   const fence=this.fence.getStore();
   if(fence){const lease=await client.query('SELECT owner FROM plot_private.leases WHERE namespace=$1 AND name=$2 AND owner=$3 AND expires_at>clock_timestamp() FOR SHARE',[this.namespace,fence.name,fence.owner]);if(!lease.rowCount)throw new Error('Worker lease lost');}
   await client.query('INSERT INTO plot_private.documents(namespace,name,data) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[this.namespace,name,JSON.stringify(initial())]);
   const {rows}=await client.query('SELECT data FROM plot_private.documents WHERE namespace=$1 AND name=$2 FOR UPDATE',[this.namespace,name]);
   const state=rows[0].data as T,before=JSON.stringify(state),result=await work(state);
   await client.query('UPDATE plot_private.documents SET data=$3::jsonb, revision=revision+1, updated_at=now() WHERE namespace=$1 AND name=$2',[this.namespace,name,JSON.stringify(state)]);
   if((name==='byte'||name==='byte-twitch')&&before!==JSON.stringify(state))await client.query("SELECT pg_notify('plot_market_events', $1)",[JSON.stringify({namespace:this.namespace,name})]);
   return {state,result};
  });
 }
 async notifyMarketChange(){await this.pool.query("SELECT pg_notify('plot_market_events', $1)",[JSON.stringify({namespace:this.namespace,name:'byte'})]);}
 async allowRequest(name:string,limit:number){
  const result=await this.pool.query(`INSERT INTO plot_private.request_limits(namespace,name,window_start,requests) VALUES($1,$2,date_trunc('minute',now()),1)
   ON CONFLICT(namespace,name) DO UPDATE SET window_start=excluded.window_start,requests=CASE WHEN plot_private.request_limits.window_start=excluded.window_start THEN plot_private.request_limits.requests+1 ELSE 1 END
   RETURNING requests`,[this.namespace,name]);return result.rows[0].requests<=limit;
 }
 async lease(name:string,owner:string,seconds=30):Promise<boolean>{
  const result=await this.pool.query(`INSERT INTO plot_private.leases(namespace,name,owner,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second')
   ON CONFLICT(namespace,name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at,heartbeat=now()
   WHERE plot_private.leases.expires_at<now() OR plot_private.leases.owner=excluded.owner RETURNING owner`,[this.namespace,name,owner,seconds]);return !!result.rowCount;
 }
 async release(name:string,owner:string){await this.pool.query('DELETE FROM plot_private.leases WHERE namespace=$1 AND name=$2 AND owner=$3',[this.namespace,name,owner]);}
 async heartbeat(){const {rows}=await this.pool.query("SELECT heartbeat,expires_at>now() AS active FROM plot_private.leases WHERE namespace=$1 AND name='twitch-worker'",[this.namespace]);return rows[0]??null;}
 async close(){await this.pool.end();}
}
