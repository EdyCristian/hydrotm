/* HydroTM — modul de administrare (doar Edy). Se încarcă după PIN. */
(function () {
'use strict';
const A = window.HydroTM, { map, esc, norm, fmtDate, TIPURI, isH, tipL, LBL, BOUNDS } = A;
const sheet = A.sheet;
const clone = o => JSON.parse(JSON.stringify(o));
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const fmtT = t => { const d = new Date(t); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const str = v => String(v ?? '').trim();
const LOC_DEF = ['Timișoara','Dumbrăvița','Giroc','Chișoda','Moșnița Nouă','Moșnița Veche','Ghiroda','Giarmata-Vii','Săcălaz','Sânandrei','Remetea Mare','Utvin','Covaci','Sânmihaiu Român'];

if (window.proj4) proj4.defs('EPSG:3844', '+proj=sterea +lat_0=46 +lon_0=25 +k=0.99975 +x_0=500000 +y_0=500000 +ellps=krass +towgs84=2.329,-147.042,-92.08,-0.309,0.325,0.497,5.69 +units=m +no_defs');

// ---------- stocare locală (IndexedDB, cu rezervă în memorie) ----------
const KV = (() => {
  let p, mem = new Map(), ok = !!window.indexedDB;
  const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('hydrotm-admin', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction('kv', mode); const q = fn(t.objectStore('kv')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  return {
    get: async k => { if (!ok) return mem.get(k); try { return await tx('readonly', s => s.get(k)); } catch (e) { ok = false; return mem.get(k); } },
    del: async k => { mem.delete(k); if (!ok) return; try { await tx('readwrite', s => s.delete(k)); } catch (e) {} },
    set: async (k, v) => { mem.set(k, v); if (!ok) return; try { await tx('readwrite', s => s.put(v, k)); } catch (e) { ok = false; A.errBox('Copia de lucru nu se poate salva pe acest dispozitiv'); } }
  };
})();

let W = null, HIST = [], DIRTY = 0, BASE = '', NOTE = '', lastLoc = 'Timișoara';
const save = () => Promise.all([KV.set('work', { data: W, dirty: DIRTY, base: BASE }), KV.set('hist', HIST.slice(-5000))]);
function hist(e) { e.t = Date.now(); HIST.push(e); }
function commit() { DIRTY++; A.setData(W); save(); updBar(); }

// ---------- câmpuri, diferențe ----------
const FL = { tip: 'tip', localitate: 'localitate', adresa: 'adresă', stare: 'stare', racord: 'racord', acces: 'acces autospecială', aprox: 'locație aproximativă', obs: 'observații', poze: 'poze' };
const fv = (f, v, s) => f === 'stare' ? (LBL[v] || v || '').toLowerCase() : f === 'tip' ? (TIPURI[v] || TIPURI.h).l : f === 'aprox' ? (v ? 'da' : 'nu') : f === 'acces' ? (v === true ? 'da' : v === false ? 'nu' : '—') : f === 'poze' ? (v || []).join(', ') : str(v);
const dist = (a, b) => { const R = 6371000, r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) / 2 * r), y = (b.lat - a.lat) * r; return Math.sqrt(x * x + y * y) * R; };
function diff(a, b) {
  const ch = [];
  for (const f of Object.keys(FL)) { const x = fv(f, a[f]), y = fv(f, b[f]); if (x !== y) ch.push([FL[f], x, y]); }
  const d = dist(a, b); if (d > 0.5) ch.push(['poziție', '', 'mutat cu ' + (d < 10 ? d.toFixed(1) : Math.round(d)) + ' m']);
  return ch;
}
const chTxt = ch => ch.map(([f, a, b]) => f === 'poziție' ? b : `${f} ${a || '—'} → ${b || '—'}`).join('; ');
const entryTxt = e => e.txt || (e.id + ': ' + chTxt(e.ch || []));

// ---------- ID-uri ----------
const PFX = l => norm(l) === 'timisoara' ? 'TM' : (norm(l).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase() || 'XX');
const normId = v => { const s = str(v).toUpperCase().replace(/\s+/g, ''); const m = /^([A-Z]{1,4})[-_.]?(\d{1,6})$/.exec(s); return m ? m[1] + '-' + m[2].padStart(4, '0') : s; };
function genId(loc, list, extra) {
  const p = PFX(loc), re = new RegExp('^' + p + '-(\\d+)$'); let mx = 0;
  for (const s of list) { const m = re.exec(s.id); if (m) mx = Math.max(mx, +m[1]); }
  if (extra) for (const id of extra) { const m = re.exec(id); if (m) mx = Math.max(mx, +m[1]); }
  return p + '-' + String(mx + 1).padStart(4, '0');
}
const locCanon = () => { const m = new Map(); for (const l of LOC_DEF) m.set(norm(l), l); for (const s of W.surse) if (s.localitate) m.set(norm(s.localitate), s.localitate); return m; };

// ---------- stil ----------
document.head.insertAdjacentHTML('beforeend', `<style>
.abar{pointer-events:auto;max-width:560px;margin-top:6px;display:flex;gap:5px;align-items:center;background:var(--panel);border-radius:14px;box-shadow:var(--shadow);padding:6px;overflow-x:auto;scrollbar-width:none}
.abar::-webkit-scrollbar{display:none}
.abar .tag{flex:none;background:var(--red);color:#fff;font-weight:800;font-size:12px;letter-spacing:.06em;padding:6px 8px;border-radius:8px}
.abar button{flex:1 0 auto;justify-content:center;height:40px;border:0;border-radius:10px;background:var(--soft);color:var(--ink);font-weight:600;font-size:14px;padding:0 8px;cursor:pointer;display:flex;align-items:center;gap:5px;white-space:nowrap}
@media (max-width:520px){.abar .tag{display:none}}
.top [hidden],.sheet [hidden]{display:none!important}
.abar .pend{background:var(--red);color:#fff;border-radius:999px;font-size:12px;min-width:20px;height:20px;display:inline-grid;place-items:center;padding:0 6px}
.pickbar{pointer-events:auto;max-width:560px;margin-top:6px;background:#ffd400;color:#111;border:2px solid var(--red);border-radius:12px;padding:6px 6px 6px 12px;font-weight:700;display:flex;align-items:center;gap:8px}
.pickbar button{margin-left:auto;height:38px;border:0;border-radius:8px;background:#111;color:#fff;font-weight:700;padding:0 12px;cursor:pointer}
.af [hidden]{display:none!important}
.af label{display:block;font-size:13px;color:var(--muted);font-weight:600;margin-top:10px}
.af input,.af select,.af textarea{display:block;width:100%;margin-top:4px;height:44px;border:0;border-radius:10px;background:var(--soft);color:var(--ink);font:inherit;font-size:16px;padding:0 10px}
.af textarea{height:auto;padding:10px;resize:vertical}
.af input:focus,.af select:focus,.af textarea:focus{outline:none;box-shadow:0 0 0 2px var(--red) inset}
.af .chk{display:flex;align-items:center;gap:10px;font-size:15px;color:var(--ink);margin-top:14px}
.af .chk input{width:22px;height:22px;margin:0;flex:none}
.af .ll{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hint{font-size:13px;color:var(--muted);margin:8px 0 0}
.sug{margin-top:4px;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;max-height:260px;overflow-y:auto}
.sug button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;color:var(--ink);font-size:15px;padding:10px 12px;min-height:48px;cursor:pointer}
.sug button:last-child{border-bottom:0}.sug button:hover,.sug button:focus{background:var(--soft);outline:none}
.sug small{display:block;color:var(--muted);font-size:12px}.sug .empty{padding:12px;font-size:14px}
.near{background:var(--soft);border-radius:10px;padding:8px 10px}.man{color:#9a6b00}
@media (prefers-color-scheme:dark){.man{color:#f2b705}}
.thumbs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 0}
.th{position:relative;width:96px;height:72px;border-radius:10px;overflow:hidden;background:var(--soft)}
.th img{width:100%;height:100%;object-fit:cover}
.th button{position:absolute;top:4px;right:4px;width:28px;height:28px;border-radius:50%;border:0;background:rgba(0,0,0,.65);color:#fff;font-size:18px;line-height:1;cursor:pointer}
.lnk{border:0;background:none;color:var(--red);font:inherit;font-weight:700;padding:0;text-decoration:underline;cursor:pointer}
@media (prefers-color-scheme:dark){.lnk{color:#ff6b6d}}
.adm-row{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.abtn{flex:1;min-width:120px;min-height:48px;border:0;border-radius:12px;background:var(--soft);color:var(--ink);font-weight:700;font-size:15px;cursor:pointer;padding:6px 12px}
.abtn.pri{background:var(--red);color:#fff}.abtn.danger{color:var(--bad)}.abtn.armed{background:var(--bad);color:#fff}
.abtn:disabled{opacity:.5;cursor:default}
.ferr{color:var(--bad);font-size:14px;margin-top:8px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}
.stats div{background:var(--soft);border-radius:10px;padding:8px 4px;text-align:center}
.stats b{display:block;font-size:22px}.stats small{color:var(--muted);font-size:12px}
.stats .e b{color:var(--bad)}
.rep p{font-size:14px;margin:8px 0 0}
.rep details{margin-top:10px;background:var(--soft);border-radius:10px;padding:8px 12px}
.rep summary{font-weight:700;cursor:pointer;font-size:15px}
.rep ul{margin:6px 0 2px;padding-left:18px;font-size:14px;max-height:220px;overflow:auto}
.rep li{margin:2px 0}
.hfilter{display:block;width:100%;height:44px;border:0;border-radius:10px;background:var(--soft);color:var(--ink);font-size:16px;padding:0 10px;margin-top:12px}
.hlist{list-style:none;margin:8px 0 0;padding:0}
.hlist li{border-bottom:1px solid var(--line);padding:8px 0;font-size:14px}
.hlist time{display:block;color:var(--muted);font-size:12px}
.hlist details{font-size:13px;color:var(--muted)}
.hlist details ul{margin:4px 0 0;padding-left:18px;max-height:200px;overflow:auto}
.note{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--soft);font-size:14px}
.note.w{background:rgba(242,183,5,.16);border:1px solid rgba(242,183,5,.5)}
.sec{margin-top:18px;padding-top:12px;border-top:1px solid var(--line)}
.sec h4{margin:0 0 4px;font-size:15px}
@media (min-width:760px){body.adm .sheet{max-height:calc(100vh - 190px)}}
</style>`);

// ---------- bara de admin ----------
const top = document.querySelector('.top');
const bar = document.createElement('div'); bar.className = 'abar';
bar.innerHTML = `<span class="tag">ADMIN</span><button data-a="imp">Import</button><button data-a="add">+ Adaugă</button><button data-a="hist">Istoric</button><button data-a="pub">Publică <span class="pend" hidden></span></button><button data-a="out">Ieșire</button>`;
const pickbar = document.createElement('div'); pickbar.className = 'pickbar'; pickbar.hidden = true;
pickbar.innerHTML = `<span id="pickTxt">Atinge harta în locul sursei</span><button type="button">Anulează</button>`;
bar.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  ({ imp: pickFile, add: startAdd, hist: showHist, pub: showPub, out: exitAdmin })[b.dataset.a]();
});
function updBar() { const p = bar.querySelector('.pend'); p.hidden = !DIRTY; p.textContent = DIRTY; }

// ---------- panou (folosește fișa existentă) ----------
let formOpen = false;
function panel(html) {
  endPick(); clearTmp(); formOpen = false;
  A.closeSheet();
  sheet.innerHTML = '<div class="grab"></div>' + html;
  sheet.classList.add('open'); A.sheetLock = true; sheet.scrollTop = 0;
  sheet.querySelectorAll('[data-x]').forEach(b => b.onclick = closePanel);
}
function closePanel() { endPick(); clearTmp(); formOpen = false; A.closeSheet(); }
const head = (t, sub) => `<div class="sh-head"><div><h2>${t}</h2>${sub ? `<p class="addr">${sub}</p>` : ''}</div><button class="x" data-x aria-label="Închide">×</button></div>`;
function arm(btn, txt, fn) {
  if (btn.dataset.armed) { fn(); return; }
  const old = btn.textContent; btn.dataset.armed = 1; btn.classList.add('armed'); btn.textContent = txt;
  setTimeout(() => { if (!btn.isConnected) return; delete btn.dataset.armed; btn.classList.remove('armed'); btn.textContent = old; }, 4000);
}
A.onEsc = () => { if (A.pick) { const f = formOpen; endPick(); if (!f) return true; sheet.classList.add('open'); return true; } if (A.sheetLock) { closePanel(); return true; } return false; };

// butoane în fișa hidrantului
A.onSheet = (h, el) => {
  el.insertAdjacentHTML('beforeend', `<div class="adm-row"><button class="abtn" data-e>Editează</button><button class="abtn danger" data-d>Șterge</button></div>`);
  el.querySelector('[data-e]').onclick = () => openForm(A.byId(h.id));
  el.querySelector('[data-d]').onclick = e => arm(e.currentTarget, 'Apasă din nou: șterge ' + h.id, () => del(h.id));
};

// ---------- alegere punct pe hartă ----------
let tmpMk = null, onTmp = null;
function setTmp(ll) {
  if (!tmpMk) { tmpMk = new maplibregl.Marker({ draggable: true, color: '#b3161b' }).setLngLat(ll).addTo(map); tmpMk.on('dragend', () => onTmp && onTmp(tmpMk.getLngLat())); }
  else tmpMk.setLngLat(ll);
}
function clearTmp() { if (tmpMk) { tmpMk.remove(); tmpMk = null; } onTmp = null; }
function beginPick(txt, fn) {
  pickbar.querySelector('#pickTxt').textContent = txt; pickbar.hidden = false;
  map.getCanvas().style.cursor = 'crosshair';
  A.pick = ll => { endPick(); fn(ll); };
}
function endPick() { A.pick = null; pickbar.hidden = true; map.getCanvas().style.cursor = ''; }
pickbar.querySelector('button').onclick = () => { const f = formOpen; endPick(); if (f) sheet.classList.add('open'); };
function startAdd() {
  closePanel();
  beginPick('Atinge harta în locul sursei noi', ll => openForm(null, ll));
}

// ---------- străzi: căutare, potrivire adresă, cea mai apropiată stradă ----------
const ABR = { bd: 'bulevardul', 'b-dul': 'bulevardul', bdul: 'bulevardul', blv: 'bulevardul', str: 'strada', cal: 'calea', al: 'aleea', pta: 'piata', 'p-ta': 'piata', pt: 'piata', spl: 'splaiul', intr: 'intrarea', sos: 'soseaua', 'sos.': 'soseaua' };
const qWords = t => norm(t).split(' ').filter(Boolean).map(w => ABR[w] || w);
const TYPEW = /^(strada|bulevardul|calea|aleea|piata|splaiul|intrarea|soseaua|drumul|pasajul|fundatura|ulita|podul|piateta)\s+/;
const core = s => s.kn.replace(TYPEW, '');
function findStreets(q, loc, lim = 8) {
  const w = qWords(q); if (!w.length) return [];
  const L = A.streets().filter(s => w.every(x => s.k.includes(x)));
  const w0 = w.find(x => !Object.values(ABR).includes(x)) || w[0];
  return L.map(s => [s, (s.l === loc ? 0 : 2) + (core(s).startsWith(w0) || s.kn.startsWith(w0) ? 0 : 1)])
    .sort((a, b) => a[1] - b[1] || a[0].n.length - b[0].n.length || a[0].n.localeCompare(b[0].n, 'ro')).slice(0, lim).map(x => x[0]);
}
function parseAddr(a, loc) {
  const t = norm(a); if (!t) return { s: null, nr: '' };
  const cand = A.streets().filter(s => s.l === loc).sort((x, y) => y.kn.length - x.kn.length);
  const rest = r => r.trim().replace(/^(nr|numarul)\s*/, '').trim();
  for (const s of cand) if (t === s.kn || t.startsWith(s.kn + ' ')) return { s, nr: rest(t.slice(s.kn.length)).toUpperCase() };
  const m = /^(.*?)(?:\s+(?:nr|numarul))?\s+(\d+\s*[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?)$/.exec(t);
  const st = m ? m[1] : t, nr = m ? m[2].replace(/\s+/g, '').toUpperCase() : '';
  const w = qWords(st); const f = cand.filter(s => w.every(x => s.k.includes(x)));
  return f.length === 1 ? { s: f[0], nr } : { s: null, nr };
}
A.parseAddr = parseAddr;
let GEO = null;
async function loadGeo() {
  if (GEO !== null) return GEO;
  GEO = false;
  try { const r = await fetch('strazi-geo.json', { cache: 'no-cache' }); if (r.ok) GEO = (await r.json()).g; } catch (e) {}
  return GEO;
}
function nearestStreet(ll) {
  const L = A.streets(); if (!L.length) return null;
  const kx = Math.cos(ll.lat * Math.PI / 180) * 111320, ky = 110540, px = ll.lng * kx, py = ll.lat * ky;
  let best = null, bd = Infinity;
  for (const s of L) {
    const lines = GEO && GEO[s.i];
    if (lines && lines.length) {
      if (Math.abs(s.lat - ll.lat) > 0.06 || Math.abs(s.lng - ll.lng) > 0.08) continue;
      for (const l of lines) for (let i = 2; i < l.length; i += 2) {
        const ax = l[i - 2] * kx, ay = l[i - 1] * ky, bx = l[i] * kx, by = l[i + 1] * ky, dx = bx - ax, dy = by - ay, LL = dx * dx + dy * dy;
        let t = LL ? ((px - ax) * dx + (py - ay) * dy) / LL : 0; t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(px - ax - t * dx, py - ay - t * dy); if (d < bd) { bd = d; best = s; }
      }
    } else { const d = Math.hypot(s.lng * kx - px, s.lat * ky - py); if (d < bd) { bd = d; best = s; } }
  }
  return best ? { s: best, d: bd, exact: !!GEO } : null;
}

// ---------- fotografii ----------
const FOTO_MAX = 3;
let FIDX = {}; const FURL = new Map();
A.photoUrl = n => FURL.get(n) || 'poze/' + encodeURIComponent(n);
const saveFidx = () => KV.set('fotoIdx', FIDX);
async function loadHeic() {
  if (window.heic2any) return;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'heic.js'; s.onload = res; s.onerror = () => rej(new Error('Nu s-a putut încărca convertorul HEIC')); document.head.appendChild(s); });
}
async function compress(file) {
  const heic = /hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  let bmp = null;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {}
  if (!bmp && heic) {
    await loadHeic();
    let out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }); if (Array.isArray(out)) out = out[0];
    bmp = await createImageBitmap(out, { imageOrientation: 'from-image' });
  }
  if (!bmp) throw new Error('Formatul imaginii nu este recunoscut');
  const M = 1600, k = Math.min(1, M / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.75));
  if (!b) throw new Error('Imaginea nu a putut fi comprimată');
  return b;
}
async function dropPhoto(n) { if (!FIDX[n]) return; delete FIDX[n]; const u = FURL.get(n); if (u) URL.revokeObjectURL(u); FURL.delete(n); await KV.del('foto:' + n); await saveFidx(); }

