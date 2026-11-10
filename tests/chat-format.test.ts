import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitChatReply,parseMarketList,formatMarketLine,CHAT_MESSAGE_MAX} from '../src/chat-format.js';

const link='https://plot.example/join/twitch/ramitapai';
const row=(code:string,phase:string,title:string,opts:string)=>`${code} · ${phase} · ${title} · ${opts}`;

test('a two-market list becomes one message per market, link only on the last',()=>{
  const reply=[row('FY','esperando resultado','Cuantas kills vamos a hacer?','!1 mas de 8 · !2 menos de 8'),
               row('NL','esperando resultado','Cuantas kills vamos a hacer?','!1 mas de 8 · !2 menos de 8')].join(' | ');
  const messages=splitChatReply(reply,link);
  assert.equal(messages.length,2);
  // Each message stays short and readable: code, phase, title, numbered options.
  assert.match(messages[0].text,/^#FY · esperando resultado · Cuantas kills vamos a hacer\? · 1 mas de 8 · 2 menos de 8$/);
  assert.ok(!messages[0].text.includes('|'),'no pipe separators');
  assert.ok(!messages[0].text.includes('http'),'link only on the last message');
  assert.match(messages[1].text,/^#NL · esperando resultado/);
  assert.ok(messages[1].text.endsWith(link),'link closes the last message');
});

test('every message respects the 500 character limit',()=>{
  const long=row('AB','abierta','T'.repeat(400),'!1 '+ 'a'.repeat(200));
  const messages=splitChatReply([long,long,long].join(' | '),link);
  for(const message of messages)assert.ok(message.text.length<=CHAT_MESSAGE_MAX,`too long: ${message.text.length}`);
});

test('a plain reply stays a single message with the link appended',()=>{
  const messages=splitChatReply('Apuestas cerradas (#FY).','https://plot.example/join/twitch/x');
  assert.equal(messages.length,1);
  assert.ok(messages[0].text.endsWith('https://plot.example/join/twitch/x'));
});

test('phase codes are translated to what a viewer reads',()=>{
  const parsed=parseMarketList(row('FY','locked','Pregunta?','!1 si · !2 no'));
  assert.equal(parsed[0].phase,'esperando resultado');
  assert.equal(parseMarketList(row('FY','open','Pregunta?','!1 si'))[0].phase,'abierta');
  assert.equal(parseMarketList(row('FY','void','Pregunta?','!1 si'))[0].phase,'reembolsada');
});

test('titles containing separators survive intact',()=>{
  const parsed=parseMarketList(row('FY','abierta','¿Gana el rojo? Sí, con 3 puntos','!1 si · !2 no'));
  assert.equal(parsed[0].title,'¿Gana el rojo? Sí, con 3 puntos');
  assert.equal(parsed[0].options,'1 si · 2 no');
});

test('a single market still renders as one clean message',()=>{
  const line=formatMarketLine({code:'FY',phase:'abierta',title:'¿Gana?',options:'1 sí · 2 no'});
  assert.equal(line,'#FY · abierta · ¿Gana? · 1 sí · 2 no');
  assert.ok(!line.includes('|'));
});

test('non-list text is not mistaken for a market list',()=>{
  assert.deepEqual(parseMarketList('No hay predicciones de Plot pendientes en este canal.'),[]);
  assert.deepEqual(parseMarketList('Apuestas cerradas (#FY).'),[]);
});
