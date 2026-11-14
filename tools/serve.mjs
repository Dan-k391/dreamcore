// Static file server for tests: `node tools/serve.mjs [port=8200]` serves the folder it is run from, on 127.0.0.1 only.
// Used instead of python's http.server, which refuses connections when several test browsers load the modules at once.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, sep } from 'node:path';

const port = +process.argv[2] || 8200, root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = join(root, path.endsWith('/') ? path + 'index.html' : path);
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; } // never serve anything outside the folder
  try { const data = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data); } // no-store: an edited file is never served stale
  catch { res.writeHead(404).end(); }
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
