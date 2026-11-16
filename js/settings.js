// Settings: the panel shown while paused (index.html #p: volume, mute, music level, quality, fps, vsync), the fps readout (#f), and their saved choices.
import { sound } from './audio.js';
import { setQuality } from './post.js';

// Low and Medium chosen from tools/perf-style timings (see the commit): render scale, scene MSAA samples, AO resolution. High: what the game always drew.
const levels = [{ scale: .6, msaa: 2, ao: .5 }, { scale: .85, msaa: 2, ao: .5 }, { scale: 1, msaa: 4, ao: 1 }];
const $ = id => document.getElementById(id), o = $('o'), isDev = new URLSearchParams(location.search).has('dev'), KEY = 'dreamcore.settings';
const s = { vol: 100, mus: 100, muted: false, q: 2, fps: true, vsync: true };
const hooks = {}; // main.js's: vsync(on) switches the frame loop; settings.js's: frame(t), called once per game frame, feeds the fps readout
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }; // a private window may refuse storage: the settings then last the visit
const qBtns = [...$('p').querySelectorAll('[data-q]')], f = $('f'), fpsTxt = f.querySelector('b'), cv = f.querySelector('canvas');

function apply() {
  sound.onchange = null; sound.set((s.vol / 100) ** 2, s.muted, (s.mus / 100) ** 2); sound.onchange = fromSound; // squared: even steps sound even
  setQuality(levels[s.q]);
  $('pv').value = s.vol; $('pu').value = s.mus; $('pm').setAttribute('aria-pressed', s.muted); $('pf').setAttribute('aria-pressed', s.fps); $('py').setAttribute('aria-pressed', s.vsync); hooks.vsync?.(s.vsync);
  qBtns.forEach((b, i) => b.setAttribute('aria-pressed', i === s.q));
  showFps(s.fps && (!isDev || dev.fps)); // under ?dev (the photo and test tools) only when a hook asks
}
function fromSound() { s.muted = sound.muted; $('pm').setAttribute('aria-pressed', s.muted); save(); } // the M key
function load() { // also the test's stand-in for a reload
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v) Object.assign(s, { vol: Math.min(100, Math.max(0, +v.vol || 0)), mus: Math.min(100, Math.max(0, +(v.mus ?? 100) || 0)), muted: !!v.muted, q: [0, 1, 2].includes(v.q) ? v.q : 2, fps: v.fps !== false, vsync: v.vsync !== false }); } catch {}
  apply();
}
const set = v => { Object.assign(s, v); save(); apply(); };
$('pv').addEventListener('input', e => set({ vol: +e.target.value }));
$('pu').addEventListener('input', e => set({ mus: +e.target.value }));
$('pm').onclick = () => set({ muted: !s.muted });
$('pf').onclick = () => set({ fps: !s.fps });
$('py').onclick = () => set({ vsync: !s.vsync });
qBtns.forEach((b, i) => b.onclick = () => set({ q: i }));

// P opens the panel by pausing (Esc's way when the mouse is captured, the overlay directly in the bare-cursor mode) and closes it by resuming; F shows or hides the fps.
o.addEventListener('click', () => document.activeElement?.blur?.()); // a panel button keeping focus would catch Space (jump) during play
addEventListener('keydown', e => {
  if (e.repeat || isDev && !dev.fps) return;
  if (e.code === 'KeyF') set({ fps: !s.fps });
  if (e.code !== 'KeyP') return;
  if (o.style.display !== 'none') o.click();
  else if (document.pointerLockElement) document.exitPointerLock();
  else { o.style.display = ''; for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) dispatchEvent(new KeyboardEvent('keyup', { code: c })); } // let go of held keys, as Esc does
});

// ---------- fps: real intervals between game frames (main.js calls hooks.frame once each), the number 4 times a second, the last ~8 s of frame times as a line ----------
const N = 512, dts = new Float32Array(N), g = cv.getContext('2d'), W = cv.width, H = cv.height, MAX = 50; // ms at the top of the graph: fixed, so the line holds still
let head = 0, last = 0, acc = 0, frames = 0;
function tick(t) {
  if (last) { const dt = t - last; dts[head++ % N] = dt; acc += dt; frames++; if (acc >= 250) { draw(1000 * frames / acc); acc = frames = 0; } }
  last = t;
}
function draw(fps) {
  fpsTxt.textContent = Math.round(fps) + ' fps'; f.dataset.fps = fps.toFixed(1);
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(243,234,216,.6)'; g.font = '7px Georgia'; g.fillText('ms', 1, 7);
  g.fillStyle = 'rgba(243,234,216,.18)'; g.fillRect(12, H - 1 - Math.round(16.7 / MAX * (H - 2)), W - 12, 1); // 60 fps
  g.strokeStyle = '#efe1c2'; g.lineWidth = 1; g.beginPath();
  const per = 5, cols = W - 12, n = Math.min(head, cols * per); // 5 frames a pixel, the worst of them (a dip stays visible)
  for (let c = 0; c < cols; c++) { let m = 0; for (let k = 0; k < per; k++) { const i = head - n + c * per + k; if (i >= 0 && i < head) m = Math.max(m, dts[i % N]); }
    if (!m) continue; const y = H - 1 - Math.min(m, MAX) / MAX * (H - 2); c ? g.lineTo(12 + c + .5, y) : g.moveTo(12.5, y); }
  g.stroke();
}
function showFps(on) {
  f.hidden = !on;
  if (on && !hooks.frame) { last = 0; hooks.frame = tick; } else if (!on) hooks.frame = null;
}

if (isDev) Object.defineProperty(dev, 'settings', { value: { load, s, levels } }); // fps: set dev.fps = true, then dev.settings.load()
document.getElementById('s').textContent += '  ·  p settings  ·  f fps';
load();
export { s, hooks };
