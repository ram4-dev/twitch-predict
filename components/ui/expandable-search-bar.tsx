'use client';

import {useEffect,useId,useRef,useState,type FormEvent} from 'react';
import {motion,AnimatePresence,useReducedMotion} from 'framer-motion';
import {Search,X,LoaderCircle} from 'lucide-react';
import {cn} from '@/lib/utils';

export type ExpandableSearchBarProps={
  expandDirection?:'left'|'right';
  placeholder?:string;
  onSearch?:(query:string)=>void;
  className?:string;
  defaultOpen?:boolean;
  defaultValue?:string;
  onClear?:()=>void;
  width?:number;
  inputLabel?:string;
  openLabel?:string;
  submitLabel?:string;
  disabled?:boolean;
  loading?:boolean;
};
const COLLAPSED_SIZE=44;

export default function ExpandableSearchBar({expandDirection='right',placeholder='Buscar…',onSearch,className,defaultOpen=false,defaultValue='',onClear,width=280,inputLabel='Buscar',openLabel='Abrir búsqueda',submitLabel='Buscar',disabled=false,loading=false}:ExpandableSearchBarProps){
  const [open,setOpen]=useState(defaultOpen),[value,setValue]=useState(defaultValue),[expandedWidth,setExpandedWidth]=useState(width);
  const containerRef=useRef<HTMLDivElement>(null),inputRef=useRef<HTMLInputElement>(null),toggleRef=useRef<HTMLButtonElement>(null);
  const id=useId(),reducedMotion=useReducedMotion();
  const close=(restoreFocus=false)=>{setOpen(false);setValue('');onClear?.();if(restoreFocus)toggleRef.current?.focus();};
  useEffect(()=>{
    if(!open)return;
    const measure=()=>{const rect=containerRef.current?.getBoundingClientRect();if(rect)setExpandedWidth(Math.max(COLLAPSED_SIZE,Math.min(width,expandDirection==='right'?window.innerWidth-rect.left-16:rect.right-16)));};
    measure();window.addEventListener('resize',measure);inputRef.current?.focus({preventScroll:true});
    return()=>window.removeEventListener('resize',measure);
  },[open,width,expandDirection]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!containerRef.current?.contains(event.target)&&!value&&!disabled){setOpen(false);setValue('');onClear?.();}};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[open,value,disabled,onClear]);
  const submit=(event:FormEvent)=>{event.preventDefault();if(!disabled&&!loading&&value.trim())onSearch?.(value.trim());};
  return <div ref={containerRef} className={cn('expandable-search relative inline-block shrink-0',className)} data-direction={expandDirection} style={{width:COLLAPSED_SIZE,height:COLLAPSED_SIZE}} onKeyDown={event=>{if(event.key==='Escape'&&open&&!disabled){event.preventDefault();event.stopPropagation();close(true);}}}>
    <button ref={toggleRef} type="button" aria-label={open?'Cerrar búsqueda':openLabel} aria-expanded={open} aria-controls={open?id:undefined} disabled={disabled} onClick={()=>open?close(true):setOpen(true)} className="search-toggle absolute inset-0 z-20 grid place-items-center rounded-full border border-input bg-secondary text-foreground/80 transition-colors hover:text-foreground">
      {open?<X className="size-4" aria-hidden="true"/>:<Search className="size-4" aria-hidden="true"/>}
    </button>
    <AnimatePresence initial={false}>
      {open&&<motion.form id={id} role="search" aria-label={inputLabel} aria-busy={loading} onSubmit={submit} className={cn('search-form absolute top-0 flex h-11 items-center overflow-hidden rounded-full border border-input bg-background text-foreground',expandDirection==='left'?'right-0':'left-0')} initial={reducedMotion?false:{width:COLLAPSED_SIZE,opacity:0.98}} animate={{width:expandedWidth,opacity:1}} exit={{width:COLLAPSED_SIZE,opacity:0}} transition={reducedMotion?{duration:0}:{type:'spring',stiffness:260,damping:26}}>
        {expandDirection==='left'&&<Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden="true"/>}
        <input ref={inputRef} type="search" aria-label={inputLabel} value={value} disabled={disabled} onChange={event=>setValue(event.target.value)} placeholder={placeholder} autoComplete="off" autoCapitalize="none" spellCheck={false} className="search-input min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"/>
        <motion.button type="submit" disabled={disabled||loading||!value.trim()} aria-label={submitLabel} className="search-submit grid h-11 w-11 shrink-0 place-items-center text-muted-foreground hover:text-foreground" initial={reducedMotion?false:{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} exit={{opacity:0}} transition={{duration:reducedMotion?0:0.15}}>{loading?<LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true"/>:<Search className="size-4" aria-hidden="true"/>}</motion.button>
      </motion.form>}
    </AnimatePresence>
  </div>;
}
