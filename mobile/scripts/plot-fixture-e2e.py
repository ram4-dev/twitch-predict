#!/usr/bin/env python3
"""Exercise local PLOT fixtures on an isolated Android emulator; no wallet is used."""
import json, time, importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('android_ui', Path(__file__).with_name('android-ui.py'))
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)

def visible(label):
    for node in ui.snapshot().iter('node'):
        if label in (node.get('text'), node.get('content-desc')):
            return True
    return False

def seek(label):
    if visible(label): return
    for _ in range(6):
        ui.adb('shell', 'input', 'swipe', '500', '600', '500', '1600', '250')
    for _ in range(8):
        if visible(label): return
        ui.adb('shell', 'input', 'swipe', '500', '1600', '500', '600', '400')
        time.sleep(.3)
    raise AssertionError('Not visible: ' + label)

def tap(label):
    seek(label)
    ui.tap(label)
    time.sleep(.5)

ui.adb('shell','am','start','-a','android.intent.action.VIEW','-d','plot:///plot-demo','fun.plot.mobile')
ui.find('Abrir simulación local', 60)
tap('Abrir simulación local')
tap('Abrir ejemplo')
tap('Iniciar sesión de ejemplo')
tap('Comprar 600 PLOT de prueba')
seek('Operación simulada pendiente')
ui.adb('shell','am','force-stop','fun.plot.mobile')
ui.adb('shell','am','start','-a','android.intent.action.VIEW','-d','plot:///plot-demo','fun.plot.mobile')
ui.find('Abrir simulación local', 60)
tap('Abrir simulación local')
tap('Abrir ejemplo')
seek('Operación simulada pendiente')
tap('Completar simulación pendiente')
seek('Saldo de ejemplo: 600 PLOT')
tap('Simular predicción')
tap('Completar simulación pendiente')
seek('Saldo de ejemplo: 0 PLOT')
seek('Historial de ejemplo')
seek('Simular cobro')
tap('Simular cobro')
tap('Completar simulación pendiente')
seek('Saldo de ejemplo: 960 PLOT')
tap('Simular cobro')
tap('Completar simulación pendiente')
seek('Saldo de ejemplo: 1560 PLOT')
ui.screenshot('plot-fixture-e2e')
print(json.dumps({'mode':'local fixture', 'android':'API 36', 'checks':['login', 'purchase pending', 'force-stop and reopen', 'reconcile purchase', 'prediction', 'claim', 'cancellation refund'], 'network_transaction':False}))
