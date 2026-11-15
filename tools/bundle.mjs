// One self-contained page: index.html plus every module the game imports (its own js/ and the vendored three.js), in one file
// that runs from a file:// URL with no server and no network. No bundler: each module's source is embedded as a string, turned
// into a Blob URL at load, and a generated import map names each one; every import specifier (static, dynamic, relative, bare)
// is rewritten to that name ("dreamcore/<path>"). They stay real ES modules, so circular imports, top-level await and the
// dynamic imports behave as when served. The dev-only places (showroom, yard) are included: they are dynamic imports in the graph.
//
//   node tools/bundle.mjs [out]      writes dreamcore.html at the repo root by default
//   import { bundle } from './bundle.mjs'; bundle() -> the file's text (tools/test.mjs checks the committed file against it)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, posix, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n'); // a CRLF checkout gives the same bundle
// static `import ... from 'x'`, `export ... from 'x'`, `import 'x'` at a statement start, and `import('x')`
const SPEC = /((?:^|[;\n])[ \t]*(?:(?:import|export)\s[^'"`;]*?\bfrom\s*|import\s*))(['"])([^'"\n]+)\2|(\bimport\s*\(\s*)(['"])([^'"\n]+)\5(\s*\))/g;
const name = p => 'dreamcore/' + p;

function resolve(spec, from) {
  if (spec === 'three') return 'vendor/three/build/three.module.js';
  if (spec.startsWith('three/addons/')) return 'vendor/three/examples/jsm/' + spec.slice(13);
  if (spec.startsWith('./') || spec.startsWith('../')) return posix.normalize(posix.join(posix.dirname(from), spec));
  throw new Error(`${from}: cannot resolve import '${spec}'`);
}

export function bundle() {
  const html = read('index.html'), mods = {}, todo = ['js/main.js'];
  while (todo.length) {
    const p = todo.shift(); if (name(p) in mods) continue;
    let src = read(p), found = 0;
    src = src.replace(SPEC, (m, pre, q, s, dpre, dq, ds, dpost) => { found += !!ds; const t = resolve(s ?? ds, p); todo.push(t);
      return s ? pre + q + name(t) + q : dpre + dq + name(t) + dq + dpost; });
    if ((src.match(/\bimport\s*\(/g) || []).length !== found) throw new Error(`${p}: an import() whose argument is not a plain string`);
    if (/\bimport\.meta\b/.test(src)) throw new Error(`${p}: import.meta has no meaning inside the bundle`);
    mods[name(p)] = src + `\n//# sourceURL=${name(p)}\n`;
  }
  const json = JSON.stringify(mods).replace(/</g, '\\u003c'); // nothing inside can close or confuse the <script>
  const loader = `<script>
(() => { // make each module a Blob URL, name them all in an import map, then start the game
  const src = ${json}, imports = {};
  for (const k in src) imports[k] = URL.createObjectURL(new Blob([src[k]], { type: 'text/javascript' }));
  const map = document.createElement('script'); map.type = 'importmap'; map.textContent = JSON.stringify({ imports }); document.head.append(map);
  const main = document.createElement('script'); main.type = 'module'; main.textContent = 'import "${name('js/main.js')}";'; document.body.append(main);
})();
</script>`;
  const map = /<script type="importmap">[\s\S]*?<\/script>\n/, entry = '<script type="module" src="js/main.js"></script>';
  if (!map.test(html) || !html.includes(entry)) throw new Error('index.html: import map or entry script not found');
  return html.replace(map, '').replace(entry, () => loader)
    .replace('<!doctype html>\n', () => `<!doctype html>\n<!-- dreamcore, one file: built by tools/bundle.mjs from index.html and js/; do not edit by hand.\nIt contains three.js r170 (vendor/three/), under this licence:\n\n${read('vendor/three/LICENSE').trim()}\n-->\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2] || join(root, 'dreamcore.html'), text = bundle();
  writeFileSync(out, text); console.log(`${out}: ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`);
}
