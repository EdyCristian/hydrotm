// Build HydroTM: inserează bibliotecile în index.html, construiește admin.js, generează date demo.
// Utilizare: node build.js [--final]   (--final = fără date demo incluse în pagină)
const fs = require('fs'), path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
const FINAL = process.argv.includes('--final');
const VER = new Date().toISOString().slice(0, 16).replace(/\D/g, '');
const out = path.join(__dirname, 'dist'); fs.mkdirSync(out, { recursive: true });

// ---------- date demo (fictive) ----------
function demo() {
  let seed = 42; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const STREETS = [
    ['Piața Victoriei','Timișoara',45.7537,21.2257],['Bulevardul Revoluției din 1989','Timișoara',45.7509,21.2290],
    ['Piața Unirii','Timișoara',45.7580,21.2290],['Bulevardul Cetății','Timișoara',45.7660,21.2235],
    ['Calea Aradului','Timișoara',45.7760,21.2270],['Calea Lipovei','Timișoara',45.7720,21.2470],
    ['Calea Torontalului','Timișoara',45.7660,21.1950],['Calea Șagului','Timișoara',45.7340,21.2050],
    ['Calea Martirilor 1989','Timișoara',45.7250,21.2350],['Calea Girocului','Timișoara',45.7340,21.2310],
    ['Calea Buziașului','Timișoara',45.7330,21.2580],['Bulevardul Liviu Rebreanu','Timișoara',45.7380,21.2420],
    ['Bulevardul Take Ionescu','Timișoara',45.7590,21.2410],['Bulevardul Dâmbovița','Timișoara',45.7440,21.2060],
    ['Calea Circumvalațiunii','Timișoara',45.7620,21.2060],['Strada Gheorghe Lazăr','Timișoara',45.7585,21.2180],
    ['Strada Ion Ionescu de la Brad','Timișoara',45.7850,21.2150],['Bulevardul Iosif Bulbuca','Timișoara',45.7380,21.2270],
    ['Strada Ana Ipătescu','Timișoara',45.7680,21.2600],['Calea Bogdăneștilor','Timișoara',45.7510,21.1950],
    ['Strada Ștefan cel Mare','Dumbrăvița',45.7960,21.2400],['Strada Petőfi Sándor','Dumbrăvița',45.7920,21.2470],
    ['Strada Principală','Giroc',45.6950,21.2360],['Strada Trandafirilor','Moșnița Nouă',45.7240,21.3130],
    ['Strada Victoriei','Ghiroda',45.7660,21.2990],['Strada Principală','Săcălaz',45.7600,21.1150]
  ];
  const PFX = l => l === 'Timișoara' ? 'TM' : l.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  const OBS = ['Lângă stâlpul de iluminat','În fața blocului, pe trotuar','Capac greu, se deschide cu cheia mare','Acces dificil când sunt mașini parcate','Pe spațiul verde, lângă gard','La intersecție, colț nord-est','Marcaj galben pe gard',''];
  const cnt = {}; const id = l => { const p = PFX(l); cnt[p] = (cnt[p] || 0) + 1; return p + '-' + String(cnt[p]).padStart(4, '0'); };
  const surse = [];
  for (const s of STREETS) {
    const n = s[1] === 'Timișoara' ? 6 + Math.floor(rnd() * 5) : 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const r = rnd(), stare = r < .78 ? 'functional' : r < .9 ? 'defect' : 'neverificat';
      surse.push({ id: id(s[1]), localitate: s[1], adresa: s[0] + ' nr. ' + (1 + Math.floor(rnd() * 120)),
        lat: +(s[2] + (rnd() - .5) * .009).toFixed(6), lng: +(s[3] + (rnd() - .5) * .012).toFixed(6),
        tip: rnd() < .55 ? 'h-sup' : 'h-sub', racord: ['A','B','B','C','C'][Math.floor(rnd() * 5)],
        stare, aprox: rnd() < .12, obs: OBS[Math.floor(rnd() * OBS.length)], poze: rnd() < .35 ? ['exemplu.jpg'] : [] });
    }
  }
  const extra = [
    ['Timișoara','Canalul Bega, Splaiul Tudor Vladimirescu',45.7499,21.2232,'nat','functional',true,'Coborâre pe rampa de lângă pod'],
    ['Timișoara','Canalul Bega, Podul Decebal',45.7493,21.2388,'nat','functional',true,'Mal betonat, aspirație de pe pod'],
    ['Timișoara','Canalul Bega, Splaiul Nicolae Titulescu',45.7468,21.2510,'nat','neverificat',false,'Mal înalt, acces doar pe jos'],
    ['Timișoara','Calea Aradului, incintă',45.7810,21.2290,'rez','functional',true,'Bazin 200 m³, poartă cu lacăt'],
    ['Giroc','Strada Principală',45.6968,21.2320,'put','defect',false,'Pompă defectă'],
    ['Dumbrăvița','Strada Ștefan cel Mare, parc',45.7975,21.2425,'nat','functional',true,'Lac în parc']
  ];
  for (const [l, a, lat, lng, tip, stare, acces, obs] of extra)
    surse.push({ id: id(l), localitate: l, adresa: a, lat, lng, tip, racord: '', stare, aprox: false, acces, obs, poze: [] });
  return { versiune: 1, demo: true, actualizat: '2026-11-24', config: {}, strazi: STREETS, surse };
}

const data = demo();
fs.writeFileSync(path.join(out, 'hidranti.json'), JSON.stringify(data));

// ---------- index.html ----------
const ins = (html, mark, code) => { const i = html.indexOf(mark); if (i < 0) throw new Error('lipsește ' + mark); return html.slice(0, i) + code + html.slice(i + mark.length); };
const safe = js => js.replace(/<\/script/gi, '<\\/script');
let html = R('src/index.src.html');
html = ins(html, '/*ML_CSS*/', R('node_modules/maplibre-gl/dist/maplibre-gl.css'));
html = ins(html, '/*ML_JS*/', safe(R('node_modules/maplibre-gl/dist/maplibre-gl.js')));
html = ins(html, '/*SC_JS*/', safe(R('node_modules/supercluster/dist/supercluster.min.js')));
html = ins(html, '/*VER*/', VER);
html = ins(html, '<!--FALLBACK-->', FINAL ? '' : '<script type="application/json" id="fallback">' + safe(JSON.stringify(data)) + '</script>');
fs.writeFileSync(path.join(out, 'index.html'), html);

// ---------- admin.js ----------
const admin = [
  '/* HydroTM admin — se încarcă doar după PIN */',
  R('node_modules/proj4/dist/proj4.js'),
  R('node_modules/xlsx/dist/xlsx.mini.min.js'),
  R('src/admin.src.js')
].join('\n;\n');
fs.writeFileSync(path.join(out, 'admin.js'), admin);
for (const f of ['index.html', 'admin.js', 'hidranti.json'])
  console.log(f.padEnd(14), (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' KB');
