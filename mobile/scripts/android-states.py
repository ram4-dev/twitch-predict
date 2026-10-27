#!/usr/bin/env python3
"""UI states on the installed Android app; does not sign or submit transactions."""
import sys,time,json
from pathlib import Path
from importlib.util import spec_from_file_location,module_from_spec
spec=spec_from_file_location('ui',Path(__file__).with_name('android-ui.py'));ui=module_from_spec(spec);spec.loader.exec_module(ui)
passed=[]
def check(name):passed.append(name);print('PASS '+name,flush=True)
def home():
 ui.adb('shell','am','start','-a','android.intent.action.VIEW','-d','plot:///','fun.plot.mobile');ui.find('Buscar predicciones',20);time.sleep(.5)
def search(value):
 home();ui.type_text('Nombre o enlace del streamer',value);ui.adb('shell','input','keyevent','4');ui.tap('Buscar predicciones')
search('https://twitch.tv.evil.test/fixture_streamer');ui.find('Pegá el enlace de un canal de Twitch.');check('Rechaza enlaces que imitan Twitch')
search('https://www.twitch.tv/fixture_streamer');ui.find('Apostar a Sí, gana',20);ui.screenshot('android-search-url');check('Buscar por enlace abre el canal correcto')
search('@plot_no_open_market');ui.find('Por ahora, no hay jugada.',20);ui.screenshot('android-empty');check('Canal sin mercados muestra el estado vacío')
ui.adb('shell','am','start','-a','android.intent.action.VIEW','-d','plot://channel/fixture_streamer','fun.plot.mobile');ui.find('Apostar a Sí, gana',20)
fixture=Path(__file__).resolve().parents[1]/'artifacts/fixture/byte-fixture.json';data=json.loads(fixture.read_text());original=[(m['id'],m['closeMs']) for m in data['markets']]
try:
 for m in data['markets']:m['closeMs']=int(time.time()*1000)-1000
 temp=fixture.with_suffix('.edit');temp.write_text(json.dumps(data));temp.replace(fixture)
 ui.find('Por ahora, no hay jugada.',20);check('Los mercados cerrados dejan de ofrecer apuestas')
finally:
 data=json.loads(fixture.read_text())
 for m in data['markets']:m['closeMs']=dict(original)[m['id']]
 temp=fixture.with_suffix('.edit');temp.write_text(json.dumps(data));temp.replace(fixture)
ui.find('Apostar a Sí, gana',20)
try:
 ui.adb('shell','settings','put','system','font_scale','1.3');ui.adb('shell','wm','size','960x2080');time.sleep(1);ui.screenshot('android-compact-large-font');check('Captura en pantalla compacta y fuente al 130 por ciento')
 ui.adb('shell','settings','put','system','font_scale','1.0');ui.adb('shell','settings','put','system','accelerometer_rotation','0');ui.adb('shell','settings','put','system','user_rotation','1');time.sleep(1);ui.screenshot('android-landscape');check('Captura en orientación horizontal')
finally:
 ui.adb('shell','settings','put','system','user_rotation','0');ui.adb('shell','settings','put','system','accelerometer_rotation','1');ui.adb('shell','settings','put','system','font_scale','1.0');ui.adb('shell','wm','size','reset')
 home()
check('La navegación vuelve a la búsqueda')
(Path(__file__).resolve().parents[1]/'artifacts'/'android-states.json').write_text(json.dumps({'passed':passed},indent=2))
