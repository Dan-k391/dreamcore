// The look-tuning workspace (docs/look.md, The tuning workspace). Each tile is the real game in a same-origin iframe (index.html?dev&bare),
// held at a viewpoint and driven through its window.dev: one working look { all, zones } is pushed whole to every tile, and a held tile
// draws one frame only when what it shows could have changed. Everything loaded (presets, files, browser storage) goes through sanitize.
import { params, byId, sanitize } from './js/look.params.js';

const $ = id => document.getElementById(id), el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  e.append(...kids.flat().filter(k => k != null && k !== false)); return e; };
const KEY = 'dreamcore.tune', PKEY = 'dreamcore.tune.presets', ZKEY = 'dreamcore.tune.zones';
const STARTERS = ['warm-and-luminous', 'quiet-and-neutral', 'dreamy-and-atmospheric'];
const SETTLE = 30, TINY = 1e-4, LOAD_MS = 120000; // frames run after a tile is placed; dt of a redraw (time effectively still); a tile that is not ready by then failed
const PLACES = { bA: 'Backrooms', bB: 'Pillar hall', bC: 'Corridor', pH: 'Pool hall', pC: 'Arcade', pN: 'Night hall', pG: 'Gallery pool', pV: 'Vault hall',
  hT: 'Hotel hallway', hV: 'Hotel vestibule', hG: 'Hotel gallery', hL: 'Hotel lobby', mL: 'Mall', sP: 'Soft play', cN: 'Cinema', pK: 'Parking level',
  fD: 'Field', nL: 'Car park', sK: 'Terrace', lW: 'Laundromat', lX: 'Laundromat yard', mT: 'Metro', gH: 'Glasshouse', pB: 'Baths', pE: 'Baths entrance' };
const place = z => PLACES[z] || (/^[tuj]\d$/.test(z || '') ? 'Passage ' + z : z || '…');
const json = o => JSON.stringify(o), clone = o => JSON.parse(json(o)), empty = () => ({ all: {}, zones: {} });
const count = L => Object.keys(L.all).length + Object.values(L.zones).reduce((s, z) => s + Object.keys(z).length, 0);
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, json(v)); } catch {} } };

// ---------- state ----------
const views = await (await fetch('tools/views.json')).json(), viewBy = Object.fromEntries(views.map(v => [v.name, v]));
const saved = store.get(KEY, {});
const S = { look: sanitize(saved.look), layout: [1, 2, 4].includes(saved.layout) ? saved.layout : 4, target: typeof saved.target === 'string' ? saved.target : 'all',
  views: [0, 1, 2, 3].map(i => { const v = saved.views?.[i]; return v && typeof v.name === 'string' && /^-?[\d.]+,-?[\d.]+,-?[\d.e-]+,-?[\d.e-]+$/.test(v.hash) ? v : viewBy[['backrooms', 'pool-hall', 'hotel-hallway', 'terrace'][i]] || views[i]; }),
  strength: Number.isFinite(saved.strength) ? Math.min(1.5, Math.max(0, saved.strength)) : 1, mode: saved.mode === 'over' ? 'over' : 'replace', cmp: typeof saved.cmp === 'string' ? saved.cmp : STARTERS[0], motion: [false, false, false, false] };
{ const n = +new URLSearchParams(location.search).get('tiles'); if ([1, 2, 4].includes(n)) S.layout = n; } // ?tiles=n: open with n tiles (the suite's check)
const persist = () => store.set(KEY, { look: S.look, layout: S.layout, target: S.target, views: S.views, strength: S.strength, mode: S.mode, cmp: S.cmp });
let zoneOf = (z => z && z.sig === views.map(v => v.name + v.hash).join() ? z.map : null)(store.get(ZKEY)); // view name -> zone id, measured once in a tile
let show = null; // null: the working look; 'before': the game as built; 'cmp': the compare look
const hist = [json(S.look)]; let hi = 0;
const msg = (t, keep) => { $('msg').textContent = t; clearTimeout(msg.t); if (!keep) msg.t = setTimeout(() => $('msg').textContent = '', 9000); };

// ---------- look arithmetic ----------
const entry = (L, t) => t === 'all' ? L.all : L.zones[t] || {};
function setVal(t, id, v) { const p = byId[id], E = t === 'all' ? S.look.all : (S.look.zones[t] ||= {});
  if (Math.abs(v - p.neutral) < 1e-9) delete E[id]; else E[id] = +Math.min(p.max, Math.max(p.min, v)).toFixed(4);
  if (t !== 'all' && !Object.keys(E).length) delete S.look.zones[t]; }
const scaled = (L, s) => { const f = E => Object.fromEntries(Object.entries(E).map(([id, v]) => [id, byId[id].kind === 'mul' ? 1 + (v - 1) * s : v * s]));
  return { all: f(L.all), zones: Object.fromEntries(Object.entries(L.zones).map(([z, E]) => [z, f(E)])) }; };
