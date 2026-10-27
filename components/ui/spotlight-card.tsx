'use client';

import {useEffect,useRef,type CSSProperties,type HTMLAttributes} from 'react';
import {cn} from '@/lib/utils';

// Adaptation of the public Spotlight Card demo by Hossain Jahed / EaseMize.
// https://21st.dev/@jahed/components/spotlight-card
// Own implementation: pointer-lit surface and border, with native content semantics.
export type GlowCardProps = HTMLAttributes<HTMLElement> & {
  glowColor?: string;
};

const enhanced = new WeakSet<HTMLElement>();
function enhanceGlow(node: HTMLElement, className: string) {
  if (enhanced.has(node)) return;
  enhanced.add(node);
  node.classList.add(className);
  const follow = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = node.getBoundingClientRect();
    node.style.setProperty('--glow-x', `${event.clientX - bounds.left}px`);
    node.style.setProperty('--glow-y', `${event.clientY - bounds.top}px`);
    node.dataset.glowActive = 'true';
  };
  const reset = () => { delete node.dataset.glowActive; };
  node.addEventListener('pointerenter', follow);
  node.addEventListener('pointermove', follow);
  node.addEventListener('pointerleave', reset);
  node.addEventListener('pointercancel', reset);
}

export const enhanceGlowCard = (node: HTMLElement) => enhanceGlow(node, 'plot-glow-card');
export const enhanceGlowStage = (node: HTMLElement) => enhanceGlow(node, 'plot-glow-stage');

export function GlowStage({children,className,...props}: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) enhanceGlowStage(ref.current); }, []);
  return <div {...props} ref={ref} className={cn('plot-glow-stage',className)}>{children}</div>;
}

export function GlowCard({children,className,glowColor,style,...props}: GlowCardProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (ref.current) enhanceGlowCard(ref.current); }, []);
  return <article {...props} ref={ref} className={cn('plot-glow-card',className)}
    style={{...style,...(glowColor ? {'--glow-color':glowColor} : {})} as CSSProperties}>
    {children}
  </article>;
}
