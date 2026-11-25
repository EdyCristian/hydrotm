import subprocess,sys,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8765','-d','dist'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
errs=[]
def ok(c,m):print(('OK  ' if c else 'FAIL')+' '+m); c or errs.append(m)
with sync_playwright() as p:
  b=p.chromium.launch();ctx=b.new_context(viewport={'width':412,'height':860},is_mobile=True,has_touch=True)
  pg=ctx.new_page();cdp=ctx.new_cdp_session(pg)
  pg.goto('http://localhost:8765/index.html');pg.wait_for_timeout(2000);pg.click('#infoOk')
  def swipe(y0,dist,steps,ms):
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':206,'y':y0}]})
    for i in range(1,steps+1):
      pg.wait_for_timeout(ms);cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':206,'y':y0+dist*i/steps}]})
    mid=pg.evaluate("getComputedStyle(document.getElementById('sheet')).transform")
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});pg.wait_for_timeout(400)
    return mid
  def openS():
    pg.evaluate('HydroTM.openSheet(HydroTM.byId("TM-0001"))');pg.wait_for_timeout(400)
    return pg.locator('#sheet').bounding_box()['y']
  top=openS()
  mid=swipe(top+20,40,8,40); ok(pg.evaluate("document.getElementById('sheet').classList.contains('open')"),f'tragere scurtă și lentă (40 px): fișa revine ({mid})')
  ok(pg.evaluate("document.getElementById('sheet').style.transform")=='','fișa revenită fără deplasare')
  mid=swipe(top+20,250,10,25); ok(not pg.evaluate("document.getElementById('sheet').classList.contains('open')"),f'tragere lungă: fișa se închide (în timpul tragerii: {mid})')
  top=openS(); swipe(top+20,60,3,10); ok(not pg.evaluate("document.getElementById('sheet').classList.contains('open')"),'tragere rapidă scurtă: se închide')
  top=openS(); swipe(top+200,-150,6,30); ok(pg.evaluate("document.getElementById('sheet').classList.contains('open')"),'tragere în sus nu închide')
  top=openS(); swipe(top+150,250,10,25); ok(not pg.evaluate("document.getElementById('sheet').classList.contains('open')"),'tragere pornită din mijlocul fișei (pe butoane) închide')
  b.close()
srv.terminate()
print('REZULTAT:','TOATE OK' if not errs else errs)
