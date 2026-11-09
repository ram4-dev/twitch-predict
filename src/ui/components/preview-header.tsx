import {ArrowUpRight} from 'lucide-react';
import {PlotBrandLink} from './plot.js';
/** Shared header for the app, detail and background comparison pages. */
export function PreviewHeader(){
  return <header><PlotBrandLink href="/app"/><a href="/app">Abrir app<ArrowUpRight size={15}/></a></header>;
}
