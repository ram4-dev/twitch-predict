import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement as h} from 'react';
import {ProposalCard, ProposalInbox, MyProposals, MarketComposer, ProposalStatusBadge} from '../src/ui/proposals-ui.js';
import type {ProposalItem} from '../src/ui/proposals-client.js';

const item=(over:Partial<ProposalItem>={}):ProposalItem=>({id:'prop-1',shortId:'P4N8',channelId:'123',status:'pending',
  input:{title:'¿Gana el equipo rojo?',options:['Sí','No'],durationSeconds:120},createdAt:'2026-11-09T12:00:00.000Z',...over});

test('ProposalCard renders question, options, status and non-color cues',()=>{
  const html=renderToStaticMarkup(h(ProposalCard,{proposal:item()}));
  assert.match(html,/¿Gana el equipo rojo\?/);
  assert.match(html,/data-proposal-status="pending"/);
  assert.match(html,/Sí/);assert.match(html,/No/);
  assert.match(html,/P4N8/);
});

test('ProposalCard surfaces rejection reason and edited content without relying on color',()=>{
  const rejected=renderToStaticMarkup(h(ProposalCard,{proposal:item({status:'rejected',rejectionReason:'Fuera de tema'})}));
  assert.match(rejected,/Fuera de tema/);
  const edited=renderToStaticMarkup(h(ProposalCard,{proposal:item({editedInput:{title:'¿Gana hoy?',options:['Sí','No']}})}));
  assert.match(edited,/¿Gana hoy\?/);assert.match(edited,/original conservado/);
  const accepted=renderToStaticMarkup(h(ProposalCard,{proposal:item({status:'accepted',acceptedMarketId:'plot:demo:x1'})}));
  assert.match(accepted,/plot:demo:x1/);
});

test('MarketComposer exposes accessible labels and distinguishes propose vs create copy',()=>{
  const propose=renderToStaticMarkup(h(MarketComposer,{mode:'propose',channelLabel:'@demo',onSubmit:async()=>({})}));
  assert.match(propose,/Enviar propuesta/);assert.match(propose,/aprobación del streamer/);
  assert.match(propose,/aria-label="Proponer mercado"/);assert.match(propose,/aria-label="Opción 1"/);
  const create=renderToStaticMarkup(h(MarketComposer,{mode:'create',channelLabel:'@demo',onSubmit:async()=>({})}));
  assert.match(create,/Crear mercado/);
});

test('Inbox and MyProposals render accessible sections with counts and empty states',()=>{
  const inbox=renderToStaticMarkup(h(ProposalInbox,{client:{forChannel:async()=>({proposals:[item()]})} as never,channelId:'123',initial:{loaded:true}}));
  assert.match(inbox,/aria-label="Bandeja de propuestas"/);
  const mine=renderToStaticMarkup(h(MyProposals,{client:{mine:async()=>({proposals:[]})} as never,initial:{loaded:true}}));
  assert.match(mine,/aria-label="Mis propuestas"/);assert.match(mine,/No enviaste propuestas/);
  assert.match(renderToStaticMarkup(h(ProposalStatusBadge,{status:'withdrawn'})),/Retirada/);
});
