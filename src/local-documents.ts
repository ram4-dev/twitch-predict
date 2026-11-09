import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';

/** Atomic single-process storage for the local bot; Points keeps its existing owner. */
export class LocalDocuments {
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private directory:string){}
 private path(name:string){if(!/^twitch-bot-(auth|runtime)$/.test(name))throw new Error('Invalid local bot document');return join(this.directory,`${name}.json`);}
 async read<T>(name:string,initial:()=>T):Promise<T>{
  try{return JSON.parse(await readFile(this.path(name),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return initial();}
 }
 update<T,R>(name:string,initial:()=>T,work:(state:T)=>R|Promise<R>):Promise<{state:T;result:R}>{
  const task=this.queue.then(async()=>{
   const state=await this.read(name,initial),result=await work(state),file=this.path(name);
   await mkdir(this.directory,{recursive:true,mode:0o700});
   await writeFile(`${file}.tmp`,JSON.stringify(state),{mode:0o600});await rename(`${file}.tmp`,file);
   return {state,result};
  });
  this.queue=task.catch(()=>undefined);return task;
 }
}
