/** Local preview hosts plus one explicitly configured authentication origin. */
export function trustedLocalHostname(name:string,authOrigin?:string){
  if(['twitch-predict.localhost','twitch-predict-byte.localhost','twitch-points-test.localhost','localhost','127.0.0.1','twitch-predict.local'].includes(name)||/^[0-9a-z-]+\.sslip\.io$/.test(name)||/^[0-9.]+$/.test(name))return true;
  try{const origin=new URL(authOrigin??'');return ['https:','http:'].includes(origin.protocol)&&origin.origin===authOrigin&&origin.hostname===name;}catch{return false;}
}
