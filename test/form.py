# Test: formular admin (localitate din listă, stradă cu sugestii, cea mai apropiată stradă) + fotografii
import subprocess, sys, time, json, os, shutil, zipfile
from playwright.sync_api import sync_playwright
D=os.path.dirname(os.path.abspath(__file__)); DIST=D+'/../dist'; OUT=D+'/shots'; os.makedirs(OUT,exist_ok=True)
for f in ['strazi.json','strazi-geo.json']: shutil.copy(D+'/'+f, DIST+'/'+f)
srv=subprocess.Popen([sys.executable,'-m','http.server','8765','-d',DIST],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]
def ok(c,m):
    print(('OK  ' if c else 'FAIL')+' '+m); c or errs.append(m)
FREE='''([tx,ty])=>{const els=[...document.querySelectorAll('.hp,.cl')].map(e=>e.getBoundingClientRect());
 for(let r=0;r<200;r+=6)for(let a=0;a<360;a+=30){const x=tx+r*Math.cos(a*Math.PI/180),y=ty+r*Math.sin(a*Math.PI/180);
  if(y>330&&y<820&&x>20&&x<390&&els.every(b=>Math.hypot(b.x+b.width/2-x,b.y+b.height/2-y)>40))return [x,y];}}'''
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':412,'height':860},is_mobile=True,has_touch=True,accept_downloads=True)
    pg=ctx.new_page(); cons=[]
    pg.on('pageerror',lambda e:cons.append('PAGEERR '+str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(1500); pg.click('#infoOk')
    pg.evaluate('sessionStorage.setItem("hydrotm-admin","1")'); pg.reload(); pg.wait_for_timeout(2500)
    ok(pg.evaluate('HydroTM.streets().length')==26 and 'Moșnița Nouă' in pg.evaluate('HydroTM.streetLocs()'),'index de străzi încărcat din strazi.json')
    # --- sursă nouă lângă Calea Lipovei: strada se completează singură
    pg.evaluate('HydroTM.map.jumpTo({center:[21.2470,45.7720],zoom:17})'); pg.wait_for_timeout(700)
    c=pg.evaluate('(()=>{const p=HydroTM.map.project([21.2470,45.7720]);return [p.x,p.y]})()')
    pt=pg.evaluate(FREE,c); pg.click('.abar [data-a=add]'); pg.mouse.click(pt[0],pt[1]); pg.wait_for_timeout(900)
    ok(pg.input_value('#af [name=strada]')=='Calea Lipovei' and pg.input_value('#af [name=localitate]')=='Timișoara','strada cea mai apropiată completată automat (Calea Lipovei)')
    ok(pg.evaluate("document.querySelector('#af [name=localitate]').tagName")=='SELECT','localitatea e listă, nu text liber')
    # --- căutare stradă cu prescurtare și fără diacritice
    pg.fill('#af [name=strada]','bd rebrea'); pg.wait_for_timeout(200)
    sugg=pg.locator('#af .sug button').all_inner_texts(); print('   sugestii:',sugg)
    ok(sugg and sugg[0].startswith('Bulevardul Liviu Rebreanu'),'„bd rebrea” → Bulevardul Liviu Rebreanu')
    pg.fill('#af [name=strada]','petofi'); pg.wait_for_timeout(200)
    pg.locator('#af .sug button').first.click(); pg.wait_for_timeout(100)
    ok(pg.input_value('#af [name=strada]')=='Strada Petőfi Sándor' and pg.input_value('#af [name=localitate]')=='Dumbrăvița','stradă din altă localitate → localitatea se schimbă singură')
    pg.screenshot(path=OUT+'/20-sugestii.png')
    # --- text neales din listă → refuzat
    pg.fill('#af [name=strada]','Strada Inexistenta'); pg.wait_for_timeout(100)
    pg.click('#af button[type=submit]'); pg.wait_for_timeout(300)
    ok('Alege strada din listă' in pg.inner_text('#af .fm'),'stradă scrisă și nealeasă din listă → nu se salvează')
    ok('Nicio stradă găsită' in pg.inner_text('#af .sug'),'mesaj „nicio stradă găsită”')
    pg.fill('#af [name=strada]','lipovei'); pg.wait_for_timeout(150); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    pg.fill('#af [name=nr]','12a')
    # --- fotografie: bifă → încărcare
    ok(not pg.locator('#af .fotos').is_visible(),'fără bifă: zona de fotografii ascunsă')
    pg.check('#af [name=foto]'); ok(pg.locator('#af .fotos').is_visible(),'cu bifă: apare „Adaugă fotografie”')
    with pg.expect_file_chooser() as fc: pg.click('#af [data-addf]')
    fc.value.set_files([D+'/poza.jpg',D+'/poza.heic']); pg.wait_for_timeout(5000)
    ok(pg.locator('#af .th').count()==2,f'JPG + HEIC încărcate ({pg.locator("#af .th").count()} miniaturi; eroare: {pg.inner_text("#af .fe")!r})')
    sz=pg.evaluate('''(async()=>{const im=[...document.querySelectorAll('#af .th img')];const out=[];for(const i of im){const b=await (await fetch(i.src)).blob();await i.decode();out.push([b.size,i.naturalWidth,i.naturalHeight,b.type])}return out})()''')
    print('   poze comprimate:',sz)
    ok(sz and sz[0][1]==1600 and sz[0][2]==1067 and sz[0][3]=='image/jpeg','poza mare redusă la 1600 px, JPEG')
    ok(len(sz)>1 and sz[1][3]=='image/jpeg' and sz[1][1]==1200,'HEIC convertit în JPEG')
    pg.screenshot(path=OUT+'/21-foto-form.png')
    pg.click('#af button[type=submit]'); pg.wait_for_timeout(900)
    h=pg.evaluate('HydroTM.getData().surse.at(-1)'); print('   salvat:',h['id'],h['adresa'],h['localitate'],h['poze'])
    ok(h['adresa']=='Calea Lipovei nr. 12A' and h['localitate']=='Timișoara','adresa salvată: „Calea Lipovei nr. 12A”')
    ok(h['poze']==[h['id']+'.jpg',h['id']+'-2.jpg'],'poze denumite după ID')
    ok(pg.locator('.sheet .photo img').count()==2 and pg.evaluate("document.querySelector('.sheet .photo img').src.startsWith('blob:')"),'fișa arată pozele (încă nepublicate)')
    pg.screenshot(path=OUT+'/22-fisa-foto.png')
    nid=h['id']
    # --- reîncărcare: pozele rămân
    pg.reload(); pg.wait_for_timeout(2500)
    pg.evaluate(f'HydroTM.openSheet(HydroTM.byId("{nid}"))'); pg.wait_for_timeout(400)
    ok(pg.evaluate("[...document.querySelectorAll('.sheet .photo img')].every(i=>i.complete&&i.naturalWidth>0)") and pg.locator('.sheet .photo img').count()==2,'pozele rămân după reîncărcare (IndexedDB)')
    # --- publicare cu poze → arhivă
    pg.click('.abar [data-a=pub]'); pg.wait_for_timeout(300)
    ok('2 fotografii' in pg.inner_text('.sheet [data-p]'),'butonul de publicare anunță fotografiile')
    with pg.expect_download() as dl: pg.click('.sheet [data-p]')
    zp=OUT+'/pub.zip'; dl.value.save_as(zp); names=zipfile.ZipFile(zp).namelist(); print('   arhivă:',names)
    ok('hidranti.json' in names and f'poze/{nid}.jpg' in names and f'poze/{nid}-2.jpg' in names,'arhiva conține datele și pozele')
    J=json.loads(zipfile.ZipFile(zp).read('hidranti.json')); ok([x for x in J['surse'] if x['id']==nid][0]['poze']==[nid+'.jpg',nid+'-2.jpg'],'hidranti.json din arhivă are numele pozelor')
    # --- editare: debifez Fotografie → pozele dispar și din fișă
    pg.evaluate(f'HydroTM.openSheet(HydroTM.byId("{nid}"))'); pg.wait_for_timeout(300)
    pg.click('.sheet [data-e]'); pg.wait_for_timeout(500)
    ok(pg.is_checked('#af [name=foto]') and pg.locator('#af .th').count()==2,'la editare: bifa și pozele existente apar')
    ok(pg.input_value('#af [name=strada]')=='Calea Lipovei' and pg.input_value('#af [name=nr]')=='12A','la editare: strada și numărul sunt recunoscute')
    pg.uncheck('#af [name=foto]'); ok(not pg.locator('#af .fotos').is_visible(),'debifat: zona de fotografii dispare')
    pg.click('#af button[type=submit]'); pg.wait_for_timeout(700)
    ok(pg.evaluate(f'HydroTM.byId("{nid}").poze')==[],'pozele scoase din date')
    t=pg.inner_text('.sheet'); ok(pg.locator('.sheet .photo').count()==0 and 'Fără poză' not in t,'fișa nu mai are nicio secțiune de poză')
    # --- hidrant existent din date: adresa e recunoscută
    pg.evaluate('HydroTM.openSheet(HydroTM.getData().surse.find(s=>s.adresa.startsWith("Calea Martirilor 1989")))'); pg.wait_for_timeout(300)
    adr=pg.evaluate('HydroTM.getData().surse.find(s=>s.adresa.startsWith("Calea Martirilor 1989")).adresa')
    pg.click('.sheet [data-e]'); pg.wait_for_timeout(500)
    ok(pg.input_value('#af [name=strada]')=='Calea Martirilor 1989' and pg.input_value('#af [name=nr]')==adr.split('nr. ')[1],f'„{adr}” → stradă + număr corect (cu 1989 în nume)')
    ok(pg.locator('#af .man').is_hidden(),'fără avertisment de adresă manuală')
    # --- „Strada nu e în listă?” → text liber permis
    pg.click('#af [data-man]'); pg.fill('#af [name=strada]','Strada Nouă Din Cartier'); pg.fill('#af [name=nr]','3')
    pg.click('#af button[type=submit]'); pg.wait_for_timeout(600)
    ok(pg.evaluate('HydroTM.getData().surse.some(s=>s.adresa==="Strada Nouă Din Cartier nr. 3")'),'adresă manuală (stradă lipsă din listă) acceptată')
    pg.click('.sheet [data-e]'); pg.wait_for_timeout(400)
    ok(pg.locator('#af .man').is_visible(),'la redeschidere: avertisment „adresă scrisă manual”')
    ok(pg.input_value('#af [name=strada]')=='Strada Nouă Din Cartier' and pg.input_value('#af [name=nr]')=='3','adresa manuală se reîmparte în stradă + număr')
    pg.screenshot(path=OUT+'/23-manual.png')
    pg.click('#af [data-x]')
    # --- utilizator obișnuit: hidrant fără poze nu are secțiune de poză
    ctx2=b.new_context(viewport={'width':412,'height':860}); p2=ctx2.new_page(); p2.goto('http://localhost:8765/index.html'); p2.wait_for_timeout(1500); p2.click('#infoOk')
    p2.evaluate('HydroTM.openSheet(HydroTM.getData().surse.find(s=>!(s.poze||[]).length))'); p2.wait_for_timeout(300)
    ok(p2.locator('.sheet .photo').count()==0 and 'Fără poză' not in p2.inner_text('.sheet'),'utilizator: fișa fără poză nu arată nimic despre poză')
    print('console:',[c for c in cons][:5]); ok(not cons,'fără erori de script')
    b.close()
finally:
  srv.terminate()
  for f in ['strazi.json','strazi-geo.json']:
    try: os.remove(DIST+'/'+f)
    except: pass
print('\nREZULTAT:', 'TOATE OK' if not errs else f'{len(errs)} eșecuri: {errs}')
