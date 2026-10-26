#!/usr/bin/env python3
"""Small Android UI driver. Uses accessibility labels, never captures wallet seed screens."""
import os,re,subprocess,time,xml.etree.ElementTree as ET
from pathlib import Path
ADB=os.environ.get('ADB',str(Path.home()/'Library/Android/sdk/platform-tools/adb'))
SERIAL=os.environ.get('ANDROID_SERIAL','emulator-5554')
def adb(*args):return subprocess.check_output([ADB,'-s',SERIAL,*args],text=True)
try:
 import uiautomator2 as u2
 device=u2.connect(SERIAL)
except ImportError:
 device=None
def snapshot():
 if device is not None:return ET.fromstring(device.dump_hierarchy())
 adb('shell','uiautomator','dump','/sdcard/plot-ui.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/plot-ui.xml'))
def find(label,timeout=15,enabled=False):
 end=time.time()+timeout
 while time.time()<end:
  for node in snapshot().iter('node'):
   if label in (node.get('text'),node.get('content-desc'),node.get('resource-id')) and (not enabled or node.get('enabled')=='true'):return node
  time.sleep(.3)
 raise AssertionError('UI target not found: '+label)
def tap(label,timeout=15):
 n=find(label,timeout,enabled=True);x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
 assert n.get('enabled')=='true','Target disabled: '+label
 adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
def type_text(label,text):
 tap(label);adb('shell','input','keyevent','KEYCODE_MOVE_END')
 adb('shell','input','keyevent',*(['67']*120));adb('shell','input','text',text.replace(' ','%s'))
def screenshot(name):
 directory=Path(__file__).resolve().parents[1]/'artifacts'/'screenshots';directory.mkdir(parents=True,exist_ok=True)
 with (directory/(name+'.png')).open('wb') as out:subprocess.run([ADB,'-s',SERIAL,'exec-out','screencap','-p'],stdout=out,check=True)
def texts():
 for n in snapshot().iter('node'):
  label=n.get('content-desc') or n.get('text')
  if label:print(label,n.get('bounds'), 'disabled' if n.get('enabled')!='true' else '')
if __name__=='__main__':
 import sys
 if len(sys.argv)==1:texts()
 elif sys.argv[1]=='tap':tap(sys.argv[2])
 elif sys.argv[1]=='type':type_text(sys.argv[2],sys.argv[3])
 elif sys.argv[1]=='shot':screenshot(sys.argv[2])
