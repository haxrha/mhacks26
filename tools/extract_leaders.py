"""Extract the four leader sprites (+ 32x32 portraits) from the 8-bit reference PDF ("EARTHSHARE — 8-bit Reference.pdf").

The Civilizations artboard is one JPEG where each art pixel is 18x18 image pixels. We sample each
cell, drop the crimson/confetti background, keep the main figure and snap JPEG noise to clean colours.

Usage: python tools/extract_leaders.py "<reference.pdf>" apps/web/public/assets/leaders
"""
import io, sys
import fitz  # PyMuPDF
import numpy as np
from PIL import Image

PDF, OUT = sys.argv[1], sys.argv[2]
_doc = fitz.open(PDF)
_xref = _doc[1].get_images(full=True)[0][0]
im = np.asarray(Image.open(io.BytesIO(_doc.extract_image(_xref)["image"])).convert("RGB")).astype(int)
CELL = 18
LEADERS = [("ostra", 540), ("moss", 1620), ("brask", 2700), ("pell", 3780)]
TOP, FLOOR = 1300, 2228

def grid_offset(a):
    best = None
    for oy in range(CELL):
        for ox in range(CELL):
            h = (a.shape[0] - oy) // CELL * CELL; w = (a.shape[1] - ox) // CELL * CELL
            b = a[oy:oy + h, ox:ox + w].reshape(h // CELL, CELL, w // CELL, CELL, 3)
            inner = b[:, 3:-3, :, 3:-3]
            v = inner.std(axis=(1, 3)).mean()
            if best is None or v < best[0]: best = (v, ox, oy)
    return best[1], best[2]

def extract(cx):
    a = im[TOP:FLOOR, cx - 330:cx + 330]
    ox, oy = grid_offset(a[:400, :])
    h = (a.shape[0] - oy) // CELL; w = (a.shape[1] - ox) // CELL
    cells = np.zeros((h, w, 3), int)
    for j in range(h):
        for i in range(w):
            blk = a[oy + j * CELL + 4: oy + (j + 1) * CELL - 4, ox + i * CELL + 4: ox + (i + 1) * CELL - 4]
            cells[j, i] = np.median(blk.reshape(-1, 3), axis=0)
    lum = cells @ np.array([0.3, 0.59, 0.11])
    r, g = cells[..., 0], cells[..., 1]
    crimson = (r - g > 40) & (lum < 75) & (r < 150)
    # confetti specks: non-crimson cells mostly surrounded by crimson
    pad = np.pad(crimson, 1, constant_values=True)
    around = pad[:-2, 1:-1].astype(int) + pad[2:, 1:-1] + pad[1:-1, :-2] + pad[1:-1, 2:]
    passable = crimson | (around >= 3)
    reached = np.zeros((h, w), bool)
    st = [(j, i) for j in range(h) for i in (0, w - 1)] + [(0, i) for i in range(w)] + [(h - 1, i) for i in range(w)]
    while st:
        y, x = st.pop()
        if not (0 <= y < h and 0 <= x < w) or reached[y, x] or not passable[y, x]: continue
        reached[y, x] = True
        st += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    sprite = ~reached
    # keep only the largest connected figure (drops the floating 1P cursor and stray confetti)
    lab = np.zeros((h, w), int); best = (0, 0); n = 0
    for j in range(h):
        for i in range(w):
            if sprite[j, i] and not lab[j, i]:
                n += 1; size = 0; st = [(j, i)]
                while st:
                    y, x = st.pop()
                    if not (0 <= y < h and 0 <= x < w) or not sprite[y, x] or lab[y, x]: continue
                    lab[y, x] = n; size += 1
                    st += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
                if size > best[0]: best = (size, n)
    sprite = lab == best[1]
    # drop one-pixel confetti specks clinging to the outline
    for _ in range(2):
        pad = np.pad(sprite, 1).astype(int)
        n4 = pad[:-2, 1:-1] + pad[2:, 1:-1] + pad[1:-1, :-2] + pad[1:-1, 2:]
        n8 = n4 + pad[:-2, :-2] + pad[:-2, 2:] + pad[2:, :-2] + pad[2:, 2:]
        sprite &= ~((n4 <= 1) & (n8 <= 2))
    ys, xs = np.nonzero(sprite)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    return cells[y0:y1 + 1, x0:x1 + 1], sprite[y0:y1 + 1, x0:x1 + 1]

def quantize(colors):
    """Merge JPEG noise: cluster colours within a small distance."""
    centers = []
    for c in colors:
        for k in centers:
            if np.abs(k[0] / k[1] - c).max() < 14:
                k[0] += c; k[1] += 1; break
        else:
            centers.append([c.astype(float), 1])
    return [k[0] / k[1] for k in centers]

for name, cx in LEADERS:
    cells, mask = extract(cx)
    pts = cells[mask]
    centers = quantize(pts)
    def snap(c): return min(centers, key=lambda k: np.abs(k - c).sum())
    rgba = np.zeros(cells.shape[:2] + (4,), np.uint8)
    for j in range(cells.shape[0]):
        for i in range(cells.shape[1]):
            if mask[j, i]: rgba[j, i] = [*np.round(snap(cells[j, i])).astype(int), 255]
    Image.fromarray(rgba).save(f"{OUT}/{name}.png")
    # portrait: head and shoulders on cream, 32x32
    body = Image.fromarray(rgba)
    w, h = body.size
    port = Image.new("RGBA", (32, 32), (217, 187, 120, 255))
    top = np.asarray(body)[:16, :, 3] > 0
    hx = int(np.nonzero(top.any(0))[0].mean())
    head = body.crop((hx - 16, 0, hx + 16, 32))
    port.alpha_composite(head, (0, 2))
    port.save(f"{OUT}/{name}-portrait.png")
    print(name, body.size, len(centers), "colours")

# ---------- talking frames ----------
# Each leader's mouth is a 4-pixel line under the eyes (found in the portrait at this row/column).
MOUTHS = {"ostra": (18, 15), "moss": (18, 16), "brask": (16, 11), "pell": (17, 15)}
INSIDE = (58, 22, 18, 255)

def talk_frame(img, mouth_rgb):
    """Open the mouth: dark inside with lip corners, plus a jaw row beneath."""
    a = np.asarray(img).copy()
    hgt, wid = a.shape[:2]
    for y in range(hgt):
        for x in range(wid - 3):
            if all(tuple(a[y, x + i, :3]) == mouth_rgb and a[y, x + i, 3] for i in range(4)):
                a[y, x + 1] = a[y, x + 2] = INSIDE
                if y + 1 < hgt:
                    a[y + 1, x + 1, :3] = a[y + 1, x + 2, :3] = mouth_rgb
                return Image.fromarray(a)
    raise RuntimeError("mouth not found")

for name, _ in LEADERS:
    port = Image.open(f"{OUT}/{name}-portrait.png").convert("RGBA")
    my, mx = MOUTHS[name]
    mouth_rgb = tuple(int(v) for v in np.asarray(port)[my, mx, :3])
    for kind in ("", "-portrait"):
        src = Image.open(f"{OUT}/{name}{kind}.png").convert("RGBA")
        talk_frame(src, mouth_rgb).save(f"{OUT}/{name}{kind}-talk.png")
    print(name, "talk frames", mouth_rgb)
