// Static file server for tests: `node tools/serve.mjs [port=8200]` serves the folder it is run from, on 127.0.0.1 only.
// Used instead of python's http.server, which refuses connections when several test browsers load the modules at once.
// It also saves looks (docs/look.md): PUT /looks/applied writes js/look.applied.js; GET /looks/presets lists, GET/PUT/DELETE
// /looks/presets/<name> reads, writes, removes looks/presets/<name>.json. Every body goes through js/look.params.js's sanitize, never raw.
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import { join, extname, sep } from 'node:path';
import { sanitize } from '../js/look.params.js';

const port = +process.argv[2] || 8200, root = process.cwd(), presets = join(root, 'looks', 'presets'), MAX = 64 * 1024;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const body = req => new Promise((ok, no) => { let n = 0; const parts = [];
  req.on('data', c => { n += c.length; if (n > MAX) { no(413); } else parts.push(c); });
  req.on('end', () => { try { ok(sanitize(JSON.parse(Buffer.concat(parts).toString('utf8')))); } catch { no(400); } }); req.on('error', () => no(400)); });
const send = (res, code, data, type = 'application/json') => res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }).end(data);
async function looks(req, res, path) { // -> true if it handled the request
  const m = path.match(/^\/looks\/(applied|presets)(?:\/([^/]*))?$/); if (!m) return false;
  const [, kind, name] = m, verb = req.method;
  try {
    if (kind === 'applied' && name === undefined && verb === 'PUT') { const L = await body(req);
      await writeFile(join(root, 'js', 'look.applied.js'), `// The look the game starts with (docs/look.md). Written by the tuning workspace through tools/serve.mjs (PUT /looks/applied); empty: the game as built.\nexport default ${JSON.stringify(L, null, 2)};\n`);
      send(res, 200, JSON.stringify(L)); return true; }
    if (kind === 'presets' && name === undefined && verb === 'GET') { const f = await readdir(presets).catch(() => []);
      send(res, 200, JSON.stringify(f.filter(n => /^[a-z0-9-]{1,64}\.json$/.test(n)).map(n => n.slice(0, -5)).sort())); return true; }
    if (kind === 'presets' && /^[a-z0-9-]{1,64}$/.test(name || '')) { const file = join(presets, name + '.json');
      if (verb === 'GET') { send(res, 200, JSON.stringify(sanitize(JSON.parse(await readFile(file, 'utf8'))))); return true; }
      if (verb === 'PUT') { const L = await body(req); await mkdir(presets, { recursive: true }); await writeFile(file, JSON.stringify(L, null, 2) + '\n'); send(res, 200, JSON.stringify(L)); return true; }
      if (verb === 'DELETE') { await unlink(file); send(res, 204, ''); return true; } }
    send(res, 400, '{"error":"bad request"}'); // a bad name, a bad method: refused
  } catch (e) { send(res, typeof e === 'number' ? e : e?.code === 'ENOENT' ? 404 : 400, '{"error":"refused"}'); }
  return true;
}
createServer(async (req, res) => {
  let path; try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (await looks(req, res, path)) return;
  const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; } // never serve anything outside the folder
  try { const data = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data); } // no-store: an edited file is never served stale
  catch { res.writeHead(404).end(); }
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
