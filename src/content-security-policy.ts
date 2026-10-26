// Paper Shaders 0.0.82 injects this fixed stylesheet when mounting its first canvas.
// Keep the hash tied to the installed stylesheet; tests detect dependency drift.
const paperShaderStyle="'sha256-bcX2M6hOeEgeI9Ttj3KtXWZuoRsKenyQAlXswSnLakA='";
export const contentSecurityPolicy=`default-src 'self'; script-src 'self'; style-src 'self' ${paperShaderStyle}; connect-src 'self'; frame-ancestors 'none'`;