const over = (A, B) => { const f = (a = {}, b = {}) => { const o = { ...a }; for (const [id, v] of Object.entries(b)) o[id] = id in o ? (byId[id].kind === 'mul' ? o[id] * v : o[id] + v) : v; return o; };
  const zones = { ...A.zones }; for (const [z, E] of Object.entries(B.zones)) zones[z] = f(zones[z], E); return { all: f(A.all, B.all), zones }; };
function commit(what) { // every change ends here: history, the tiles, the panel, storage
  S.look = sanitize(S.look); const j = json(S.look);
  if (j !== hist[hi]) { hist.length = hi + 1; hist.push(j); hi++; if (hist.length > 400) { hist.shift(); hi--; } }
  persist(); push(); render(); if (what) msg(what); }
function undo() { if (hi > 0) { S.look = JSON.parse(hist[--hi]); persist(); push(); render(); msg('Undone'); } }
function redo() { if (hi < hist.length - 1) { S.look = JSON.parse(hist[++hi]); persist(); push(); render(); msg('Redone'); } }

// ---------- presets: on disk through tools/serve.mjs when it answers, in this browser otherwise ----------
const P = { disk: false, names: [], cache: {} };
async function listPresets() {
  try { const r = await fetch('looks/presets', { cache: 'no-store' }); const n = r.ok && await r.json(); if (!Array.isArray(n)) throw 0; P.disk = true; P.names = n; }
  catch { P.disk = false; P.names = [...STARTERS, ...Object.keys(store.get(PKEY, {})).filter(n => !STARTERS.includes(n)).sort()]; }
  return P.names; }
async function readPreset(name) {
  if (name === 'applied') return applied();
  if (!P.disk && !STARTERS.includes(name)) { const L = store.get(PKEY, {})[name]; if (!L) throw new Error('no such preset'); return sanitize(L); }
  const r = await fetch(P.disk ? 'looks/presets/' + name : 'looks/presets/' + name + '.json', { cache: 'no-store' }); if (!r.ok) throw new Error('no such preset');
  return P.cache[name] = sanitize(await r.json()); }
const slug = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
async function savePreset(name, L = S.look) { name = slug(name); if (!name) throw new Error('give it a name');
  if (STARTERS.includes(name)) throw new Error('the starter presets stay as they are: pick another name');
  if (P.disk) { const r = await fetch('looks/presets/' + name, { method: 'PUT', body: json(L) }); if (!r.ok) throw new Error('the server refused it (' + r.status + ')'); }
  else { const all = store.get(PKEY, {}); all[name] = sanitize(L); store.set(PKEY, all); }
  await listPresets(); return name; }
async function deletePreset(name) { if (STARTERS.includes(name)) throw new Error('the starter presets stay');
  if (P.disk) { const r = await fetch('looks/presets/' + name, { method: 'DELETE' }); if (!r.ok && r.status !== 404) throw new Error('the server refused (' + r.status + ')'); }
  else { const all = store.get(PKEY, {}); delete all[name]; store.set(PKEY, all); }
  delete P.cache[name]; await listPresets(); }
async function renamePreset(a, b) { const L = await readPreset(a), n = await savePreset(b, L); if (n !== a) await deletePreset(a); return n; }
async function loadPreset(name, strength = S.strength, mode = S.mode) {
  const L = scaled(await readPreset(name), strength); S.look = mode === 'over' ? over(S.look, L) : L;
  commit(`${name === 'applied' ? 'The applied look' : name} ${mode === 'over' ? 'laid over' : 'loaded'} at ${Math.round(strength * 100)}%`); }
function download(name, text, type = 'application/json') { const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1e4); }
function importText(text) { // -> { ok, n }: a file that is not a look (bad JSON, no known values) is refused and changes nothing
  let raw; try { raw = JSON.parse(text); } catch { msg('Refused: that file is not JSON'); return { ok: false, why: 'json' }; }
  const L = sanitize(raw); if (!count(L)) { msg('Refused: no look values in that file'); return { ok: false, why: 'empty' }; }
  S.look = L; commit(`Imported ${count(L)} values (save it as a preset to keep it)`); return { ok: true, n: count(L) }; }

// ---------- the applied look (js/look.applied.js) ----------
let appliedLook = empty();
async function applied() { try { appliedLook = sanitize((await import('./js/look.applied.js?t=' + Date.now())).default); } catch { appliedLook = empty(); } return appliedLook; }
const fileText = L => `// The look the game starts with (docs/look.md). Written by the tuning workspace through tools/serve.mjs (PUT /looks/applied); empty: the game as built.\nexport default ${JSON.stringify(L, null, 2)};\n`;
async function applyToGame() {
  try { const r = await fetch('looks/applied', { method: 'PUT', body: json(S.look) }); if (!r.ok) throw 0; await applied();
    msg('Applied: js/look.applied.js now holds this look, and a fresh game load here starts with it. To reach players: node tools/bundle.mjs, then commit and push.', true); return { disk: true }; }
  catch { download('look.applied.js', fileText(S.look), 'text/javascript');
    msg('No save server here, so look.applied.js was downloaded: put it in js/, run node tools/bundle.mjs, commit and push.', true); return { disk: false }; } }