// ---------- formular adăugare / editare ----------
function openForm(h, ll) {
  const isNew = !h;
  const s = h ? clone(h) : { id: '', localitate: lastLoc, adresa: '', lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6), tip: 'h-sub', racord: '', stare: 'neverificat', aprox: false, acces: null, obs: '', poze: [] };
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
  const rac = ['', 'A', 'B', 'C']; if (s.racord && !rac.includes(s.racord)) rac.push(s.racord);
  const locs = [...new Set([...A.streetLocs(), ...locCanon().values()])].sort((a, b) => a.localeCompare(b, 'ro'));
  if (s.localitate && !locs.includes(s.localitate)) locs.push(s.localitate);
  const pa = parseAddr(s.adresa, s.localitate);
  let picked = pa.s, manual = !pa.s && !!s.adresa, auto = isNew;
  let manSt = s.adresa, manNr = '';
  if (manual) { const m = /^(.*?)(?:,?\s*(?:nr\.?|numărul|numarul)\s*|\s+)(\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+[a-zA-Z]?)?)\s*$/i.exec(s.adresa); if (m) { manSt = m[1].replace(/[,\s]+$/, ''); manNr = m[2].replace(/\s+/g, '').toUpperCase(); } }
  const fotos = (s.poze || []).map(n => ({ n }));
  panel(head(isNew ? 'Sursă nouă' : esc(s.id), isNew ? 'ID-ul se generează la salvare' : 'Editare') + `
  <form class="af" id="af" novalidate>
    <label>Tip<select name="tip">${Object.entries(TIPURI).map(([k, v]) => opt(k, v.l, s.tip)).join('')}</select></label>
    <label>Localitate<select name="localitate">${locs.map(l => opt(l, l, s.localitate)).join('')}</select></label>
    <label>Stradă<input name="strada" value="${esc(picked ? picked.n : manSt)}" placeholder="Începe să scrii numele străzii" autocomplete="off" spellcheck="false"></label>
    <div class="sug" role="listbox" hidden></div>
    <div class="hint near" hidden></div>
    <div class="hint man" ${manual ? '' : 'hidden'}>⚠ Adresă scrisă manual, nu e din listă. <button type="button" class="lnk" data-unman>Alege din listă</button></div>
    <div class="ll"><label>Număr<input name="nr" value="${esc(picked ? pa.nr : manNr)}" placeholder="ex. 12A" maxlength="12" autocomplete="off"></label>
      <label>Stare<select name="stare">${['functional', 'defect', 'neverificat'].map(k => opt(k, LBL[k], s.stare)).join('')}</select></label></div>
    <p class="hint"><button type="button" class="lnk" data-man>Strada nu e în listă?</button></p>
    <label data-h>Racord<select name="racord">${rac.map(v => opt(v, v || '—', s.racord)).join('')}</select></label>
    <label data-s>Acces autospecială<select name="acces">${opt('', '—', s.acces == null ? '' : 'x')}${opt('da', 'Da', s.acces === true ? 'da' : '')}${opt('nu', 'Nu', s.acces === false ? 'nu' : '')}</select></label>
    <label class="chk"><input type="checkbox" name="aprox"${s.aprox ? ' checked' : ''}> Locație aproximativă</label>
    <label class="chk"><input type="checkbox" name="foto"${fotos.length ? ' checked' : ''}> Fotografie</label>
    <div class="fotos" hidden><div class="thumbs"></div>
      <button type="button" class="abtn" data-addf>+ Adaugă fotografie</button>
      <p class="hint">Maxim ${FOTO_MAX}. Se comprimă automat (și cele HEIC de pe iPhone).</p><div class="ferr fe"></div></div>
    <div class="ll"><label>Latitudine<input name="lat" inputmode="decimal" value="${s.lat}"></label><label>Longitudine<input name="lng" inputmode="decimal" value="${s.lng}"></label></div>
    <p class="hint">Trage pinul roșu de pe hartă pentru poziția exactă sau <button type="button" class="lnk" data-pick>alege alt loc pe hartă</button>.</p>
    <label>Observații<textarea name="obs" rows="2">${esc(s.obs)}</textarea></label>
    <div class="ferr fm" role="alert"></div>
    <div class="adm-row"><button class="abtn pri" type="submit">Salvează</button><button class="abtn" type="button" data-x>Anulează</button></div>
  </form>`);
  formOpen = true;
  const f = sheet.querySelector('#af'), err = f.querySelector('.fm'), sug = f.querySelector('.sug'), near = f.querySelector('.near'), man = f.querySelector('.man');
  const tipSync = () => { const H = !!(TIPURI[f.tip.value] || TIPURI.h).h; f.querySelector('[data-h]').hidden = !H; f.querySelector('[data-s]').hidden = H; };
  f.tip.onchange = tipSync; tipSync();
  // stradă cu sugestii
  const pick = st => {
    picked = st; manual = false; man.hidden = true; sug.hidden = true;
    f.strada.value = st.n; if (f.localitate.value !== st.l) { if (![...f.localitate.options].some(o => o.value === st.l)) f.localitate.add(new Option(st.l, st.l)); f.localitate.value = st.l; }
  };
  const showSug = () => {
    if (manual) { sug.hidden = true; return; }
    const L = findStreets(f.strada.value, f.localitate.value);
    if (!f.strada.value.trim()) { sug.hidden = true; return; }
    sug.innerHTML = L.length ? L.map((st, i) => `<button type="button" data-i="${i}">${esc(st.n)}<small>${esc(st.l)}</small></button>`).join('')
      : `<div class="empty">Nicio stradă găsită. Încearcă doar o parte din nume.</div>`;
    sug.hidden = false; sug._L = L;
  };
  f.strada.addEventListener('input', () => { auto = false; if (!manual) picked = null; showSug(); });
  f.strada.addEventListener('focus', () => { if (!picked) showSug(); });
  f.strada.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const b = sug.querySelector('button'); if (b && !sug.hidden) b.click(); } });
  sug.addEventListener('mousedown', e => e.preventDefault());
  sug.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; auto = false; pick(sug._L[+b.dataset.i]); f.nr.focus(); });
  f.localitate.onchange = () => { if (picked && picked.l !== f.localitate.value) { picked = null; f.strada.value = ''; } auto = false; };
  f.querySelector('[data-man]').onclick = () => { manual = true; picked = null; auto = false; man.hidden = false; sug.hidden = true; f.strada.focus(); };
  f.querySelector('[data-unman]').onclick = () => { manual = false; man.hidden = true; showSug(); f.strada.focus(); };
  // cea mai apropiată stradă de pin
  const nearUpd = async p => {
    await A.streetsReady; await loadGeo();
    const r = nearestStreet(p); if (!r) { near.hidden = true; return; }
    const dm = Math.round(r.d);
    if (auto && !manual && (r.exact ? dm < 150 : dm < 400)) { pick(r.s); near.hidden = true; return; }
    if (picked && picked.i === r.s.i) { near.hidden = true; return; }
    near.innerHTML = `Cea mai apropiată stradă de pin: <b>${esc(r.s.n)}</b>, ${esc(r.s.l)} (${dm} m) <button type="button" class="lnk">Folosește</button>`;
    near.hidden = false; near.querySelector('button').onclick = () => { pick(r.s); near.hidden = true; };
  };
  // poziție
  const setLL = p => { f.lat.value = (+p.lat).toFixed(6); f.lng.value = (+p.lng).toFixed(6); nearUpd(p); };
  const llNow = () => ({ lat: parseFloat(String(f.lat.value).replace(',', '.')), lng: parseFloat(String(f.lng.value).replace(',', '.')) });
  setTmp([s.lng, s.lat]); onTmp = setLL;
  const onLL = () => { const p = llNow(); if (isFinite(p.lat) && isFinite(p.lng)) { setTmp([p.lng, p.lat]); nearUpd(p); } };
  f.lat.onchange = onLL; f.lng.onchange = onLL;
  f.querySelector('[data-pick]').onclick = () => {
    sheet.classList.remove('open');
    beginPick('Atinge harta în noul loc', p => { setLL(p); setTmp(p); sheet.classList.add('open'); });
  };
  if (innerWidth < 760) map.easeTo({ center: [s.lng, s.lat], offset: [0, -innerHeight * 0.3], duration: 400 });
  nearUpd({ lat: s.lat, lng: s.lng });
  // fotografii
  const fbox = f.querySelector('.fotos'), thumbs = f.querySelector('.thumbs'), ferr = f.querySelector('.fe'), addf = f.querySelector('[data-addf]');
  const fsync = () => {
    fbox.hidden = !f.foto.checked;
    thumbs.innerHTML = fotos.map((x, i) => `<div class="th"><img src="${esc(x.url || (W.demo && !FURL.has(x.n) ? '' : A.photoUrl(x.n)))}" alt=""><button type="button" data-rm="${i}" aria-label="Șterge fotografia">×</button></div>`).join('');
    addf.disabled = fotos.length >= FOTO_MAX;
  };
  thumbs.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; const x = fotos.splice(+b.dataset.rm, 1)[0]; if (x.url) URL.revokeObjectURL(x.url); fsync(); });
  f.foto.onchange = fsync; fsync();
  addf.onclick = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,.heic,.heif'; i.multiple = true;
    i.onchange = async () => {
      ferr.textContent = ''; addf.disabled = true; const old = addf.textContent; addf.textContent = 'Se comprimă…';
      for (const file of [...i.files].slice(0, FOTO_MAX - fotos.length)) {
        try { const b = await compress(file); fotos.push({ blob: b, url: URL.createObjectURL(b) }); }
        catch (e) { ferr.textContent = (file.name || 'Imaginea') + ': ' + (e.message || e); }
      }
      addf.textContent = old; fsync();
    };
    i.click();
  };
  A.adminAddPhoto = async blob => { fotos.push({ blob, url: URL.createObjectURL(blob) }); fsync(); }; // pentru teste
  f.onsubmit = async e => {
    e.preventDefault(); err.textContent = '';
    const p = llNow();
    if (!(isFinite(p.lat) && isFinite(p.lng))) { err.textContent = 'Coordonatele nu sunt valide.'; return; }
    if (p.lng < BOUNDS[0][0] || p.lng > BOUNDS[1][0] || p.lat < BOUNDS[0][1] || p.lat > BOUNDS[1][1]) { err.textContent = 'Punctul e în afara zonei hărții.'; return; }
    const loc = f.localitate.value;
    const stTxt = str(f.strada.value), nr = str(f.nr.value).toUpperCase();
    if (stTxt && !picked && !manual) { err.textContent = 'Alege strada din listă (sau „Strada nu e în listă?”).'; f.strada.focus(); showSug(); return; }
    if (!stTxt && nr) { err.textContent = 'Ai completat numărul, dar nu și strada.'; return; }
    const adresa = (picked ? picked.n : stTxt) + (stTxt && nr ? ' nr. ' + nr : '');
    const tip = f.tip.value, H = !!(TIPURI[tip] || TIPURI.h).h;
    const n = Object.assign({}, s, {
      tip, localitate: loc, adresa, stare: f.stare.value,
      racord: H ? f.racord.value : '', acces: H ? null : (f.acces.value === 'da' ? true : f.acces.value === 'nu' ? false : null),
      aprox: f.aprox.checked, obs: str(f.obs.value), lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6)
    });
    if (isNew) n.id = genId(loc, W.surse);
    // fotografii: nume după ID (TM-0001.jpg, TM-0001-2.jpg, TM-0001-3.jpg)
    const keep = f.foto.checked ? fotos : [];
    const used = new Set(keep.filter(x => x.n).map(x => x.n)), names = [];
    for (const x of keep) {
      if (x.n) { names.push(x.n); continue; }
      let k = 1, nm; do { nm = n.id + (k > 1 ? '-' + k : '') + '.jpg'; k++; } while (used.has(nm)); used.add(nm);
      await KV.set('foto:' + nm, x.blob); FIDX[nm] = { pend: 1 }; FURL.set(nm, x.url); x.url = null; names.push(nm);
    }
    for (const old of s.poze || []) if (!names.includes(old) && FIDX[old] && FIDX[old].pend) await dropPhoto(old);
    await saveFidx();
    n.poze = names;
    lastLoc = loc;
    if (isNew) {
      W.surse.push(n);
      hist({ tip: 'add', id: n.id, txt: `${n.id}: adăugat (${tipL(n)}, ${n.adresa || 'fără adresă'}, ${n.localitate}, ${(LBL[n.stare] || '').toLowerCase()}${names.length ? ', ' + names.length + ' foto' : ''})` });
    } else {
      const old = A.byId(s.id), ch = diff(old, n);
      if (!ch.length) { closePanel(); A.openSheet(old); return; }
      W.surse[W.surse.findIndex(x => x.id === s.id)] = n;
      hist({ tip: 'edit', id: n.id, ch });
    }
    closePanel(); commit();
    const h2 = A.byId(n.id); if (h2) A.openSheet(h2);
  };
}

