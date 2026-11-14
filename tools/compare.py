"""Compare two folders of PNGs. python tools/compare.py <dirA> <dirB> [--top 5] [--out <dir>]
One line per name in both: mean abs difference per channel (0-255), % of pixels differing by > 24; largest first.
Side-by-side (A | B | difference x8) is written for the top N only. Always exits 0."""
import sys, os, argparse
from PIL import Image, ImageChops
ap = argparse.ArgumentParser(); ap.add_argument('a'); ap.add_argument('b'); ap.add_argument('--top', type=int, default=5); ap.add_argument('--out')
o = ap.parse_args(); out = o.out or os.path.join(o.b, '_compare')
png = lambda d: {f for f in os.listdir(d) if f.lower().endswith('.png')}
A, B = png(o.a), png(o.b); rows = []
for f in sorted(A & B):
    x, y = Image.open(os.path.join(o.a, f)).convert('RGB'), Image.open(os.path.join(o.b, f)).convert('RGB')
    if x.size != y.size: print(f'{f}: size differs {x.size} vs {y.size}'); continue
    d = ImageChops.difference(x, y); px = list(d.getdata()); n = len(px)
    mean = sum(sum(p) for p in px) / (3 * n); pct = 100 * sum(1 for p in px if max(p) > 24) / n
    rows.append((mean, pct, f[:-4], x, y, d))
rows.sort(key=lambda r: -r[0])
for m, p, n, *_ in rows: print(f'{n}  {m:.2f}  {p:.2f}%')
if rows: os.makedirs(out, exist_ok=True)
for m, p, n, x, y, d in rows[:o.top]:
    s = Image.new('RGB', (x.width * 3, x.height)); s.paste(x, (0, 0)); s.paste(y, (x.width, 0)); s.paste(d.point(lambda v: min(255, v * 8)), (x.width * 2, 0)); s.save(os.path.join(out, n + '.png'))
ms = [r[0] for r in rows]
print(f'max {max(ms, default=0):.2f}, mean {sum(ms) / len(ms) if ms else 0:.2f}, {len(rows)} compared, only in A: {sorted(f[:-4] for f in A - B) or "none"}, only in B: {sorted(f[:-4] for f in B - A) or "none"}')
