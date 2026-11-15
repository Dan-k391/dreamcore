# Where a view of tools/water-check.mjs --img jumps: the same 4 px block rows dev.waterCheck scores, the worst six printed,
# and <dir>/<view>-<lens|mir>-seam.png written (test | direct | difference x4, the worst row marked in red).
#   python tools/water-seam.py <dir> <view> [lens|mir]
import sys
from PIL import Image, ImageChops, ImageDraw
d, v = sys.argv[1], sys.argv[2]
for k in sys.argv[3:] or ['lens', 'mir']:
    T, R = (Image.open(f'{d}/{v}-{k}{s}.png').convert('RGB') for s in 'TR')
    w, h = T.size
    t, r = (I.resize((w // 4, h // 4), Image.BOX).load() for I in (T, R))
    m = Image.open(f'{d}/{v}-mask.png').convert('L').point(lambda x: 255 if x > 128 else 0).resize((w // 4, h // 4), Image.BOX).load()
    dd = lambda P, a, b: sum(abs(x - y) for x, y in zip(P[a], P[b])) / 3
    rows = []
    for j in range(h // 4 - 1):
        c = jt = jr = 0
        for i in range(w // 4):
            if m[i, j] == 255 and m[i, j + 1] == 255: c += 1; jt += dd(t, (i, j), (i, j + 1)); jr += dd(r, (i, j), (i, j + 1))
        if c >= 8: rows.append(((jt - jr) / c, 4 * j + 4, c))
    rows.sort(reverse=True)
    print(k, ' '.join(f'row {j}: {s:.1f} ({c} blocks)' for s, j, c in rows[:6]))
    D = ImageChops.difference(T, R).point(lambda x: min(255, x * 4))
    out = Image.new('RGB', (w * 3, h)); [out.paste(I, (n * w, 0)) for n, I in enumerate((T, R, D))]
    if rows: ImageDraw.Draw(out).line([(0, rows[0][1]), (w * 3, rows[0][1])], fill=(255, 0, 0))
    out.save(f'{d}/{v}-{k}-seam.png')
