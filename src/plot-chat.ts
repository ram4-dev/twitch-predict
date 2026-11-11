import {z} from 'zod';

/** Expected command failures whose message is safe to publish in chat. */
export class PlotCommandError extends Error {}

export type PlotCommand={kind:'create';title:string;options:string[]}
 |{kind:'lock'|'cancel';id?:string}
 |{kind:'resolve';id?:string;option:number}
 |{kind:'list'}
 |{kind:'bet';id?:string;option:number};

export const plotChatHelp='Crear o proponer: !plot crear Pregunta, Sí, No · Listar: !plot mercados · Apostar: !plot apostar M7K2, 1 · Cerrar: !plot cerrar M7K2 · Resolver: !plot resolver M7K2, 1 · Cancelar: !plot cancelar M7K2 (usá "comillas" si el texto tiene comas). Comisión del pozo: 2% streamer + 2% Plot; sin comisión al reembolsar.';

/** Splits on commas or pipes outside double quotes; a quoted field keeps its separators. */
function fields(argument:string):string[] {
 const parts:string[]=[];let current='';let quoted=false;
 for(const ch of argument){
  if(ch==='"'){quoted=!quoted;continue;}
  if((ch===','||ch==='|')&&!quoted){parts.push(current.trim());current='';continue;}
  current+=ch;
 }
 if(quoted)throw new PlotCommandError('Comillas sin cerrar: encerrá entre comillas dobles el texto que contiene comas.');
 parts.push(current.trim());
 return parts;
}
const marketCode=(raw:string|undefined)=>{const t=(raw??'').trim().toUpperCase();return /^[A-Z0-9]{2,8}$/.test(t)?t:undefined;};
const optionNumber=(raw:string|undefined)=>{const n=Number((raw??'').trim());return Number.isInteger(n)&&n>=1&&n<=6?n:undefined;};

export function parsePlotCommand(text:string):PlotCommand|undefined{
 const match=/^!plot\s+(crear|mercados|apostar|cerrar|resolver|cancelar)(?:\s+([\s\S]*))?$/i.exec(text.trim());
 if(!match)return undefined;
 const argument=match[2]?.trim()??'';
 switch(match[1].toLowerCase()){
  case 'crear':{
   const [question,...choices]=fields(argument);
   const input=z.object({title:z.string().min(1).max(200),options:z.array(z.string().min(1).max(100)).min(2).max(6)}).safeParse({title:question,options:choices.length?choices:['Sí','No']});
   if(!input.success||new Set(input.data.options.map(s=>s.toLocaleLowerCase())).size!==input.data.options.length)throw new PlotCommandError('Usá !plot crear Pregunta, Opción 1, Opción 2 (entre 2 y 6 opciones distintas; usá "comillas" si el texto tiene comas).');
   return {kind:'create',...input.data};
  }
  case 'mercados':return {kind:'list'};
  case 'apostar':{
   if(!argument)throw new PlotCommandError('Usá !plot apostar M7K2, 1 (código de mercado y número de opción).');
   const parts=fields(argument);
   if(parts.length===2){const id=marketCode(parts[0]),option=optionNumber(parts[1]);if(id&&option)return {kind:'bet',id,option};}
   else if(parts.length===1){const option=optionNumber(parts[0]);if(option)return {kind:'bet',option};}
   throw new PlotCommandError('Usá !plot apostar M7K2, 1 (código de mercado y número de opción).');
  }
  case 'cerrar':{const id=marketCode(argument);if(!argument||id)return {kind:'lock',id};break;}
  case 'cancelar':{const id=marketCode(argument);if(!argument||id)return {kind:'cancel',id};break;}
  case 'resolver':{
   if(!argument)break;
   const parts=fields(argument);
   if(parts.length===2){const id=marketCode(parts[0]),option=optionNumber(parts[1]);if(id&&option)return {kind:'resolve',id,option};}
   else if(parts.length===1){
    const option=optionNumber(parts[0]);if(option)return {kind:'resolve',option};
    if(marketCode(parts[0]))throw new PlotCommandError('Indicá la opción ganadora: !plot resolver M7K2, 1.');
   }
   break;
  }
 }
 throw new PlotCommandError(plotChatHelp);
}
