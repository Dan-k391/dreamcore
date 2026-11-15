"""Flag thin bright lines in the corner photos of tools/corners.mjs.
  python tools/corners.py <dir> [--show]
A line pixel is brighter, in luminance, than the pixels 3 px to both sides of it (across x or across y) by more than T.
Line pixels are joined into pieces (8-connected); a piece that is long (30 px or more along its longer side) and thin (on
average under 3 px across) and touches the middle column, where the photo puts the corner's upright edge, is a bright line
at the joint. Grout is dark and tile faces are wide, so a tiled wall gives none; lines elsewhere (window bars, ceiling grids,
door frames) are left alone.
Prints each flagged photo with its longest line, then a count. --show writes <dir>/_flags/<name>.png with the lines in red."""
import sys, os, glob
import numpy as np
from PIL import Image

T, LONG, THIN = 14, 30, 3.0

def lines(path):
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float32)
    L = a @ np.float32([.2126, .7152, .0722])
    p = np.pad(L, 3, mode='edge')
    rx = L - np.maximum(p[3:-3, :-6], p[3:-3, 6:])  # brighter than both sides across x: a vertical-ish line
    ry = L - np.maximum(p[:-6, 3:-3], p[6:, 3:-3])  # across y: a horizontal-ish line
    m = (np.maximum(rx, ry) > T)
    h, w = m.shape; lab = np.zeros(m.shape, np.int32); found = []; n = 0
    for y0, x0 in zip(*np.nonzero(m)):
        if lab[y0, x0]: continue
        n += 1; st = [(y0, x0)]; lab[y0, x0] = n; pts = []
        while st:
            y, x = st.pop(); pts.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    v, u = y + dy, x + dx
                    if 0 <= v < h and 0 <= u < w and m[v, u] and not lab[v, u]: lab[v, u] = n; st.append((v, u))
        ys = [q[0] for q in pts]; xs = [q[1] for q in pts]; long = max(max(ys) - min(ys), max(xs) - min(xs)) + 1
        # only lines at the joint: the corner's upright edge is the middle column, and the floor and ceiling joins start on it
        if long >= LONG and len(pts) / long < THIN and min(abs(x - w // 2) for x in xs) <= 6: found.append((long, len(pts) / long, n, min(xs), min(ys), max(xs), max(ys)))
    return sorted(found, reverse=True), lab

if __name__ == '__main__':
    d = sys.argv[1]; show = '--show' in sys.argv; files = sorted(f for f in glob.glob(os.path.join(d, '*.png')))
    flagged = 0
    for f in files:
        found, lab = lines(f)
        if not found: continue
        flagged += 1; l = found[0]
        print(f'{os.path.basename(f)[:-4]}: {len(found)} line(s), longest {l[0]} px, {l[1]:.1f} px across, box {l[3:]}')
        if show:
            os.makedirs(os.path.join(d, '_flags'), exist_ok=True)
            img = np.asarray(Image.open(f).convert('RGB')).copy()
            for q in found: img[lab == q[2]] = (255, 0, 0)
            Image.fromarray(img).save(os.path.join(d, '_flags', os.path.basename(f)))
    print(f'{flagged} of {len(files)} photos flagged')