// ---------- tiles ----------
const T = [0, 1, 2, 3].map(i => ({ i, state: 'off', zone: null, seen: new Set(), key: null, walking: false }));
const visible = () => T.slice(0, S.layout);
const ready = t => t.state === 'ready';
const parse = h => h.split(',').map(Number);
let queue = Promise.resolve();
function buildTiles() {
  const box = $('tiles'); box.className = 'n' + S.layout;
  for (const t of T) if (t.i >= S.layout && t.frame) { t.frame.remove(); t.frame = t.d = null; t.state = 'off'; t.cell?.remove(); t.cell = null; } // unloaded: its GPU memory is given back
  for (const t of visible()) if (!t.cell) {
    t.head = el('div', { class: 'head' }); t.status = el('div', { class: 'status' });
    t.cell = el('div', { class: 'tile' }, t.head, el('div', { class: 'pic' }, t.status));
    box.append(t.cell); load(t); }
  box.append(...visible().map(t => t.cell)); render(); }
function load(t) {
  t.state = 'wait'; t.status.hidden = false; t.status.replaceChildren('waiting for the tile before'); renderHeads();
  queue = queue.then(() => new Promise(done => { // one after another: four games compiling at once take longer than in turn
    if (!t.cell) return done();
    t.state = 'loading'; renderHeads(); const t0 = performance.now(); t.status.replaceChildren('loading the game…');
    const f = t.frame = el('iframe', { src: 'index.html?dev&bare#' + S.views[t.i].hash, title: 'Scene ' + (t.i + 1), tabindex: '-1' });
    t.cell.querySelector('.pic').prepend(f);
    let errs = [];
    f.addEventListener('load', () => { try { f.contentWindow.addEventListener('error', e => errs.push(e.message)); } catch {} });
    const fail = why => { t.state = 'failed'; t.status.hidden = false; t.status.replaceChildren(`this tile failed: ${why} `, el('button', { onclick: () => { f.remove(); t.frame = null; load(t); } }, 'Try again')); renderHeads(); done(); };
    const poll = setInterval(() => { let d; try { d = f.contentWindow.dev; } catch {}
      if (t.frame !== f) { clearInterval(poll); return done(); }
      if (d?.ready) { clearInterval(poll); try { t.d = d; t.loadMs = Math.round(performance.now() - t0); hook(t); measureZones(t); placeTile(t); t.state = 'ready'; t.status.hidden = true; renderHeads(); render(); }
        catch (e) { fail(e.message); return; } done(); }
      else if (errs.length) { clearInterval(poll); fail(errs[0]); }
      else if (performance.now() - t0 > LOAD_MS) { clearInterval(poll); fail('not ready after ' + LOAD_MS / 1000 + ' s'); } }, 200);
  })); }
function hook(t) { // walking: a click takes the mouse (or, where capture is refused, the game's bare-cursor mode), Esc gives it back
  const w = t.frame.contentWindow, doc = w.document, d = t.d, cv = d.renderer.domElement;
  doc.addEventListener('click', () => { if (t.walking || !ready(t)) return; t.walking = true; d.hold = false; renderHeads();
    try { cv.requestPointerLock()?.catch?.(() => {}); } catch {} });
  doc.addEventListener('pointerlockchange', () => { doc.getElementById('o').style.display = 'none'; if (!doc.pointerLockElement && t.walking) endWalk(t); }); // no pause overlay in a tile
  w.addEventListener('keydown', e => { if (e.code === 'Escape' && t.walking) endWalk(t); });
  w.addEventListener('resize', () => { t.key = null; schedule(); }); }
function endWalk(t) {
  const d = t.d, s = d.state(), e = new d.THREE.Euler().setFromQuaternion(d.camera.quaternion, 'YXZ');
  t.walking = false; window.focus(); // the iframe loses focus, so the game lets go of every key
  S.views[t.i] = { name: 'walked', hash: [s.x, s.z, e.y, e.x].map(v => +v.toFixed(3)).join() }; persist();
  placeTile(t); renderHeads(); render(); }
function measureZones(t) { // once: which zone each named view stands in, so the scene list can group by place (46 resets, about 30 ms)
  if (zoneOf) return; const d = t.d; zoneOf = {};
  for (const v of views) { const [x, z, y, p] = parse(v.hash); d.reset(x, z, y, p || 0); zoneOf[v.name] = d.state().zone; }
  store.set(ZKEY, { sig: views.map(v => v.name + v.hash).join(), map: zoneOf }); }
