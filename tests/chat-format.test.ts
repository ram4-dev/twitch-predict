import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitChatReply,parseMarketList,formatMarketLine,shareBar,CHAT_MESSAGE_MAX,BAR_CELLS} from '../src/chat-format.js';

const link='https://plot.example/join/twitch/ramitapai';
const row=(code:string,phase:string,title:string,opts:string)=>`${code} · ${phase} · ${title} · ${opts}`;

test('a two-market list becomes one message per market, link only on the last',()=>{
  const reply=[row('FY','esperando resultado','Cuantas kills vamos a hacer?','!1 mas de 8 · !2 menos de 8'),
               row('NL','esperando resultado','Cuantas kills vamos a hacer?','!1 mas de 8 · !2 menos de 8')].join(' | ');
  const messages=splitChatReply(reply,link);
  assert.equal(messages.length,2);
  // Each message stays short and readable: code, phase, title, numbered options with a bar each.
  // A market with no bets still shows empty bars (0%) instead of falling back to the old plain list.
  assert.match(messages[0].text,/^#FY esperando resultado · Cuantas kills vamos a hacer\? · 1 mas de 8 ░{10} 0% · 2 menos de 8 ░{10} 0%$/);
  assert.ok(!messages[0].text.includes('|'),'no pipe separators');
  assert.ok(!messages[0].text.includes('http'),'link only on the last message');
  assert.match(messages[1].text,/^#NL esperando resultado/);
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
  const line=formatMarketLine({code:'FY',phase:'abierta',title:'¿Gana?',options:'1 sí · 2 no',outcomes:[]});
  assert.equal(line,'#FY · abierta · ¿Gana? · 1 sí · 2 no');
  assert.ok(!line.includes('|'));
});

test('non-list text is not mistaken for a market list',()=>{
  assert.deepEqual(parseMarketList('No hay predicciones de Plot pendientes en este canal.'),[]);
  assert.deepEqual(parseMarketList('Apuestas cerradas (#FY).'),[]);
});

test('bars use only the two glyphs measured as equal width in Twitch chat',()=>{
  // Verified in a real browser: █ and ░ both measure 9.21px in Twitch's proportional font, while
  // box-drawing (│ 8.13px) and ▓ (9.48px) break the grid. The renderer must never emit those.
  const bar=shareBar(0.5);
  const chars=new Set([...bar]);
  assert.deepEqual([...chars].sort(),['█','░']);
  for(const message of splitChatReply('FY · abierta · ¿Gana? · !1 sí 50% · !2 no 50%','https://plot.example/join/twitch/x')){
    assert.ok(!/[┌┐└┘─│├┤▓▒▀▄]/.test(message.text),'message contains a grid-breaking glyph');
  }
});

test('share maps to a proportional bar of fixed width',()=>{
  assert.equal(shareBar(0,4),'░░░░');
  assert.equal(shareBar(1,4),'████');
  assert.equal(shareBar(0.5,4),'██░░');
  assert.equal(shareBar(0.62),'██████░░░░');
  // Out of range values never produce a bar of the wrong length.
  for(const value of [-1,2,Number.NaN,Infinity])assert.equal([...shareBar(value)].length,BAR_CELLS);
});

test('a market list with shares renders aligned bars per option',()=>{
  const messages=splitChatReply('FY · abierta · ¿Kills? · !1 más de 8 62% · !2 menos de 8 38%','');
  assert.equal(messages.length,1);
  assert.match(messages[0].text,/^#FY abierta · ¿Kills\? · 1 más de 8 ██████░░░░ 62% · 2 menos de 8 ████░░░░░░ 38%$/);
});

test('help and create confirmations keep their complete text instead of becoming market lists',()=>{
 const replies=[
  'Crear: !plot crear Pregunta, Sí, No · Listar: !plot mercados · Apostar: !plot apostar 1',
  '¿Gana? · !1 Sí · !2 No · Código AB · 100 puntos por apuesta.',
  'No tenés permisos · Consultá al dueño · !plot ayuda',
 ];
 for(const reply of replies){assert.deepEqual(parseMarketList(reply),[]);assert.deepEqual(splitChatReply(reply,link),[{text:`${reply} ${link}`}]);}
});
