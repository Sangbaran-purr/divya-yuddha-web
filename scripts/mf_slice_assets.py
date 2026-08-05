#!/usr/bin/env python3
"""M-F1 asset derivatives. Masters in docs/design/mf/ stay untouched; web-weight
derivatives written to assets/brand/mf/. Content-mapped (the master filenames are
swapped: the 'header_citadel' master holds the four medallions; the 'icons_sheet'
master holds the citadel landscape)."""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs/design/mf")
OUT = os.path.join(ROOT, "assets/brand/mf")
os.makedirs(OUT, exist_ok=True)

def darkness_cols(img, thresh=95):
    g = img.convert("L")
    w, h = g.size
    px = g.load()
    prof = []
    for x in range(w):
        c = 0
        for y in range(0, h, 3):
            if px[x, y] < thresh:
                c += 1
        prof.append(c)
    return prof

def clusters(prof, min_run, gap=40):
    # columns with meaningful dark content
    thr = max(prof) * 0.18
    on = [i for i, v in enumerate(prof) if v > thr]
    if not on:
        return []
    groups = []
    start = prev = on[0]
    for i in on[1:]:
        if i - prev > gap:
            groups.append((start, prev))
            start = i
        prev = i
    groups.append((start, prev))
    return [g for g in groups if g[1] - g[0] > min_run]

def circle_cut(crop, out_size, feather=6):
    crop = crop.convert("RGBA")
    w, h = crop.size
    s = min(w, h)
    # center the square
    left = (w - s) // 2
    top = (h - s) // 2
    crop = crop.crop((left, top, left + s, top + s))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((2, 2, s - 2, s - 2), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(feather))
    crop.putalpha(mask)
    return crop.resize((out_size, out_size), Image.LANCZOS)

# ---- 1. four medallions (from the 'header_citadel' master — content is the icon sheet) ----
med = Image.open(os.path.join(SRC, "mf_header_citadel.png")).convert("RGB")
prof = darkness_cols(med)
cl = clusters(prof, min_run=120)
print("medallion x-clusters:", cl)
names = ["liquid", "vesting", "staked", "rewards"]
if len(cl) != 4:
    # fallback: even quarters
    w = med.size[0]
    cl = [(int(w * (i + 0.06) / 4), int(w * (i + 0.94) / 4)) for i in range(4)]
    print("fallback quarters:", cl)
for (x0, x1), name in zip(cl, names):
    cx = (x0 + x1) // 2
    half = int((x1 - x0) * 0.62)  # a touch of headroom for the vertical points
    box = (max(0, cx - half), max(0, med.size[1] // 2 - half),
           min(med.size[0], cx + half), min(med.size[1], med.size[1] // 2 + half))
    icon = circle_cut(med.crop(box), 256)
    icon.save(os.path.join(OUT, f"icon_{name}.png"))
    print("wrote icon_%s.png %s" % (name, icon.size))

# ---- 2. runway hourglass dial ----
hg = Image.open(os.path.join(SRC, "mf_icon_runway_hourglass.png")).convert("RGB")
gp = hg.convert("L")
w, h = gp.size
px = gp.load()
# tight bbox of the dark dial
xs, ys = [], []
for y in range(0, h, 3):
    for x in range(0, w, 3):
        if px[x, y] < 70:
            xs.append(x); ys.append(y)
if xs:
    cx = (min(xs) + max(xs)) // 2
    cy = (min(ys) + max(ys)) // 2
    r = int(max(max(xs) - min(xs), max(ys) - min(ys)) / 2 * 1.06)
else:
    cx, cy, r = w // 2, h // 2, w // 2
box = (cx - r, cy - r, cx + r, cy + r)
circle_cut(hg.crop(box), 256).save(os.path.join(OUT, "icon_runway.png"))
print("wrote icon_runway.png")

# ---- 3. header citadel strip (from the 'icons_sheet' master — content is the landscape) ----
cit = Image.open(os.path.join(SRC, "mf_icons_sheet.png")).convert("RGB")
w, h = cit.size
# a wide header band from the upper-mid (sky + citadel), scaled to ~1600 wide
band = cit.crop((0, int(h * 0.10), w, int(h * 0.62)))
tw = 1600
band = band.resize((tw, int(band.size[1] * tw / band.size[0])), Image.LANCZOS)
band.save(os.path.join(OUT, "header_citadel.jpg"), quality=82, optimize=True)
print("wrote header_citadel.jpg %s" % (band.size,))