function placeTile(t) { // stand at the tile's view, settle, learn its zone and what it can show
  const d = t.d, [x, z, y, p] = parse(S.views[t.i].hash);
  d.look.set(shown()); d.reset(x, z, y, p || 0); d.step(SETTLE, 1 / 60);
  const a = d.look.zoneAt(); t.zone = a.here; t.seen = new Set([a.here, ...a.mix.map(m => m[0]), ...a.onScreen]);
  t.q = d.camera.quaternion.clone(); t.pos = d.camera.position.clone(); t.key = null; d.hold = !(S.motion[t.i]); redraw(t); }
let cmpLook = empty();
const shown = () => show === 'before' ? empty() : show === 'cmp' ? cmpLook : S.look;
const keyOf = (L, t) => json([L.all, Object.entries(L.zones).filter(([z]) => t.seen.has(z))]); // what of the look this tile can show
function redraw(t, force) {
  if (!ready(t) && t.state !== 'loading' || !t.d) return false; const d = t.d, L = shown();
  d.look.set(L);
  if (!d.hold || t.walking) return false; // its own loop draws it
  if (!d.camera.quaternion.equals(t.q) || !d.camera.position.equals(t.pos)) { placeTile(t); return true; } // moved while not walking (bare-cursor mode): back to its view
  const k = keyOf(L, t); if (!force && k === t.key) return false;
  t.key = k; d.step(1, TINY); return true; }
let pending = false;
const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; flush(); }); } };
function flush() { let n = 0; for (const t of visible()) if (ready(t)) try { n += redraw(t); } catch (e) { t.state = 'failed'; t.status.hidden = false; t.status.textContent = 'this tile failed: ' + e.message; } return n; }
const push = () => schedule();
function setMotion(i, on) { S.motion[i] = on; const t = T[i]; if (ready(t) && !t.walking) { t.d.hold = !on; if (!on) t.key = null, schedule(); } renderHeads(); }
function setScene(i, name, hash) { S.views[i] = hash ? { name, hash } : viewBy[name]; persist(); const t = T[i]; if (ready(t)) placeTile(t); renderHeads(); render(); }
function setLayout(n) { S.layout = n; persist(); buildTiles(); }

// ---------- targets ----------
const targets = () => { const m = new Map(); for (const t of visible()) if (t.zone) { if (!m.has(t.zone)) m.set(t.zone, []); m.get(t.zone).push(t.i + 1); } return m; };
function setTarget(t) { S.target = t; persist(); render(); }

// ---------- display units ----------
const UNIT = id => {
  const p = byId[id];
  if (id === 'exposure') return { k: 1, u: 'stops', d: 2 };
  if (id === 'light.warmth') return { k: 100, u: '', d: 0, w: ['paler', 'amber'] };
  if (id === 'grade.temp') return { k: 100, u: '', d: 0, w: ['cooler', 'warmer'] };
  if (id === 'grade.tint') return { k: 100, u: '', d: 0, w: ['magenta', 'green'] };
  if (id === 'mat.wet') return { k: 100, u: '%', d: 0 };
  return p.kind === 'mul' ? { k: 100, u: '%', d: 0, mul: true } : { k: 100, u: '', d: 0 }; };
const fmt = (id, v) => { const U = UNIT(id), n = (v * U.k).toFixed(U.d), s = U.mul || id === 'mat.wet' ? n : (v > 0 ? '+' : v < 0 ? '' : '±') + n;
  return s + (U.u === '%' ? '%' : U.u ? ' ' + U.u : '') + (U.w && v ? ' ' + U.w[v > 0 ? 1 : 0] : ''); };

