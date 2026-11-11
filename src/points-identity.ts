/** Internal points require one verified betting identity; Google alone does not qualify. */
export function hasPointsIdentity(account:{wallet?:string|null;twitch?:{id:string}|null}|null|undefined):boolean{
 return !!(account?.wallet||account?.twitch?.id);
}

export class PointsSessionError extends Error {}