function del(id) {
  const s = A.byId(id); if (!s) return;
  for (const n of s.poze || []) if (FIDX[n] && FIDX[n].pend) dropPhoto(n);
  W.surse = W.surse.filter(x => x.id !== id);
  hist({ tip: 'del', id, txt: `${id}: șters (${tipL(s)}, ${s.adresa || 'fără adresă'}, ${s.localitate})` });
  closePanel(); commit();
}

// ---------- istoric ----------
function showHist() {
  panel(head('Istoric', 'Importuri și modificări · vizibil doar pentru admin') + `
  <input class="hfilter" type="search" placeholder="Filtrează după ID sau text" aria-label="Filtrează istoricul">
  <ul class="hlist"></ul>
  <div class="adm-row"><button class="abtn" data-dl>Descarcă istoricul (Excel)</button></div>`);
  const ul = sheet.querySelector('.hlist'), fi = sheet.querySelector('.hfilter');
  const render = () => {
    const t = norm(fi.value), L = [];
    for (let i = HIST.length - 1; i >= 0 && L.length < 300; i--) {
      const e = HIST[i], tx = entryTxt(e);
      if (t && !norm(tx + ' ' + (e.det || []).join(' ')).includes(t)) continue;
      L.push(`<li><time>${fmtT(e.t)}</time>${esc(tx)}${e.det && e.det.length ? `<details><summary>Detalii (${e.det.length})</summary><ul>${e.det.slice(0, 2000).map(d => `<li>${esc(d)}</li>`).join('')}</ul></details>` : ''}</li>`);
    }
    ul.innerHTML = L.join('') || '<li style="color:var(--muted)">Nicio înregistrare.</li>';
  };
  fi.oninput = render; render();
  sheet.querySelector('[data-dl]').onclick = () => {
    const rows = [['Data și ora', 'Tip', 'ID', 'Modificare']];
    const TT = { add: 'adăugare', edit: 'modificare', del: 'ștergere', import: 'import', publish: 'publicare', clear: 'ștergere totală', pin: 'PIN' };
    for (const e of HIST) { rows.push([fmtT(e.t), TT[e.tip] || e.tip, e.id || '', entryTxt(e)]); for (const d of e.det || []) rows.push([fmtT(e.t), TT[e.tip] || e.tip, (d.match(/^[A-Z]{1,4}-\d+/) || [''])[0], d]); }
    const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [{ wch: 17 }, { wch: 14 }, { wch: 10 }, { wch: 90 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Istoric'); XLSX.writeFile(wb, 'HydroTM-istoric-' + today() + '.xlsx');
  };
}

// ---------- publicare ----------
function download(name, data, type) {
  const b = new Blob([data], { type }), u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}
const TIP_X = { 'h-sub': 'Hidrant subteran', 'h-sup': 'Hidrant suprateran', h: 'Hidrant', nat: 'Sursă naturală', rez: 'Rezervor/bazin', put: 'Puț/fântână' };
function exportExcel() {
  const rows = [['ID', 'Localitate', 'Adresă', 'Latitudine', 'Longitudine', 'Tip', 'Racord', 'Stare', 'Locație aproximativă', 'Acces autospecială', 'Observații', 'Poze']];
  for (const s of [...W.surse].sort((a, b) => a.id.localeCompare(b.id, 'ro', { numeric: true })))
    rows.push([s.id, s.localitate, s.adresa, s.lat, s.lng, TIP_X[s.tip] || 'Hidrant', s.racord || '', (LBL[s.stare] || 'Neverificat').toLowerCase(), s.aprox ? 'da' : '', isH(s) ? '' : (s.acces === true ? 'da' : s.acces === false ? 'nu' : ''), s.obs || '', (s.poze || []).join(', ')]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [10, 14, 34, 11, 11, 18, 8, 12, 10, 10, 40, 20].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Surse de apă');
  XLSX.writeFile(wb, 'HydroTM-surse-' + today() + '.xlsx');
}
function showPub() {
  const nH = W.surse.filter(isH).length, nS = W.surse.length - nH;
  panel(head('Publicare', `${W.surse.length} surse · ${nH} hidranți, ${nS} alte surse`) + `
  ${NOTE ? `<div class="note w">${esc(NOTE)}</div>` : ''}
  ${W.demo ? '<div class="note w">Datele de acum sunt fictive (preview). La primul import poți șterge întâi toate sursele.</div>' : ''}
  <div class="note">Modificări nepublicate: <b data-dirty>${DIRTY}</b><br>Ultima publicare: <b>${BASE ? fmtT(BASE) : '—'}</b></div>
  <div class="adm-row"><button class="abtn pri" data-p>Publică: descarcă hidranti.json</button></div>
  <div class="pubok"></div>
  <div class="adm-row"><button class="abtn" data-x2>Descarcă Excel complet</button></div>
  <p class="hint">Excelul complet are aceleași coloane ca la import. Îl poți păstra ca Excel principal.</p>
  <div class="sec"><h4>PIN de administrare</h4><p class="hint">PIN-ul nou intră în vigoare pe toate telefoanele după publicare.</p>
   <div class="adm-row"><button class="abtn" data-pin>Schimbă PIN-ul</button></div><div class="pinf"></div></div>
  <div class="sec"><h4>Zonă periculoasă</h4>
   <div class="adm-row"><button class="abtn danger" data-clr>Șterge toate sursele</button></div></div>`);
  const pend = () => Object.keys(FIDX).filter(n => FIDX[n].pend && W.surse.some(x => (x.poze || []).includes(n)));
  if (pend().length) sheet.querySelector('[data-p]').textContent = `Publică: descarcă arhiva (date + ${pend().length} fotografii)`;
  sheet.querySelector('[data-p]').onclick = async () => {
    W.actualizat = today(); W.publicat = new Date().toISOString(); W.versiune = 1;
    const out = clone(W), P = pend(), json = JSON.stringify(out);
    if (P.length) {
      const files = { 'hidranti.json': fflate.strToU8(json) };
      for (const n of P) { const b = await KV.get('foto:' + n); if (b) files['poze/' + n] = new Uint8Array(await b.arrayBuffer()); }
      const z = fflate.zipSync(files, { level: 0 });
      download('HydroTM-publicare-' + today() + '.zip', z, 'application/zip');
      for (const n of P) FIDX[n].pend = 0; saveFidx();
    } else download('hidranti.json', json, 'application/json');
    hist({ tip: 'publish', txt: `Publicare: hidranti.json cu ${W.surse.length} surse, ${DIRTY} modificări` });
    DIRTY = 0; BASE = W.publicat; NOTE = ''; A.setData(W); save(); updBar();
    sheet.querySelector('.pubok').innerHTML = P.length
      ? `<div class="note">Arhiva cu <b>hidranti.json</b> și <b>${P.length} fotografii</b> (folderul <b>poze</b>) a fost descărcată. Trimite-o lui Claude sau urc-o pe GitHub, în locul fișierelor vechi.</div>`
      : `<div class="note">Fișierul <b>hidranti.json</b> a fost descărcat. Urcă-l pe găzduire, lângă aplicație, în locul celui vechi. Telefoanele colegilor îl iau automat când au semnal.</div>`;
    sheet.querySelector('[data-dirty]').textContent = '0';
  };
  sheet.querySelector('[data-x2]').onclick = exportExcel;
  sheet.querySelector('[data-pin]').onclick = () => {
    const box = sheet.querySelector('.pinf');
    box.innerHTML = `<form class="af"><div class="ll"><label>PIN nou<input name="a" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></label><label>Confirmă<input name="b" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></label></div><div class="ferr"></div><div class="adm-row"><button class="abtn pri">Salvează PIN-ul</button></div></form>`;
    const f = box.querySelector('form');
    f.onsubmit = e => {
      e.preventDefault(); const a = f.a.value, b = f.b.value, er = f.querySelector('.ferr');
      if (!/^\d{4}$/.test(a)) { er.textContent = 'PIN-ul trebuie să aibă exact 4 cifre.'; return; }
      if (a !== b) { er.textContent = 'PIN-urile nu coincid.'; return; }
      const h = A.pinHash(a); W.config = W.config || {}; W.config.pinHash = h;
      A.LS.set('hydrotm-pin-pending', h); A.LS.set('hydrotm-pin-local', h);
      hist({ tip: 'pin', txt: 'PIN de administrare schimbat' }); commit();
      box.innerHTML = '<div class="note">PIN schimbat. Publică pentru a-l aplica pe toate dispozitivele.</div>';
    };
  };
  sheet.querySelector('[data-clr]').onclick = e => arm(e.currentTarget, `Apasă din nou: șterge ${W.surse.length} surse`, () => {
    hist({ tip: 'clear', txt: `Toate sursele au fost șterse (${W.surse.length})` });
    for (const n of Object.keys(FIDX)) if (FIDX[n].pend) dropPhoto(n);
    W.surse = []; W.demo = false; commit(); showPub();
  });
}

function exitAdmin() {
  try { sessionStorage.removeItem('hydrotm-admin'); } catch (e) {}
  location.reload();
}

// ---------- IMPORT EXCEL ----------
function pickFile() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.xlsm,.ods,.csv';
  i.onchange = () => i.files[0] && readFile(i.files[0]);
  i.click();
}
A.adminImport = readFile; // folosit și la test
async function readFile(file) {
  panel(head('Import Excel', esc(file.name)) + '<p class="note">Se citește fișierul…</p>');
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    showReport({ wb, name: file.name, clear: !!W.demo });
  } catch (e) {
    panel(head('Import Excel', esc(file.name)) + `<div class="note w">Fișierul nu a putut fi citit: ${esc(e.message || e)}</div>`);
  }
}

const COLS = [
  ['aprox', h => /aprox/.test(h)],
  ['acces', h => /acces/.test(h)],
  ['racord', h => /racord/.test(h)],
  ['id', h => /^(id|cod|indicativ|id hidrant|cod hidrant|nr hidrant|numar hidrant|id sursa|cod sursa)$/.test(h)],
  ['localitate', h => /^(localitate|localitatea|oras|orasul|comuna|loc|uat)$/.test(h)],
  ['lat', h => /^(lat|latitudine|latitude|n|nord|x|x stereo ?(70)?|coordonata x|coord x|lat wgs ?84)$/.test(h)],
  ['lng', h => /^(lng|lon|long|longitudine|longitude|e|est|y|y stereo ?(70)?|coordonata y|coord y|long wgs ?84|lon wgs ?84)$/.test(h)],
  ['coord', h => /^(coordonate|coord|gps|pozitie|pozitia)/.test(h)],
  ['tip', h => /^(tip|tipul|tip hidrant|tip sursa|tipul sursei|categorie|tip sursa de apa|sursa)$/.test(h)],
  ['stare', h => /^(stare|starea|status|stare tehnica|starea tehnica|functional|functionare)$/.test(h)],
  ['obs', h => /^(obs|observatii|observatie|mentiuni|note|detalii)/.test(h)],
  ['poze', h => /^(poze|poza|foto|fotografi|imagin)/.test(h)],
  ['adresa', h => /^(adresa|strada|amplasament|locatie|locatia|loc amplasare)/.test(h)]
];
const HN = { id: 'ID', localitate: 'Localitate', adresa: 'Adresă', lat: 'Latitudine', lng: 'Longitudine', coord: 'Coordonate', tip: 'Tip', racord: 'Racord', stare: 'Stare', aprox: 'Locație aproximativă', acces: 'Acces autospecială', obs: 'Observații', poze: 'Poze' };
const hnorm = h => norm(h).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function normTip(v) {
  const n = norm(v); if (!n) return null;
  if (/subter|ingrop|\bsub\b/.test(n)) return { v: 'h-sub', ok: 1 };
  if (/suprat|\bsup\b|suprafat|stalp|\bss\b/.test(n)) return { v: 'h-sup', ok: 1 };
  if (/natural|\blac\b|\brau\b|\briu\b|canal|bega|balta|iaz|helesteu/.test(n)) return { v: 'nat', ok: 1 };
  if (/rezerv|bazin|cistern/.test(n)) return { v: 'rez', ok: 1 };
  if (/\bput\b|\bputul\b|fantan|foraj/.test(n)) return { v: 'put', ok: 1 };
  if (/hidrant|^h$/.test(n)) return { v: 'h', ok: 1 };
  return { v: 'h', ok: 0 };
}
function normStare(v) {
  const n = norm(v); if (!n) return null;
  if (/nefunc|nu merge|nu functioneaza|defect|^def|strica|avari|inutiliz|blocat|^x$|^d$|^nu$|^n$|^ko$/.test(n)) return { v: 'defect', ok: 1 };
  if (/^neverif|^nev|necunoscut|^\?|nu se stie|neconfirmat|^nv$/.test(n)) return { v: 'neverificat', ok: 1 };
  if (/^func|^ok|^bun|^merge|^activ|^da$|^f$|^operational|^in stare|^verificat/.test(n)) return { v: 'functional', ok: 1 };
  return { v: 'neverificat', ok: 0 };
}
function normBool(v) {
  const n = norm(v); if (!n) return null;
  if (/^(da|x|1|true|yes|y|d|aprox|✓|v)\b/.test(n) || n === 'aproximativ' || n === 'aproximativa') return true;
  if (/^(nu|0|false|no|n|exact|exacta)\b/.test(n)) return false;
  return null;
}
const normRacord = v => [...new Set([...str(v).toUpperCase().matchAll(/(?:^|[^A-Z])([ABC])(?![A-Z])/g)].map(m => m[1]))].sort().join('/');

// coordonate: zecimale, grade-minute-secunde, Stereo 70
function nums(v) {
  if (typeof v === 'number') return [v];
  const s = str(v).replace(/(\d),(\d)/g, '$1.$2');
  return (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
}
function oneVal(v) {
  const a = nums(v); if (!a.length) return null;
  const gms = typeof v !== 'number' && (a.length > 1 || /[°º'′"″]/.test(String(v)));
  if (a.length === 1) return { x: a[0], gms };
  if (a.length === 2) return a[1] < 60 ? { x: a[0] + a[1] / 60, gms: true } : null;
  if (a.length === 3) return a[1] < 60 && a[2] < 60 ? { x: a[0] + a[1] / 60 + a[2] / 3600, gms: true } : null;
  return null;
}
function pairVal(v) {
  const a = nums(v), d = (...x) => x.length === 1 ? x[0] : x.length === 2 ? x[0] + x[1] / 60 : x[0] + x[1] / 60 + x[2] / 3600;
  if (a.length === 2) return { a: a[0], b: a[1], gms: false };
  if (a.length === 4) return { a: d(a[0], a[1]), b: d(a[2], a[3]), gms: true };
  if (a.length === 6) return { a: d(a[0], a[1], a[2]), b: d(a[3], a[4], a[5]), gms: true };
  return null;
}
const inB = p => p.lng >= BOUNDS[0][0] && p.lng <= BOUNDS[1][0] && p.lat >= BOUNDS[0][1] && p.lat <= BOUNDS[1][1];
const inRO = p => p.lat > 43.4 && p.lat < 48.4 && p.lng > 20 && p.lng < 30;
function toLL(a, b) {
  if (!(isFinite(a) && isFinite(b))) return null;
  if (a > 1000 && b > 1000) {
    if (!window.proj4) return null;
    const c = [[b, a], [a, b]].map(([e, n]) => { const [lng, lat] = proj4('EPSG:3844', 'WGS84', [e, n]); return { lat, lng, how: 'stereo' }; });
    return c.find(inB) || c.find(inRO) || c[0];
  }
  if (a > 43 && a < 49 && b > 19 && b < 31) return { lat: a, lng: b, how: 'dec' };
  if (b > 43 && b < 49 && a > 19 && a < 31) return { lat: b, lng: a, how: 'dec', swap: true };
  return { lat: a, lng: b, how: 'dec' };
}

function findSheet(wb) {
  let best = null;
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn]; if (!ws || !ws['!ref']) continue;
    const rg = XLSX.utils.decode_range(ws['!ref']);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const map = {}, ign = [];
      rows[i].forEach((h, j) => {
        const hn = hnorm(h); if (!hn) return;
        const c = COLS.find(([k, t]) => map[k] == null && t(hn));
        if (c) map[c[0]] = j; else ign.push(str(h));
      });
      const score = Object.keys(map).length;
      const usable = (map.lat != null && map.lng != null) || map.coord != null || map.id != null;
      if (score >= 2 && usable && (!best || score > best.score)) best = { sn, ws, rg, rows, hdr: i, map, ign, score };
    }
  }
  return best;
}

function analyze(o) {
  const fs = findSheet(o.wb);
  if (!fs) return { fail: 'Nu am găsit un tabel cu coloane recunoscute (de ex. ID, Adresă, Latitudine, Longitudine).' };
  const base = o.clear ? [] : W.surse, byId = new Map(base.map(s => [s.id, s]));
  const canon = locCanon();
  const M = fs.map, g = (row, k) => M[k] != null ? row[M[k]] : '';
  const r = { name: o.name, sheet: fs.sn, wb: o.wb, ws: fs.ws, rg: fs.rg, hdrRow: fs.rg.s.r + fs.hdr, idCol: M.id != null ? fs.rg.s.c + M.id : null,
    cols: Object.keys(M).sort((a, b) => M[a] - M[b]).map(k => HN[k]), ign: fs.ign, clear: o.clear, baseN: W.surse.length,
    nou: [], upd: [], same: 0, err: [], warn: [], unk: [], gen: [], stereo: 0, gms: 0, swap: 0, noState: 0 };
  // pas 1: ID-urile din fișier
  const reserved = new Set();
  for (let i = fs.hdr + 1; i < fs.rows.length; i++) { const id = normId(g(fs.rows[i], 'id')); if (id) reserved.add(id); }
  const seen = new Map(), added = [];
  for (let i = fs.hdr + 1; i < fs.rows.length; i++) {
    const row = fs.rows[i]; if (!row || row.every(v => str(v) === '')) continue;
    const rn = fs.rg.s.r + i + 1, row0 = fs.rg.s.r + i;
    let id = normId(g(row, 'id'));
    if (id && seen.has(id)) { r.err.push(`Rândul ${rn}: ID ${id} apare de două ori (prima dată la rândul ${seen.get(id)})`); continue; }
    if (id) seen.set(id, rn);
    const old = id ? byId.get(id) : null;
    // câmpuri
    const f = {}, W2 = m => r.warn.push(`Rândul ${rn}${id ? ' (' + id + ')' : ''}: ${m}`);
    const loc = str(g(row, 'localitate')); if (loc) f.localitate = canon.get(norm(loc)) || loc;
    const adr = str(g(row, 'adresa')); if (adr) f.adresa = adr;
    if (adr && A.streets().length > 40) { const pa = parseAddr(adr, f.localitate || (old && old.localitate) || 'Timișoara'); if (!pa.s) W2(`strada „${adr}” nu e găsită în lista de străzi`); }
    const t = normTip(g(row, 'tip')); if (t) { f.tip = t.v; if (!t.ok) W2(`tip necunoscut „${str(g(row, 'tip'))}” → hidrant`); }
    const sv = g(row, 'stare'), st = normStare(sv);
    if (st) { f.stare = st.v; if (!st.ok) r.unk.push(`Rândul ${rn}${id ? ' (' + id + ')' : ''}: „${str(sv)}”`); } else if (!old) r.noState++;
    if (M.racord != null && str(g(row, 'racord'))) f.racord = normRacord(g(row, 'racord'));
    const ap = normBool(g(row, 'aprox')); if (ap != null) f.aprox = ap;
    const ac = normBool(g(row, 'acces')); if (ac != null) f.acces = ac;
    const ob = str(g(row, 'obs')); if (ob) f.obs = ob;
    const pz = str(g(row, 'poze')); if (pz) f.poze = pz.split(/[,;\n]+/).map(str).filter(Boolean);
    // coordonate
    let ll = null, hasC = false;
    if (M.lat != null || M.lng != null) {
      const a = oneVal(g(row, 'lat')), b = oneVal(g(row, 'lng'));
      hasC = !!(str(g(row, 'lat')) || str(g(row, 'lng')));
      if (a && b) { ll = toLL(a.x, b.x); if (ll && (a.gms || b.gms)) ll.gms = 1; }
    }
    if (!ll && M.coord != null && str(g(row, 'coord'))) {
      hasC = true; const p = pairVal(g(row, 'coord'));
      if (p) { ll = toLL(p.a, p.b); if (ll && p.gms) ll.gms = 1; }
    }
    if (ll && !inB(ll)) { const m = `coordonate în afara zonei hărții (${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)})`; ll = null; if (!old) { r.err.push(`Rândul ${rn}${id ? ' (' + id + ')' : ''}: ${m}`); continue; } W2(m + ', păstrate cele vechi'); }
    else if (!ll && hasC) { if (!old) { r.err.push(`Rândul ${rn}${id ? ' (' + id + ')' : ''}: coordonate nerecunoscute`); continue; } W2('coordonate nerecunoscute, păstrate cele vechi'); }
    else if (!ll && !old) { r.err.push(`Rândul ${rn}${id ? ' (' + id + ')' : ''}: lipsesc coordonatele`); continue; }
    if (ll) {
      f.lat = +ll.lat.toFixed(6); f.lng = +ll.lng.toFixed(6);
      if (ll.how === 'stereo') r.stereo++; else if (ll.gms) r.gms++;
      if (ll.swap) { r.swap++; W2('latitudine și longitudine inversate, corectate'); }
    }
    if (old) {
      const n = Object.assign(clone(old), f);
      if (!isH(n)) n.racord = '';
      const ch = diff(old, n);
      if (ch.length) r.upd.push({ n, ch }); else r.same++;
    } else {
      const n = Object.assign({ id, localitate: 'Timișoara', adresa: '', tip: 'h', racord: '', stare: 'neverificat', aprox: false, acces: null, obs: '', poze: [] }, f);
      if (!f.localitate) W2('fără localitate, considerat Timișoara');
      if (!isH(n)) n.racord = ''; else n.acces = null;
      if (!id) { n.id = genId(n.localitate, base, [...reserved, ...added.map(x => x.id)]); r.gen.push({ row0, id: n.id }); }
      const near = [...base, ...added].find(s => dist(s, n) < 3);
      if (near) W2(`la mai puțin de 3 m de ${near.id}: posibil duplicat`);
      added.push(n); r.nou.push(n);
    }
  }
  return r;
}

function showReport(o) {
  const r = analyze(o);
  if (r.fail) { panel(head('Import Excel', esc(o.name)) + `<div class="note w">${esc(r.fail)}</div><div class="adm-row"><button class="abtn" data-x>Închide</button></div>`); return; }
  const li = a => a.map(x => `<li>${esc(x)}</li>`).join('');
  const det = (t, a, open) => a.length ? `<details${open ? ' open' : ''}><summary>${t} (${a.length})</summary><ul>${li(a.slice(0, 1000))}</ul></details>` : '';
  const updL = r.upd.map(u => `${u.n.id}: ${chTxt(u.ch)}`);
  const newL = r.nou.map(n => `${n.id}: ${tipL(n)}, ${n.adresa || 'fără adresă'}, ${n.localitate}, ${(LBL[n.stare] || '').toLowerCase()}`);
  panel(head('Import Excel', `${esc(r.name)} · foaia „${esc(r.sheet)}”`) + `<div class="rep">
   <div class="stats"><div><b>${r.nou.length}</b><small>noi</small></div><div><b>${r.upd.length}</b><small>actualizate</small></div><div><b>${r.same}</b><small>neschimbate</small></div><div class="e"><b>${r.err.length}</b><small>cu erori</small></div></div>
   <p><b>Coloane recunoscute:</b> ${esc(r.cols.join(', '))}${r.ign.length ? `<br><b>Ignorate:</b> ${esc(r.ign.join(', '))}` : ''}</p>
   ${r.gen.length ? `<p><b>ID-uri generate:</b> ${r.gen.length}. După import primești Excelul completat cu ele.</p>` : ''}
   ${r.stereo ? `<p>Coordonate Stereo 70 convertite: <b>${r.stereo}</b></p>` : ''}
   ${r.gms ? `<p>Coordonate în grade-minute-secunde convertite: <b>${r.gms}</b></p>` : ''}
   ${r.noState ? `<p>Fără stare completată (→ neverificat): <b>${r.noState}</b></p>` : ''}
   ${det('Stări nerecunoscute → neverificat', r.unk, true)}
   ${det('Erori: rânduri care nu se importă', r.err, true)}
   ${det('Avertismente', r.warn)}
   ${det('Modificări', updL)}
   ${det('Surse noi', newL)}
   <div class="af"><label class="chk"><input type="checkbox" id="impClr"${r.clear ? ' checked' : ''}> Șterge întâi toate sursele existente (${r.baseN})${W.demo ? ' · datele de acum sunt fictive' : ''}</label></div>
   <div class="adm-row"><button class="abtn pri" data-ok${r.nou.length + r.upd.length ? '' : ' disabled'}>Aplică importul</button><button class="abtn" data-x>Renunță</button></div></div>`);
  sheet.querySelector('#impClr').onchange = e => showReport({ wb: o.wb, name: o.name, clear: e.target.checked });
  sheet.querySelector('[data-ok]').onclick = () => applyImport(r, newL, updL);
}

function applyImport(r, newL, updL) {
  if (r.clear) { hist({ tip: 'clear', txt: `Toate sursele au fost șterse înainte de import (${W.surse.length})` }); W.surse = []; W.demo = false; }
  const idx = new Map(W.surse.map((s, i) => [s.id, i]));
  for (const u of r.upd) W.surse[idx.get(u.n.id)] = u.n;
  for (const n of r.nou) W.surse.push(n);
  hist({ tip: 'import', txt: `Import „${r.name}”: ${r.nou.length} noi, ${r.upd.length} actualizate, ${r.same} neschimbate, ${r.err.length} rânduri cu erori`,
    det: [...updL, ...newL.map(x => x.replace(/^([^:]+):/, '$1: adăugat —')), ...r.unk.map(x => 'Stare nerecunoscută: ' + x), ...r.err] });
  commit();
  panel(head('Import aplicat', esc(r.name)) + `
   <div class="note">${r.nou.length} surse noi, ${r.upd.length} actualizate. Modificările sunt în copia de lucru. Publică-le când ești gata.</div>
   ${r.gen.length ? `<div class="note w"><b>${r.gen.length} ID-uri generate.</b> Descarcă Excelul completat și folosește-l pe acela de acum înainte, ca să nu se dubleze sursele la următorul import.</div>
   <div class="adm-row"><button class="abtn pri" data-fill>Descarcă Excelul completat cu ID-uri</button></div>` : ''}
   <div class="adm-row"><button class="abtn" data-pub>Mergi la publicare</button><button class="abtn" data-x>Închide</button></div>`);
  const fb = sheet.querySelector('[data-fill]'); if (fb) fb.onclick = () => fillIds(r);
  sheet.querySelector('[data-pub]').onclick = showPub;
}

function fillIds(r) {
  const ws = r.ws, U = XLSX.utils; let c = r.idCol;
  if (c == null) { c = r.rg.e.c + 1; ws[U.encode_cell({ r: r.hdrRow, c })] = { t: 's', v: 'ID' }; }
  for (const { row0, id } of r.gen) ws[U.encode_cell({ r: row0, c })] = { t: 's', v: id };
  const rg = U.decode_range(ws['!ref']); rg.e.c = Math.max(rg.e.c, c); ws['!ref'] = U.encode_range(rg);
  XLSX.writeFile(r.wb, r.name.replace(/\.[^.]+$/, '') + '-cu-ID.xlsx');
}

// ---------- pornire ----------
let started = false;
async function start() {
  if (started) return; started = true;
  A.admin = true; document.body.classList.add('adm');
  top.appendChild(bar); top.appendChild(pickbar);
  const pub = A.published();
  const st = await KV.get('work').catch(() => null);
  HIST = (await KV.get('hist').catch(() => null)) || [];
  const pubT = pub.publicat || '', wT = (st && st.data && st.data.publicat) || '';
  let conflict = false;
  if (st && st.data && (st.dirty > 0 || wT > pubT)) {
    // copia de lucru are modificări nepublicate sau o publicare încă neurcată pe găzduire
    W = st.data; DIRTY = st.dirty; BASE = wT;
    if (pubT > wT) { conflict = true; NOTE = `Datele de pe găzduire (publicate ${fmtT(pubT)}) sunt mai noi decât copia ta de lucru, care are ${DIRTY} modificări nepublicate.`; }
    else if (!DIRTY) NOTE = `Ultima ta publicare (${fmtT(wT)}) nu apare încă pe găzduire. Urcă fișierul hidranti.json.`;
  } else { W = clone(pub); DIRTY = 0; BASE = pubT; }
  W.config = W.config || {}; W.surse = W.surse || [];
  const pend = A.LS.get('hydrotm-pin-pending');
  if (pend && (pub.config || {}).pinHash === pend) A.LS.set('hydrotm-pin-pending', null);
  else if (pend && W.config.pinHash !== pend) { W.config.pinHash = pend; DIRTY = Math.max(DIRTY, 1); }
  FIDX = (await KV.get('fotoIdx').catch(() => null)) || {};
  for (const n of Object.keys(FIDX)) { const b = await KV.get('foto:' + n).catch(() => null); if (b) FURL.set(n, URL.createObjectURL(b)); else delete FIDX[n]; }
  A.setData(W); updBar(); save();
  if (conflict) showPub();
  // pozele deja publicate și ajunse pe găzduire nu mai trebuie ținute local
  for (const n of Object.keys(FIDX)) if (!FIDX[n].pend) fetch('poze/' + encodeURIComponent(n), { method: 'HEAD', cache: 'no-store' }).then(r => { if (r.ok) dropPhoto(n); }).catch(() => {});
}
window.HydroAdmin = { start };
})();