// ---------- the panel, built from dev.look's registry (js/look.params.js is the same list) ----------
const rows = {}; let builtFor = null;
function buildPanel() {
  const panel = $('panel'); panel.replaceChildren();
  panel.append(el('div', { id: 'phead' }), el('div', { id: 'rooms' }));
  const groups = [...new Set(params.map(p => p.group))];
  for (const g of groups) {
    const sec = el('section', { class: 'grp', 'aria-label': g });
    sec.append(el('div', { class: 'gh' }, el('h3', {}, g), el('button', { class: 'gr', title: 'Reset this group on the current target', onclick: () => { for (const p of params) if (p.group === g && (S.target === 'all' || p.perZone)) setVal(S.target, p.id, p.neutral); commit(`Reset ${g}`); } }, 'reset')));
    for (const p of params.filter(q => q.group === g)) {
      const U = UNIT(p.id), lid = 'l-' + p.id.replace('.', '-'), hid = 'h-' + p.id.replace('.', '-');
      const range = el('input', { type: 'range', min: p.min, max: p.max, step: p.step / 5, 'aria-labelledby': lid, 'aria-describedby': hid });
      const num = el('input', { type: 'number', step: +(p.step * U.k).toFixed(4), min: +(p.min * U.k).toFixed(4), max: +(p.max * U.k).toFixed(4), 'aria-label': p.label + ' value' + (U.u ? ' in ' + (U.u === '%' ? 'percent' : U.u) : '') });
      const rst = el('button', { class: 'rst', title: 'Reset to neutral (or double-click the slider)', 'aria-label': 'Reset ' + p.label }, '↺');
      const val = el('span', { class: 'val', 'aria-hidden': 'true' }), base = el('span', { class: 'base' }), note = el('div', { class: 'note', id: hid }, p.help);
      const mark = el('i', { class: 'mark' }), track = el('div', { class: 'track' }, range, mark);
      const row = el('div', { class: 'row', title: p.help }, el('label', { id: lid, class: 'name' }, p.label), val, track, num, el('span', { class: 'unit' }, U.u === 'stops' ? 'st' : U.u), rst, base, note);
      const live = v => { setVal(S.target, p.id, v); S.look = sanitize(S.look); persist(); push(); renderRow(p.id); };
      range.addEventListener('input', () => live(+range.value));
      range.addEventListener('change', () => commit());
      range.addEventListener('dblclick', () => { setVal(S.target, p.id, p.neutral); commit(p.label + ' reset'); });
      range.addEventListener('keydown', e => { // arrows: one step, Shift: a fifth of one (fine), PageUp/Down: five
        const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key]; if (!dir) return; e.preventDefault();
        live(+range.value + dir * p.step * (e.shiftKey ? .2 : 1)); range.value = entry(S.look, S.target)[p.id] ?? p.neutral; clearTimeout(range.t); range.t = setTimeout(commit, 350); });
      num.addEventListener('change', () => { const v = parseFloat(num.value); if (Number.isFinite(v)) { setVal(S.target, p.id, v / U.k); commit(); } else renderRow(p.id); });
      rst.addEventListener('click', () => { setVal(S.target, p.id, p.neutral); commit(p.label + ' reset'); });
      rows[p.id] = { p, row, range, num, rst, val, base, mark, note };
      sec.append(row); }
    panel.append(sec); }
  panel.append(el('div', { class: 'keys' }, 'Keys: 0 all rooms · 1–4 a tile’s room · hold B before · hold N against · Ctrl+Z undo · Ctrl+Shift+Z redo · arrows step, Shift+arrows fine · double-click a slider to reset · click a picture to walk, Esc to stop'));
  builtFor = true; }
function renderRow(id) {
  const r = rows[id], p = r.p, t = S.target, off = t !== 'all' && !p.perZone, v = entry(S.look, t)[id] ?? p.neutral, a = S.look.all[id] ?? p.neutral;
  r.range.value = off ? a : v; if (document.activeElement !== r.num) r.num.value = +((off ? a : v) * UNIT(id).k).toFixed(UNIT(id).d + 2);
  r.range.disabled = r.num.disabled = r.rst.disabled = off; r.row.classList.toggle('off', off); r.row.classList.toggle('set', !off && v !== p.neutral);
  r.val.textContent = fmt(id, off ? a : v); r.rst.style.visibility = !off && v !== p.neutral ? '' : 'hidden';
  const showBase = t !== 'all' && p.perZone && a !== p.neutral; // on a room target: what all rooms already add
  r.base.textContent = off ? 'one for the whole game: set it on All rooms' : showBase ? 'all rooms ' + fmt(id, a) + (v !== p.neutral ? ' · together ' + fmt(id, p.kind === 'mul' ? a * v : a + v) : '') : '';
  r.mark.hidden = !showBase; if (showBase) r.mark.style.left = `calc(${(a - p.min) / (p.max - p.min)} * (100% - 12px) + 6px)`;
  r.neutralPos = r.neutralPos || (r.range.parentElement.style.setProperty('--n', (p.neutral - p.min) / (p.max - p.min)), 1); }
