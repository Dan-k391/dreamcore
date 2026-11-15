// Photograph every inside corner of every room and flag thin bright lines there (light leaking through a joint).
//   node tools/corners.mjs <outDir> [--port 8200] [--size 400x250] [--only zoneId,zoneId] [--flag-only]
// Corners come from the solids (dev.colliders): wherever the face of one upright box meets the face of another at a right
// angle, with open floor in front of both, inside a zone's box. Each corner gets two photos from 1.4 m out, at eye height,
// looking into it: tilted down (the wall-floor joins) and up (the wall-ceiling joins). Then tools/corners.py reads them and
// prints the flagged ones; --flag-only skips the photos and re-reads <outDir>.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const out = argv[0], port = arg('port', '8200'), size = arg('size', '400x250'), only = arg('only'), here = dirname(fileURLToPath(import.meta.url));
if (!out || out.startsWith('--')) { console.error('usage: node tools/corners.mjs <outDir> [--port 8200] [--size 400x250] [--only zoneId,..] [--flag-only]'); process.exit(2); }
mkdirSync(out, { recursive: true });
if (!argv.includes('--flag-only')) {
  const find = `(async () => { const { warps } = await import('/js/build.js');
    const C = dev.colliders.filter(c => c.length === 6 && c[4] > -1e3 && c[5] - c[4] >= 1.5 && Math.min(c[2] - c[0], c[3] - c[1]) >= .05), Z = Object.values(dev.zones).filter(z => z.box && z.box[0] > -500);
    const inside = (x, y, z, skip) => C.some(c => c !== skip && x > c[0] + 1e-3 && x < c[2] - 1e-3 && z > c[1] + 1e-3 && z < c[3] - 1e-3 && y > c[4] && y < c[5]);
    const seen = new Set(), views = [];
    for (const A of C) for (const B of C) { if (A === B) continue;
      for (const [ax, sx] of [[A[0], -1], [A[2], 1]]) for (const [bz, sz] of [[B[1], -1], [B[3], 1]]) {
        // A's face x = ax runs on from the corner along sz; B's face z = bz runs on from it along sx; each reaches the other
        if (!(sz > 0 ? A[3] >= bz + .3 && A[1] <= bz + .01 : A[1] <= bz - .3 && A[3] >= bz - .01)) continue;
        if (!(sx > 0 ? B[2] >= ax + .3 && B[0] <= ax + .01 : B[0] <= ax - .3 && B[2] >= ax - .01)) continue;
        const f = dev.floorH(ax + sx * .3, bz + sz * .3), y = f + 1.6;
        if (!(Math.max(A[4], B[4]) < f + 1 && Math.min(A[5], B[5]) > f + 2.2)) continue; // both stand at eye height
        const zone = Z.find(z => ax + sx * .3 > z.box[0] && ax + sx * .3 < z.box[2] && bz + sz * .3 > z.box[1] && bz + sz * .3 < z.box[3]);
        if (!zone || (${JSON.stringify(only ? only.split(',') : null)} || [zone.id]).indexOf(zone.id) < 0) continue;
        const key = [ax.toFixed(2), bz.toFixed(2), sx, sz].join(); if (seen.has(key)) continue; seen.add(key);
        let d = 1.4; // stand back 1.4 m on the diagonal, closer if something is in the way
        const clear = d => { for (let t = .02; t <= 1; t += .02) if (inside(ax + sx * d * t, y, bz + sz * d * t)) return false; return true; };
        while (d > .5 && !clear(d)) d -= .3;
        if (d <= .5 || warps.some(w => ax + sx * d > w[0] && ax + sx * d < w[2] && bz + sz * d > w[1] && bz + sz * d < w[3])) continue; // standing in a warp would photograph its twin
        const x = ax + sx * d, z = bz + sz * d, yaw = Math.atan2(sx, sz).toFixed(4), name = zone.id + '_' + ax.toFixed(2) + '_' + bz.toFixed(2) + '_' + (sx > 0 ? 'E' : 'W') + (sz > 0 ? 'S' : 'N');
        for (const [tag, pitch] of [['lo', -.4], ['hi', .45]]) views.push({ name: name + '_' + tag, hash: [x.toFixed(3), z.toFixed(3), yaw, pitch].join() });
      } }
    return views; })()`;
  const r = spawnSync(process.execPath, [join(here, 'browse.mjs'), '--url', `http://127.0.0.1:${port}/?dev&bare`, '--eval', find], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const views = JSON.parse(r.stdout).result;
  if (!views) { console.error(r.stdout, r.stderr); process.exit(1); }
  writeFileSync(join(out, 'views.json'), JSON.stringify(views, null, 0));
  console.log(views.length / 2 + ' corners, ' + views.length + ' photos');
  const s = spawnSync(process.execPath, [join(here, 'shots.mjs'), out, '--port', port, '--views', join(out, 'views.json'), '--size', size], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const bad = s.stdout.split('\n').filter(l => l && !l.startsWith('ok')); if (bad.length) console.log(bad.join('\n'));
}
const p = spawnSync('python', [join(here, 'corners.py'), out], { encoding: 'utf8' });
process.stdout.write(p.stdout + p.stderr);
