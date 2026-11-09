import {z} from 'zod';

export type PlotCommand={kind:'create';title:string;options:string[]}|{kind:'lock'|'cancel'}|{kind:'resolve';option:number};
export const plotChatHelp='Crear: !plot crear Pregunta, Sí, No · Cerrar: !plot cerrar · Resolver: !plot resolver 1 · Cancelar: !plot cancelar';

export function parsePlotCommand(text:string):PlotCommand|undefined{
 const match=/^!plot\s+(crear|cerrar|resolver|cancelar)(?:\s+([\s\S]*))?$/i.exec(text.trim());
 if(!match)return undefined;
 const argument=match[2]?.trim()??'';
 switch(match[1].toLowerCase()){
  case 'crear':{
   const [question,...choices]=argument.split(/[,|]/).map(s=>s.trim());
   const input=z.object({title:z.string().min(1).max(200),options:z.array(z.string().min(1).max(100)).min(2).max(6)}).safeParse({title:question,options:choices.length?choices:['Sí','No']});
   if(!input.success||new Set(input.data.options.map(s=>s.toLocaleLowerCase())).size!==input.data.options.length)throw new Error('Usá !plot crear Pregunta, Opción 1, Opción 2 (entre 2 y 6 opciones distintas).');
   return {kind:'create',...input.data};
  }
  case 'cerrar':if(!argument)return {kind:'lock'};break;
  case 'cancelar':if(!argument)return {kind:'cancel'};break;
  case 'resolver':if(/^[1-6]$/.test(argument))return {kind:'resolve',option:Number(argument)};break;
 }
 throw new Error(plotChatHelp);
}