function render() {
  if (!builtFor) buildPanel();
  const tg = targets(); if (S.target !== 'all' && !tg.has(S.target) && window.dev?.ready) S.target = 'all'; // a room no tile stands in any more
  // the target switch
  const bt = $('targets'); bt.replaceChildren(el('span', { class: 'lab' }, 'Edit'));
  const tb = (id, label, sub, key) => el('button', { role: 'radio', 'aria-checked': S.target === id ? 'true' : 'false', title: key, onclick: () => setTarget(id), class: id !== 'all' && S.look.zones[id] ? 'own' : '' }, label, sub && el('small', {}, sub));
  bt.append(tb('all', 'All rooms', null, 'Key 0'));
  for (const [z, ns] of tg) bt.append(tb(z, place(z), ns.join(' '), 'Key ' + ns.join(' or ')));
  // panel head: what is edited, rooms with their own changes, copy
  const t = S.target, ph = $('phead'), share = tg.get(t);
  ph.replaceChildren(el('div', { class: 'tgt' }, t === 'all' ? 'All rooms' : place(t), el('small', {}, t === 'all' ? 'every room; a room’s own changes are laid over this' : `tile${share?.length > 1 ? 's' : ''} ${share?.join(', ') || ''} · laid over all rooms`)));
  if (t !== 'all') { const others = [...tg.keys()].filter(z => z !== t);
    ph.append(el('div', { class: 'acts' },
      others.length ? el('select', { 'aria-label': 'Copy this room’s changes to', onchange: e => { const z = e.target.value; if (!z) return; S.look.zones[z] = clone(S.look.zones[t] || {}); commit(`${place(t)} copied to ${place(z)}`); } },
        el('option', { value: '' }, 'Copy to…'), others.map(z => el('option', { value: z }, place(z)))) : null,
      el('button', { onclick: () => { delete S.look.zones[t]; commit(`${place(t)}’s own changes cleared`); }, disabled: !S.look.zones[t] }, 'Clear room'))); }
  const own = Object.entries(S.look.zones), rm = $('rooms');
  rm.replaceChildren(...(own.length ? [el('div', { class: 'lab' }, 'Rooms with their own changes'), ...own.map(([z, E]) => el('div', { class: 'own-row' },
    el('button', { class: 'link', disabled: !tg.has(z), title: tg.has(z) ? 'Edit this room' : 'Not on a tile: pick a scene there to edit it', onclick: () => setTarget(z) }, place(z)),
    el('span', {}, Object.keys(E).length + ' value' + (Object.keys(E).length > 1 ? 's' : '')), el('button', { class: 'rst', 'aria-label': 'Clear ' + place(z), title: 'Clear', onclick: () => { delete S.look.zones[z]; commit(place(z) + ' cleared'); } }, '×')))] : []));
  for (const id in rows) renderRow(id);
  for (const b of document.querySelectorAll('[data-layout]')) b.setAttribute('aria-pressed', +b.dataset.layout === S.layout);
  $('undoBtn').disabled = hi === 0; $('redoBtn').disabled = hi >= hist.length - 1; $('resetAllBtn').disabled = !count(S.look);
  renderHeads(); }
function renderHeads() {
  const tg = targets();
  for (const t of visible()) { if (!t.head) continue; const v = S.views[t.i], shared = t.zone && tg.get(t.zone)?.length > 1;
    t.cell.classList.toggle('tgt', t.zone && t.zone === S.target || S.target === 'all');
    t.head.replaceChildren(
      el('b', {}, String(t.i + 1)),
      el('button', { class: 'scene', 'aria-haspopup': 'dialog', title: 'Change the scene', onclick: e => scenePicker(t, e.currentTarget) }, (t.zone ? place(t.zone) : '…') + ' ', el('small', {}, v.name === 'walked' ? 'walked view' : v.name), ' ▾'),
      t.zone && S.look.zones[t.zone] ? el('span', { class: 'dot', title: 'This room has its own changes' }) : null,
      shared ? el('small', {}, 'shares its room with ' + tg.get(t.zone).filter(n => n !== t.i + 1).join(', ')) : null,
      el('span', { class: 'sp' }),
      el('small', {}, t.state === 'ready' ? (t.walking ? 'walking · Esc to stop' : 'click to walk') : t.state === 'failed' ? 'failed' : t.state === 'loading' ? 'loading' : 'waiting'),
      el('button', { 'aria-pressed': S.motion[t.i] ? 'true' : 'false', title: 'Let time run in this tile (water, waves, shimmer); off, it draws only when a value changes', onclick: () => setMotion(t.i, !S.motion[t.i]) }, 'Motion')); } }

// ---------- popovers ----------
const pop = $('pop'); let popFor = null;
function openPop(anchor, build) {
  closePop(); popFor = anchor; anchor.setAttribute('aria-expanded', 'true'); pop.hidden = false; pop.replaceChildren();
  const at = () => { const r = anchor.getBoundingClientRect(), w = pop.offsetWidth; pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px'; pop.style.top = r.bottom + 4 + 'px';
    pop.style.maxHeight = (innerHeight - r.bottom - 16) + 'px'; };
  const p = build(pop); at(); (pop.querySelector('input,button'))?.focus(); Promise.resolve(p).then(() => { if (popFor === anchor) { at(); if (!pop.contains(document.activeElement)) pop.querySelector('input,button')?.focus(); } }); }
function closePop() { if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; pop.hidden = true; }
addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && e.target !== popFor && !popFor?.contains(e.target)) closePop(); });
function scenePicker(t, anchor) {
  openPop(anchor, p => {
    p.setAttribute('aria-label', 'Scene for tile ' + (t.i + 1)); p.className = 'scenes';
    const q = el('input', { type: 'search', placeholder: 'Search scenes', 'aria-label': 'Search scenes' }), list = el('div', { class: 'list' });
    const fill = () => { const s = q.value.toLowerCase().trim(), g = new Map();
      for (const v of views) { const z = zoneOf?.[v.name], pl = z ? place(z) : 'Scenes'; if (s && !(v.name + ' ' + pl).toLowerCase().includes(s)) continue; if (!g.has(pl)) g.set(pl, []); g.get(pl).push(v); }
      list.replaceChildren(...[...g].flatMap(([pl, vs]) => [el('div', { class: 'lab' }, pl), ...vs.map(v => el('button', { class: 'item' + (S.views[t.i].name === v.name ? ' cur' : ''), onclick: () => { closePop(); setScene(t.i, v.name); } }, v.name.replace(/-/g, ' ')))]));
      if (!g.size) list.append(el('div', { class: 'empty' }, 'No scene matches')); };
    q.addEventListener('input', fill); q.addEventListener('keydown', e => { if (e.key === 'Enter') list.querySelector('.item')?.click(); });
    p.append(q, list); fill(); }); }
