/** Wrap public same-origin destinations only; no wallet/session tokens belong in these URLs. */
export function phantomBrowseUrl(target:string):string{
  const url=new URL(target,location.origin);
  if(url.origin!==location.origin||!['https:','http:'].includes(url.protocol))throw new Error('Destino de wallet inválido.');
  return `https://phantom.com/ul/browse/${encodeURIComponent(url.href)}?ref=${encodeURIComponent(location.origin)}`;
}
export function mobileBrowser(){return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);}
/** Onboarding handoff only carries the public role, never OAuth tickets or extension pairing state. */
export function onboardingPhantomUrl(){
  const target=new URL('/onboarding',location.origin);
  if(new URLSearchParams(location.search).get('streamer')==='1')target.searchParams.set('streamer','1');
  return phantomBrowseUrl(target.href);
}
