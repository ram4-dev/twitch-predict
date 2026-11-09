import type {ReactNode} from 'react';
import {PlotBrandLink} from './plot.js';
export function AuthLayout({children,className='',footer}:{children:ReactNode;className?:string;footer?:ReactNode}){
  return <main className="onboarding"><PlotBrandLink className="auth-brand"/><section className={`auth-card ${className}`}>{children}</section>{footer&&<p className="auth-footer">{footer}</p>}</main>;
}