function presetsPop(anchor) {
  openPop(anchor, async p => {
    p.setAttribute('aria-label', 'Presets'); p.className = 'presets';
    const str = el('input', { type: 'range', min: 0, max: 1.5, step: .05, value: S.strength, 'aria-label': 'Strength' }), sv = el('span', { class: 'val' }, Math.round(S.strength * 100) + '%');
    str.addEventListener('input', () => { S.strength = +str.value; sv.textContent = Math.round(S.strength * 100) + '%'; persist(); });
    const mode = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'How a preset is laid in' }, ['replace', 'over'].map(m => el('button', { role: 'radio', 'aria-checked': S.mode === m ? 'true' : 'false', title: m === 'replace' ? 'The preset replaces the working look' : 'The preset is laid over the working look (multipliers multiply, offsets add)', onclick: e => { S.mode = m; persist(); for (const b of mode.children) b.setAttribute('aria-checked', b === e.currentTarget); } }, m === 'replace' ? 'Replace' : 'Lay over')));
    const list = el('div', { class: 'list' }), name = el('input', { type: 'text', placeholder: 'name', 'aria-label': 'Preset name', maxlength: 64 });
    const where = el('div', { class: 'note' });
    const refill = async () => { await listPresets();
      where.textContent = P.disk ? 'Presets are saved on disk, in looks/presets/.' : 'No save server here: presets are kept in this browser only (export to keep a file).';
      list.replaceChildren(...P.names.map(n => { const starter = STARTERS.includes(n);
        const hold = el('button', { class: 'hold', title: 'Hold to see this preset (at the strength above, as it would be laid in) in every tile' }, 'hold');
        holdButton(hold, on => peek(on ? n : null));
        return el('div', { class: 'prow' }, el('button', { class: 'item', title: 'Load at the strength and mode above', onclick: () => loadPreset(n).catch(e => msg(e.message)) }, n.replace(/-/g, ' ')), starter ? el('small', {}, 'starter') : null, el('span', { class: 'sp' }), hold,
          starter ? null : el('button', { title: 'Rename', onclick: async () => { const b = prompt('New name for ' + n, n); if (b) try { msg('Renamed to ' + await renamePreset(n, b)); refill(); } catch (e) { msg(e.message); } } }, 'rename'),
          starter ? null : el('button', { title: 'Delete', onclick: async () => { if (confirm('Delete the preset ' + n + '?')) try { await deletePreset(n); msg('Deleted ' + n); refill(); } catch (e) { msg(e.message); } } }, 'delete')); })); fillCmp(); };
    p.append(el('div', { class: 'line' }, el('span', { class: 'lab' }, 'Strength'), str, sv), el('div', { class: 'line' }, el('span', { class: 'lab' }, 'Lay in'), mode), list,
      el('div', { class: 'line' }, name, el('button', { onclick: async () => { try { const n = await savePreset(name.value); msg('Saved as ' + n + (P.disk ? ' (on disk)' : ' (in this browser)')); name.value = ''; refill(); } catch (e) { msg(e.message); } } }, 'Save working look')),
      el('div', { class: 'line' }, el('button', { onclick: () => download((slug(name.value) || 'look') + '.json', JSON.stringify(S.look, null, 2) + '\n') }, 'Export to file'), el('button', { onclick: () => $('importFile').click() }, 'Import from file')), where);
    await refill(); }); }
function applyPop(anchor) {
  openPop(anchor, async p => {
    p.setAttribute('aria-label', 'The game’s look'); p.className = 'apply';
    const n = count(await applied());
    p.append(el('div', { class: 'note' }, n ? `The game currently starts with an applied look of ${n} value${n > 1 ? 's' : ''} (js/look.applied.js).` : 'The game currently starts as built: no look is applied (js/look.applied.js is empty).'),
      el('div', { class: 'line' }, el('button', { onclick: () => { closePop(); applyToGame(); } }, 'Apply working look to the game'), el('button', { disabled: !n, onclick: () => { closePop(); S.look = clone(appliedLook); commit('Started from the applied look'); } }, 'Start from it')),
      el('div', { class: 'note' }, 'Applying writes js/look.applied.js through the local server (or downloads it on a static host). Players get it once the bundle is rebuilt (node tools/bundle.mjs), committed and pushed.')); }); }
