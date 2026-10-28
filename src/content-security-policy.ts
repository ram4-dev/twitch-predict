// Paper Shaders 0.0.82 injects this fixed stylesheet when mounting its first canvas.
// Keep the hash tied to the installed stylesheet; tests detect dependency drift.
const paperShaderStyle="'sha256-bcX2M6hOeEgeI9Ttj3KtXWZuoRsKenyQAlXswSnLakA='";
export const contentSecurityPolicy=`default-src 'self'; script-src 'self'; style-src 'self' ${paperShaderStyle}; connect-src 'self'; frame-ancestors 'none'`;

// public/pitch/index.html is one offline file: an inline stylesheet, style attributes,
// one inline script, and data: fonts and images. Style attributes cannot be hashed, so
// this route allows inline styles. The script stays pinned to its source hash.
const pitchScript="'sha256-b/d+Fb3QTqMPskXnVvgJl8HBOBtE4MfAobbX434T0E4='";
export const pitchContentSecurityPolicy=`default-src 'self'; script-src 'self' ${pitchScript}; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'`;

export function contentSecurityPolicyForPath(path:string){
  return path==='/pitch'||path.startsWith('/pitch/')?pitchContentSecurityPolicy:contentSecurityPolicy;
}
