#!/usr/bin/env python3
"""End-to-end Android tests against the real app, official MWA Fake Wallet, and isolated RPC fixture."""
import json,os,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from importlib.util import spec_from_file_location,module_from_spec
spec=spec_from_file_location('ui',Path(__file__).with_name('android-ui.py'));ui=module_from_spec(spec);spec.loader.exec_module(ui)
fixture=Path(__file__).resolve().parents[1]/'artifacts/fixture/byte-fixture.json'
results=[]
def state():return json.loads(fixture.read_text())
def change(**values):
 data=state();data.update(values);tmp=fixture.with_suffix('.edit');tmp.write_text(json.dumps(data));tmp.replace(fixture)
def check(name,condition):
 assert condition,name
 results.append(name);print('PASS '+name,flush=True)
def wait_broadcasts(count,timeout=30):
 deadline=time.time()+timeout
 while time.time()<deadline:
  if state()['broadcasts']==count:return
  time.sleep(.25)
 raise AssertionError('Expected broadcasts: '+str(count))
def open_channel():
 ui.adb('shell','am','start','-a','android.intent.action.VIEW','-d','plot://channel/fixture_streamer','fun.plot.mobile')
 ui.find('Apostar a Sí, gana',30)
def reopen():
 ui.adb('shell','am','force-stop','fun.plot.mobile');ui.adb('shell','am','start','-n','fun.plot.mobile/.MainActivity')
 ui.find('Buscar predicciones',20);time.sleep(1)
def submit():
 ui.tap('Apostar a Sí, gana');ui.tap('Firmar apuesta en mi wallet');ui.find('SIGN TRANSACTION(S)',30)
def run():
 change(pending=False);reopen();ui.tap('Mis apuestas');ui.tap('Revisar transacciones');time.sleep(.5)
 initial=state()['broadcasts'];initial_syncs=state()['syncs'];open_channel();ui.screenshot('android-market')
 submit();ui.tap('DECLINE');ui.find('Cancelaste la solicitud en tu wallet. No se envió una apuesta.',15)
 check('Rechazar la firma no transmite una apuesta',state()['broadcasts']==initial);ui.screenshot('android-rejected')
 ui.tap('Volver');change(pending=True);submit();ui.screenshot('android-mwa-sign');ui.tap('AUTHORIZE');wait_broadcasts(initial+1)
 check('La wallet firma y el RPC verifica la transacción Ed25519 y la instrucción Byte',len(state()['signatures'])==initial+1)
 reopen();ui.tap('Mis apuestas');ui.find('Confirmación pendiente',20);ui.screenshot('android-pending-after-restart')
 check('El recibo pendiente sobrevive a cerrar el proceso',True)
 ui.tap('Streams');open_channel();ui.tap('Apostar a Sí, gana');ui.tap('Firmar apuesta en mi wallet')
 ui.find('Hay una transacción pendiente para este mercado. Revisala en Mis apuestas antes de enviar otra.',20)
 check('Una apuesta pendiente bloquea un segundo envío',state()['broadcasts']==initial+1)
 ui.tap('Volver');change(pending=False);reopen();ui.tap('Mis apuestas');ui.find('Confirmada en Solana',20);ui.screenshot('android-confirmed-after-restart')
 check('Reabrir concilia la firma sin volver a transmitir',state()['broadcasts']==initial+1 and state()['syncs']>=initial_syncs+1)
 reopen();ui.tap('Mis apuestas');ui.find('Confirmada en Solana',20)
 check('La confirmación se conserva después de otro reinicio',True)
 result={'passed':results,'broadcastsBefore':initial,'broadcastsAfter':state()['broadcasts'],'syncs':state()['syncs'],'rpc':'controlled fixture; real wallet signatures','wallet':'official Solana Mobile Fake Wallet','device':ui.SERIAL}
 out=Path(__file__).resolve().parents[1]/'artifacts'/'android-e2e.json';out.write_text(json.dumps(result,indent=2));print(json.dumps(result,ensure_ascii=False),flush=True)
if __name__=='__main__':run()