function holdButton(b, f) { const off = () => { if (b.held) { b.held = false; b.removeAttribute('aria-pressed'); f(false); } };
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.held = true; b.setAttribute('aria-pressed', 'true'); f(true); }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
  b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); b.held = true; f(true); } }); b.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') off(); }); b.addEventListener('blur', off); }
async function peek(name) { // hold a preset: as it would be laid in now (strength, mode)
  if (!name) return setShow(null); try { const L = scaled(await readPreset(name), S.strength); cmpLook = sanitize(S.mode === 'over' ? over(S.look, L) : L); setShow('cmp'); } catch (e) { msg(e.message); } }
function setShow(v) { show = v; document.body.classList.toggle('peek', !!v); $('msg').textContent = v === 'before' ? 'Before: the game as built' : v === 'cmp' ? 'Against: the compare look' : ''; for (const t of visible()) t.key = null; flush(); }
async function holdCompare(on) { if (!on) return setShow(null); try { cmpLook = await readPreset(S.cmp); setShow('cmp'); $('msg').textContent = 'Against: ' + (S.cmp === 'applied' ? 'the applied look' : S.cmp); } catch (e) { msg(e.message); } }
function fillCmp() { const s = $('cmpSel'); s.replaceChildren(el('option', { value: 'applied' }, 'applied look'), ...P.names.map(n => el('option', { value: n }, n.replace(/-/g, ' ')))); if (![...s.options].some(o => o.value === S.cmp)) S.cmp = 'applied'; s.value = S.cmp; }

// ---------- wiring ----------
for (const b of document.querySelectorAll('[data-layout]')) b.onclick = () => setLayout(+b.dataset.layout);
$('undoBtn').onclick = undo; $('redoBtn').onclick = redo; $('resetAllBtn').onclick = () => { S.look = empty(); commit('Working look cleared: the game as built'); };
$('presetsBtn').onclick = e => popFor === e.currentTarget ? closePop() : presetsPop(e.currentTarget);
$('applyBtn').onclick = e => popFor === e.currentTarget ? closePop() : applyPop(e.currentTarget);
$('cmpSel').onchange = e => { S.cmp = e.target.value; persist(); };
holdButton($('beforeBtn'), on => setShow(on ? 'before' : null)); holdButton($('cmpBtn'), holdCompare);
$('importFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 65536) return msg('Refused: that file is larger than a look'); importText(await f.text()); };
const typing = () => { const a = document.activeElement; return a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.tagName === 'INPUT' && !['range', 'button', 'checkbox', 'radio'].includes(a.type)); };
addEventListener('keydown', e => {
  if (e.key === 'Escape') return closePop();
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !typing()) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY' && !typing()) { e.preventDefault(); redo(); return; }
  if (typing() || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.code === 'KeyB') setShow('before'); else if (e.code === 'KeyN') holdCompare(true);
  else if (/^Digit[0-4]$/.test(e.code)) { const n = +e.code[5]; if (!n) setTarget('all'); else if (T[n - 1]?.zone && n <= S.layout) setTarget(T[n - 1].zone); } });
addEventListener('keyup', e => { if ((e.code === 'KeyB' && show === 'before') || (e.code === 'KeyN' && show === 'cmp')) setShow(null); });
addEventListener('blur', () => { if (show) setShow(null); });

await listPresets(); fillCmp(); buildTiles(); applied();
if (count(S.look)) msg(`Working look restored: ${count(S.look)} values`);

// ---------- scripting surface for tools/browse.mjs and tools/test.mjs (docs/look.md) ----------
const grab = i => { const t = T[i], d = t.d, cv = d.renderer.domElement, c = document.createElement('canvas'); c.width = 160; c.height = 90; // a small picture of the tile's next frame
  d.step(1, TINY); c.getContext('2d').drawImage(cv, 0, 0, 160, 90); return Array.from(c.getContext('2d').getImageData(0, 0, 160, 90).data); };
const diff = (a, b) => { let s = 0, n = 0; for (let k = 0; k < a.length; k++) if (k % 4 !== 3) { s += Math.abs(a[k] - b[k]); n++; } return +(s / n).toFixed(2); };
window.dev = { get ready() { return visible().every(t => t.state === 'ready' || t.state === 'failed'); }, tune: {
  S, T, hist: () => ({ hi, n: hist.length }), layout: setLayout, scene: setScene, target: setTarget, motion: setMotion,
  set(id, v, t = S.target) { setVal(t, id, v); commit(); return flush(); }, look: () => clone(S.look), setLook(L) { S.look = sanitize(L); commit(); return flush(); },
  undo() { undo(); return flush(); }, redo() { redo(); return flush(); }, before(on) { setShow(on ? 'before' : null); }, async against(name, on) { S.cmp = name; await holdCompare(on); },
  async preset(name, strength, mode) { await loadPreset(name, strength, mode); return flush(); }, save: savePreset, remove: deletePreset, rename: renamePreset, list: listPresets, disk: () => P.disk,
  importText, apply: applyToGame, applied, grab, diff, flush, zoneOf: () => zoneOf } };
