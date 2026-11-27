"""Local validator E2E. Use only an isolated emulator, wallet and test harness."""
import os, signal, time
import uiautomator2 as u
D=u.connect(os.environ['ANDROID_SERIAL'])
def press(text, timeout=30):
 x=D(text=text)
 if not x.wait(timeout=timeout): raise AssertionError('Missing '+text)
 x.click()
def seek(text):
 for _ in range(6):
  if D(text=text).exists:return
  D.swipe(500,1500,500,650,.3);time.sleep(.3)
 raise AssertionError('Missing '+text)
def top():
 for _ in range(4):D.swipe(500,600,500,1500,.25)
def auth(count):
 for _ in range(count):
  b=D(resourceId='com.solana.mobilewalletadapter.fakewallet:id/btn_authorize')
  if b.wait(timeout=8): b.click();time.sleep(1)
press('Consultar mercados');press('Iniciar sesión con wallet');auth(2)
assert D(text='Saldo PLOT: 0 PLOT').wait(timeout=20);print('PASS login and zero PLOT',flush=True)
seek('Crear compra de prueba');press('Crear compra de prueba');press('Confirmar pago simulado');press('Revisar crédito')
for _ in range(15):
 time.sleep(1)
 if D(text='Saldo PLOT: 600 PLOT').exists: break
 if D(text='Revisar crédito').exists:D(text='Revisar crédito').click()
assert D(text='Saldo PLOT: 600 PLOT').exists;print('PASS test purchase finalized 600',flush=True)
seek('yes');press('yes');seek('Preparar predicción');press('Preparar predicción')
top();seek('Firmar predicción o cobro');press('Firmar predicción o cobro');auth(1)
for _ in range(20):
 time.sleep(1)
 if D(text='Última operación: confirmada').exists:break
 if D(text='Revisar operación').exists:D(text='Revisar operación').click()
assert D(text='Última operación: confirmada').exists,'prediction not finalized'
print('PASS signed prediction finalized',flush=True)
os.kill(int(os.environ['PLOT_TEST_CONTROL_PID']),signal.SIGUSR2)
# The local harness finalizes cancellation asynchronously; refresh until both views agree.
for _ in range(30):
 top();press('Actualizar cuenta y mercados');time.sleep(1)
 for __ in range(5):
  if D(text='Preparar cobro').exists:break
  D.swipe(500,1500,500,650,.3)
 if D(text='Preparar cobro').exists and D(textContains='Cobro total: 600 PLOT').exists:break
else:raise AssertionError('Cancellation not finalized')
press('Preparar cobro');top();seek('Firmar predicción o cobro');press('Firmar predicción o cobro');auth(1)
for _ in range(30):
 time.sleep(1)
 if D(text='Última operación: confirmada').exists:break
 if D(text='Revisar operación').exists:D(text='Revisar operación').click()
assert D(text='Última operación: confirmada').exists,'claim not finalized'
top();assert D(text='Saldo PLOT: 600 PLOT').exists
seek('Cobrado');assert D(textContains='Comisión streamer: 0 PLOT · Tesorería: 0 PLOT').exists
assert D(textContains='Neto: 0 PLOT').exists
print('PASS local cancellation and claim: refund 600 PLOT, net 0, fees 0',flush=True)
