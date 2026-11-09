/** Plan 2 — typed client for the proposals API. Injected fetch keeps E2E mocking (Playwright route) trivial. */
export type ProposalStatus='pending'|'accepted'|'rejected'|'withdrawn';
export type ProposalItem={id:string;shortId:string;channelId:string;status:ProposalStatus;input:{title:string;options:string[];durationSeconds?:number};
  editedInput?:{title:string;options:string[];durationSeconds?:number};rejectionReason?:string;acceptedMarketId?:string;createdAt:string};
export type ProposalsResponse={proposals:ProposalItem[];isOwner?:boolean;pending?:number};

export type ProposalsClient={
  mine():Promise<ProposalsResponse>;
  forChannel(channelId:string):Promise<ProposalsResponse>;
  submit(channelId:string,input:{title:string;options:string[];durationSeconds?:number},intentId:string):Promise<{id:string;shortId:string}>;
  withdraw(proposalId:string,intentId:string):Promise<unknown>;
  accept(proposalId:string,intentId:string,editedInput?:{title:string;options:string[];durationSeconds?:number}):Promise<unknown>;
  reject(proposalId:string,intentId:string,reason?:string):Promise<unknown>;
};

export const httpProposalsClient=(fetchFn:typeof fetch=fetch):ProposalsClient=>{
  const json=async(r:Response)=>{const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error((data as {error?:string}).error??'No se pudo completar la operación.');return data;};
  return {
    mine:()=>fetchFn('/api/proposals/me').then(json),
    forChannel:id=>fetchFn(`/api/proposals/channels/${encodeURIComponent(id)}`).then(json),
    submit:(channelId,input,intentId)=>fetchFn(`/api/proposals/channels/${encodeURIComponent(channelId)}`,
      {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...input,intentId})}).then(json),
    withdraw:(id,intentId)=>fetchFn(`/api/proposals/${encodeURIComponent(id)}/withdraw`,
      {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intentId})}).then(json),
    accept:(id,intentId,editedInput)=>fetchFn(`/api/proposals/${encodeURIComponent(id)}/accept`,
      {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intentId,...(editedInput?{editedInput}:{})})}).then(json),
    reject:(id,intentId,reason)=>fetchFn(`/api/proposals/${encodeURIComponent(id)}/reject`,
      {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intentId,...(reason?{reason}:{})})}).then(json),
  };
};
