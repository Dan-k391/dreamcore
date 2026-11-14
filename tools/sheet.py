"""Contact sheet. python tools/sheet.py <out.png> <dir-or-files...> [--cols 4] [--width 2560] [--match <substring>]
Each image in a grid with its file name (no extension) on a dark strip above it."""
import sys, os, argparse
from PIL import Image, ImageDraw, ImageFont
ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('src', nargs='+'); ap.add_argument('--cols', type=int, default=4); ap.add_argument('--width', type=int, default=2560); ap.add_argument('--match', default='')
o = ap.parse_args(); files = []
for s in o.src: files += [os.path.join(s, f) for f in sorted(os.listdir(s))] if os.path.isdir(s) else [s]
files = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg')) and o.match in os.path.basename(f)]
if not files: sys.exit('no images')
g = 6; cw = (o.width - g * (o.cols + 1)) // o.cols; fs = max(14, cw // 22); strip = fs + 10
try: font = ImageFont.truetype('arial.ttf', fs)
except OSError: font = ImageFont.load_default(fs)
ims = []
for f in files:
    im = Image.open(f).convert('RGB'); ims.append((os.path.splitext(os.path.basename(f))[0], im.resize((cw, round(im.height * cw / im.width)), Image.LANCZOS)))
rh = [max(i.height for _, i in ims[k:k + o.cols]) + strip for k in range(0, len(ims), o.cols)]
sh = Image.new('RGB', (o.width, sum(rh) + g * (len(rh) + 1)), (12, 12, 12)); d = ImageDraw.Draw(sh); y = g
for r, k in enumerate(range(0, len(ims), o.cols)):
    for c, (n, im) in enumerate(ims[k:k + o.cols]):
        x = g + c * (cw + g); d.rectangle([x, y, x + cw, y + strip], fill=(40, 40, 40)); d.text((x + 6, y + 4), n, fill=(240, 220, 170), font=font); sh.paste(im, (x, y + strip))
    y += rh[r] + g
sh.save(o.out); print(f'{o.out}: {len(ims)} images, {sh.width}x{sh.height}')
