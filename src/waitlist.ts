import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {z} from 'zod';

const emailSchema=z.string().trim().max(254).email().transform(email=>email.toLowerCase());
const entrySchema=z.object({email:emailSchema,createdAt:z.string().datetime()});
type Entry=z.infer<typeof entrySchema>;

// Like the existing points store, this local service has one process writer.
export class Waitlist{
  private entries=new Map<string,Entry>();
  private pending:Promise<void>=Promise.resolve();
  constructor(private readonly directory:string){}
  async load(){
    await mkdir(this.directory,{recursive:true,mode:0o700});
    try{const entries=z.array(entrySchema).parse(JSON.parse(await readFile(`${this.directory}/waitlist.json`,'utf8')));this.entries=new Map(entries.map(entry=>[entry.email,entry]));}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  join(input:unknown):Promise<void>{
    const email=emailSchema.parse(input);
    const operation=this.pending.then(async()=>{
      if(this.entries.has(email))return;
      const entry={email,createdAt:new Date().toISOString()};
      const file=`${this.directory}/waitlist.json`;
      await writeFile(`${file}.tmp`,JSON.stringify([...this.entries.values(),entry],null,2),{mode:0o600});
      await rename(`${file}.tmp`,file);
      this.entries.set(email,entry);
    });
    this.pending=operation.catch(()=>{});
    return operation;
  }
}
