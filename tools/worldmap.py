"""EARTHSHARE world map generator.

320x200 tile map (1 px = 1 tile), upscaled 4x nearest-neighbour to 1280x800.
Four civ regions per AGENTS.md §5.1, each split into smaller areas marked by castles.
Outputs: world-map.png (static preview, no labels), world-map-labeled.png (reference), provinces.json,
and worldmap.json: the layer data the game renders live (base colors, terrain kind, areas, dynamic sprites).

Usage: python tools/worldmap.py <out_dir> <font_dir>   (font_dir holds PressStart2P.ttf)
"""
import json, math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
FONT_DIR = sys.argv[2] if len(sys.argv) > 2 else "."
W, H, S = 320, 200, 4
rng = np.random.default_rng(11)

def hx(c):
    c = c.lstrip("#"); return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)

P = {k: hx(v) for k, v in dict(
    deep="#16233f", sea="#21497a", shallow="#2b6fa0", river="#3a9bd2", foam="#6ab8cc", wave="#3b6ea8",
    grass="#5e9c3c", grass_l="#6fae48", grass_d="#4f8a32", meadow="#8cc35a", pasture="#7aa54a",
    forest="#3d7a2e", forest_d="#2d5e22", tree="#4f8f36", tree_d="#24501b", trunk="#5a3a1e",
    wheat="#d9bb4a", wheat_d="#b8982e", soil="#8a6238", soil_d="#6e4c2a", crop="#7fb04a",
    rock="#776e60", rock_l="#9a9182", rock_d="#5c554a", snow="#f4f4ec", snow_d="#c9cfd6",
    sand="#e6cf8a", sand_d="#cdb46e", marsh="#4e7a52", sludge="#6e6230", sludge_d="#4e4520",
    ink="#1a120a", stone_l="#cfc8b6", stone_m="#9a9182", stone_d="#6b6458", door="#3e2414",
    white="#f4f4ec", metal="#6b6b72", metal_d="#4a4a52", smoke="#c9c9c9", navy="#2a3b6e", navy_l="#4a63a8",
    plank="#8a5a32", red="#c8402c", gold="#f5c542",
    highland="#a07ad6", verdant="#7fd65a", forge="#f08a3c", tidehaven="#46d6d0",
).items()}
CIVS = ["highland", "verdant", "forge", "tidehaven"]

# ---------- noise ----------
def vnoise(scale):
    small = rng.random((H // scale + 3, W // scale + 3)).astype(np.float32)
    im = Image.fromarray(small, "F").resize((W + 3 * scale, H + 3 * scale), Image.BICUBIC)
    return np.asarray(im)[scale:scale + H, scale:scale + W]

def fbm():
    n = 0.5 * vnoise(40) + 0.25 * vnoise(20) + 0.15 * vnoise(10) + 0.1 * vnoise(5)
    return (n - n.min()) / (n.max() - n.min())

yy, xx = np.mgrid[0:H, 0:W]
n_land, n_a, n_b, n_c = fbm(), fbm(), fbm(), fbm()

# ---------- land ----------
d = ((xx - 160) / 150.0) ** 2 + ((yy - 99) / 93.0) ** 2
land = d + (n_land - 0.5) * 0.42 < 0.86
for (ix, iy, r) in [(284, 180, 14), (306, 160, 5), (34, 182, 6), (20, 170, 4)]:   # southern isles
    land |= ((xx - ix) ** 2 + ((yy - iy) * 1.3) ** 2 + (n_a - 0.5) * 60) < r * r
land[:5, :] = land[-5:, :] = False
land[:, :5] = land[:, -5:] = False

# ---------- water features ----------
def river_x(y): return 160 + 12 * math.sin(y / 16) + 5 * math.sin(y / 6.5 + 1)

water = np.zeros((H, W), bool)
lake_c = (river_x(46), 45)
lake = (((xx - lake_c[0]) / 14.0) ** 2 + ((yy - lake_c[1]) / 7.5) ** 2 + (n_b - 0.5) * 0.5) < 1
water |= lake & land
DAM_Y = 54
def paint_line(pts, width):
    for (x, y) in pts:
        r = width / 2
        x0, x1 = int(math.floor(x - r + 0.5)), int(math.floor(x + r + 0.5))
        for xi in range(x0, x1):
            yi = int(round(y))
            if 0 <= xi < W and 0 <= yi < H: water[yi, xi] = True
for y in np.arange(DAM_Y - 2, H, 0.5):                       # main river
    x = river_x(y)
    if y > 120 and not land[int(y), int(x)]:
        break
    paint_line([(x, y)], 2 if y < 100 else 3)
for k in (-1, 1):                                            # delta branches
    for y in np.arange(168, 192, 0.5):
        paint_line([(river_x(y) + k * (y - 168) * 1.1, y)], 2)
for (sx, sy) in [(118, 14), (206, 16)]:                      # glacier streams into the lake
    for t in np.linspace(0, 1, 160):
        x = sx + (lake_c[0] - sx) * t + 3 * math.sin(t * 9)
        y = sy + (lake_c[1] - sy) * t
        paint_line([(x, y)], 1)
tx_end = river_x(118)
for t in np.linspace(0, 1, 300):                             # Verdant tributary
    x = 52 + (tx_end - 52) * t
    y = 82 + 36 * t + 5 * math.sin(t * math.pi * 2.2)
    paint_line([(x, y)], 2)
water &= land | (yy > 150)
water_land = water & land

# ---------- regions ----------
civ = np.full((H, W), -1)
rx = np.array([river_x(y) for y in range(H)])[:, None]
civ[land & (yy < 66)] = 0
civ[land & (yy >= 66) & (yy < 146) & (xx < rx)] = 1
civ[land & (yy >= 66) & (yy < 146) & (xx >= rx)] = 2
civ[land & (yy >= 146)] = 3

# distance to sea / to land (chebyshev, via dilation)
def dist_from(mask, maxd):
    dist = np.full((H, W), maxd + 1); cur = mask.copy(); dist[cur] = 0
    for i in range(1, maxd + 1):
        nxt = cur.copy()
        nxt[1:, :] |= cur[:-1, :]; nxt[:-1, :] |= cur[1:, :]; nxt[:, 1:] |= cur[:, :-1]; nxt[:, :-1] |= cur[:, 1:]
        dist[nxt & ~cur] = i; cur = nxt
    return dist
d_land = dist_from(land, 14)
d_sea = dist_from(~land, 4)

# ---------- base paint ----------
img = np.zeros((H, W, 3), np.uint8)
rnd = rng.random((H, W))
img[:] = P["deep"]
img[d_land <= 9] = P["sea"]
img[d_land <= 2] = P["shallow"]
waves = (~land) & (rnd < 0.012)
for y, x in zip(*np.nonzero(waves)):
    img[y, x:x + 2] = P["wave"]

def put(mask, col): img[mask] = P[col]
# Highland: rock & snow up top, pasture below
hl = civ == 0
put(hl, "pasture")
put(hl & (rnd < 0.18), "grass")
put(hl & (yy < 44 + (n_a - 0.5) * 16), "rock")
put(hl & (yy < 44 + (n_a - 0.5) * 16) & (rnd < 0.25), "rock_d")
put(hl & (yy < 24 + (n_b - 0.5) * 14), "snow")
put(hl & (yy < 24 + (n_b - 0.5) * 14) & (rnd < 0.2), "snow_d")
# Verdant: forest, clearings, marsh
vd = civ == 1
put(vd, "forest_d")
put(vd & (rnd < 0.3), "tree_d")
clear_v = vd & (n_c > 0.64)
put(clear_v, "grass"); put(clear_v & (rnd < 0.2), "grass_l")
marsh_v = vd & (n_b > 0.74)
put(marsh_v, "marsh"); put(marsh_v & (rnd < 0.05), "shallow")
# Forge: plains
fg = civ == 2
put(fg, "grass"); put(fg & (rnd < 0.2), "grass_l"); put(fg & (n_a > 0.68), "grass_d")
# Tidehaven: grass + marsh
td = civ == 3
put(td, "grass_l"); put(td & (rnd < 0.2), "grass")
marsh_t = td & (n_c > 0.66)
put(marsh_t, "marsh"); put(marsh_t & (rnd < 0.05), "shallow")
# beaches
beach = land & (d_sea <= 2) & ~(hl & (yy < 40))
put(beach, "sand"); put(beach & (rnd < 0.2), "sand_d")
put(land & (d_sea <= 1) & hl & (yy < 40), "rock_d")
# water on land
put(water_land, "river")
put(water_land & (rnd < 0.08), "foam")
put(lake & land & (((xx - lake_c[0]) / 9.0) ** 2 + ((yy - lake_c[1]) / 4.0) ** 2 < 1), "shallow")

occupied = water.copy() | ~land       # sprite placement blocker

DYN = []   # sprites the game draws itself (animated or state-dependent), not baked into the base layer

def blit(rows, pal, x0, y0, mark=True, dyn=None):
    if dyn:
        DYN.append(dict(kind=dyn, x=x0, y=y0, rows=rows, pal={k: "#%02x%02x%02x" % tuple(P[v]) for k, v in pal.items()}))
        if mark:
            for j, row in enumerate(rows):
                for i, ch in enumerate(row):
                    if ch not in ". " and 0 <= x0 + i < W and 0 <= y0 + j < H: occupied[y0 + j, x0 + i] = True
        return
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == "." or ch == " ": continue
            x, y = x0 + i, y0 + j
            if 0 <= x < W and 0 <= y < H:
                img[y, x] = P[pal[ch]]
                if mark: occupied[y, x] = True

def free(x0, y0, w, h, region=None):
    if x0 < 0 or y0 < 0 or x0 + w > W or y0 + h > H: return False
    if occupied[y0:y0 + h, x0:x0 + w].any(): return False
    if region is not None and not (civ[y0:y0 + h, x0:x0 + w] == region).all(): return False
    return True

# ---------- provinces (areas) with castles ----------
PROV = [
    ("frostpeak", "Frostpeak", 0, True, (112, 52)), ("glacier-gate", "Glacier Gate", 0, False, (236, 36)),
    ("damwatch", "Damwatch", 0, False, (186, 60)), ("ironvein", "Ironvein", 0, False, (52, 50)),
    ("mossholm", "Mossholm", 1, True, (84, 112)), ("elderwood", "Elderwood", 1, False, (40, 92)),
    ("fenmarsh", "Fenmarsh", 1, False, (118, 138)), ("millbrook", "Millbrook", 1, False, (122, 80)),
    ("brasshold", "Brasshold", 2, True, (236, 104)), ("cinderfield", "Cinderfield", 2, False, (198, 80)),
    ("sootvale", "Sootvale", 2, False, (270, 124)), ("windridge", "Windridge", 2, False, (206, 136)),
    ("harborkeep", "Harborkeep", 3, True, (210, 168)), ("saltmarsh", "Saltmarsh", 3, False, (96, 162)),
    ("lighthouse-point", "Lighthouse Pt", 3, False, (256, 156)), ("coral-isles", "Coral Isles", 3, False, (284, 179)),
]

def castle_rows(big):
    """Build castle sprite rows: towers + keep with crenels, 1px ink outline, civ flag."""
    if big:
        gw, gh, oy = 19, 18, 3
        rects = [(1, 6, 4, 14), (14, 6, 17, 14), (1, 10, 17, 14), (6, 3, 12, 14)]
        cren = [(1, 5), (3, 5), (14, 5), (16, 5), (6, 2), (8, 2), (10, 2), (12, 2)]
        pole_x, flag = 9, [(10, 0), (11, 0), (12, 0), (10, 1), (11, 1), (12, 1), (10, 2), (11, 2)]
        door = [(9, 13), (9, 14), (8, 14), (10, 14), (8, 13), (10, 13)]
        wins = [(2, 8), (15, 8), (8, 6), (10, 6), (8, 9), (10, 9)]
    else:
        gw, gh, oy = 13, 13, 2
        rects = [(1, 4, 3, 9), (9, 4, 11, 9), (1, 7, 11, 9), (4, 2, 8, 9)]
        cren = [(1, 3), (3, 3), (9, 3), (11, 3), (4, 1), (6, 1), (8, 1)]
        pole_x, flag = 6, [(7, 0), (8, 0), (7, 1), (8, 1)]
        door = [(6, 8), (6, 9)]
        wins = [(2, 6), (10, 6), (5, 4), (7, 4)]
    mask = np.zeros((gh + oy, gw), bool)
    for (x0, y0, x1, y1) in rects: mask[y0 + oy:y1 + oy + 1, x0:x1 + 1] = True
    for (x, y) in cren: mask[y + oy, x] = True
    grid = [["." for _ in range(gw)] for _ in range(gh + oy)]
    mid = gw // 2
    for y in range(gh + oy):
        for x in range(gw):
            if mask[y, x]:
                grid[y][x] = "L" if x < mid else ("M" if x > mid else "L")
            else:
                nb = any(0 <= y + dy < gh + oy and 0 <= x + dx < gw and mask[y + dy, x + dx]
                         for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                if nb: grid[y][x] = "O"
    base = max(y for y in range(gh + oy) if mask[y].any())
    for x in range(gw):
        if mask[base, x]: grid[base][x] = "D"
    for (x, y) in door: grid[y + oy][x] = "d"
    for (x, y) in wins: grid[y + oy][x] = "O"
    top = min(y for y in range(gh + oy) if mask[y].any())
    for y in range(0, top + 1):
        if grid[y][pole_x] in ".O": grid[y][pole_x] = "p"
    for (x, y) in flag: grid[y][x] = "F"
    return ["".join(r) for r in grid]

def nearest_spot(cx, cy, w, h, region):
    for r in range(0, 30):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r: continue
                x0, y0 = cx + dx - w // 2, cy + dy - h // 2
                if free(x0, y0, w, h, region): return x0, y0
    raise RuntimeError(f"no spot near {cx},{cy}")

castles = []
for (pid, name, c, cap, (cx, cy)) in PROV:
    rows = castle_rows(cap)
    w, h = len(rows[0]), len(rows)
    x0, y0 = nearest_spot(cx, cy, w + 2, h + 2, c)
    castles.append(dict(id=pid, name=name, civ=CIVS[c], capital=cap, rows=rows,
                        x0=x0 + 1, y0=y0 + 1, w=w, h=h, cx=x0 + 1 + w // 2, cy=y0 + 1 + h - 2))
    occupied[y0 - 3:y0 + h + 6, x0 - 3:x0 + w + 5] = True     # keep clear around castles + label

# province map: nearest castle of the same civ
prov = np.full((H, W), -1)
for c in range(4):
    idx = [i for i, k in enumerate(castles) if k["civ"] == CIVS[c]]
    pts = np.array([[castles[i]["cx"], castles[i]["cy"]] for i in idx])
    m = civ == c
    dd = (xx[m][:, None] - pts[None, :, 0]) ** 2 + (yy[m][:, None] - pts[None, :, 1]) ** 2
    prov[m] = np.array(idx)[dd.argmin(1)]

# ---------- landmarks & scenery ----------
MOUNT = {"L": "rock_l", "R": "rock", "D": "rock_d", "S": "snow", "s": "snow_d", "O": "ink"}
def mountain_rows(w):
    h = w // 2 + 2; rows = []
    for j in range(h):
        half = int(round((j + 0.5) * (w / 2) / h)); row = ""
        for i in range(w):
            off = i - w // 2
            if abs(off) > half: row += "."; continue
            edge = abs(off) == half or j == h - 1
            snowy = j < h * 0.42
            if edge: row += "O"
            elif off <= 0: row += "S" if snowy else ("L" if (i + j) % 5 else "R")
            else: row += "s" if snowy else ("D" if (i + j) % 4 == 0 else "R")
        rows.append(row)
    return rows

spots = []
for _ in range(900):
    w = int(rng.choice([9, 11, 13, 15, 17, 19]))
    x, y = int(rng.integers(6, W - 26)), int(rng.integers(6, 46))
    spots.append((y, x, w))
for (y, x, w) in sorted(spots):
    rows = mountain_rows(w); h = len(rows)
    if y + h > 58: continue
    if free(x, y, w, h, 0) and not occupied[max(0, y - 1):y + h, x:x + w].any():
        blit(rows, MOUNT, x, y)

TREE = (["..g..", ".ggg.", "gggGG", ".gGG.", "..t.."], {"g": "tree", "G": "forest", "t": "trunk"})
TREE_L = ([".g.", "ggG", ".t."], {"g": "grass_l", "G": "forest", "t": "trunk"})
def scatter(rows_pal, region, n, cond=None):
    rows, pal = rows_pal; w, h = len(rows[0]), len(rows)
    for _ in range(n):
        x, y = int(rng.integers(0, W - w)), int(rng.integers(0, H - h))
        if cond is not None and not cond[y + h // 2, x + w // 2]: continue
        if free(x, y, w, h, region): blit(rows, pal, x, y, mark=False); occupied[y + 2:y + h - 1, x + 1:x + w - 1] = True
scatter(TREE, 1, 9000, cond=~clear_v & ~marsh_v)
scatter(TREE_L, 1, 300, cond=clear_v)
scatter(TREE_L, 0, 250, cond=(yy > 44))
scatter(TREE_L, 2, 220)
scatter(TREE_L, 3, 120, cond=~marsh_t)

def place(rows, pal, region, near, tries=400, dyn=None):
    w, h = len(rows[0]), len(rows)
    for r in range(tries):
        x = int(near[0] + rng.integers(-r // 4 - 2, r // 4 + 3)); y = int(near[1] + rng.integers(-r // 6 - 2, r // 6 + 3))
        if free(x, y, w, h, region): blit(rows, pal, x, y, dyn=dyn); return (x, y)
    return None

# dam across the lake outlet
dxc = int(round(river_x(DAM_Y)))
blit(["OOOOOOOOOOO", "OLLLLLLLLLO", "OMfMfMfMfMO", "OOOOOOOOOOO"],
     {"O": "ink", "L": "stone_l", "M": "stone_m", "f": "foam"}, dxc - 5, DAM_Y - 2, dyn="dam")
# mines (Highland)
MINE = ["OOOO", "OddO", "OddO", "pOOp"]
for near in [(40, 46), (74, 42), (262, 44)]:
    place(MINE, {"O": "rock_d", "d": "ink", "p": "plank"}, 0, near)
# sheep
for _ in range(40):
    x, y = int(rng.integers(20, 300)), int(rng.integers(46, 64))
    if free(x, y, 2, 1, 0): blit(["wO"], {"w": "white", "O": "ink"}, x, y, mark=False)
# farm plots (Verdant west fields + Forge fields + Tidehaven)
def field(region, near, w, h, kind):
    rows = []
    for j in range(h):
        if kind == "wheat": rows.append(("W" if j % 2 == 0 else "w") * w)
        elif kind == "soil": rows.append(("S" if j % 2 == 0 else "s") * w)
        else: rows.append(("C" if j % 2 == 0 else "g") * w)
    rows = ["O" * (w + 2)] + ["O" + r + "O" for r in rows] + ["O" * (w + 2)]
    return place(rows, {"O": "soil_d", "W": "wheat", "w": "wheat_d", "S": "soil", "s": "soil_d",
                        "C": "crop", "g": "grass_d"}, region, near, tries=200)
for near in [(60, 128), (72, 136), (100, 96)]:
    field(1, near, int(rng.integers(6, 10)), int(rng.integers(4, 6)), str(rng.choice(["wheat", "soil", "crop"])))
for _ in range(16):
    field(2, (int(rng.integers(180, 290)), int(rng.integers(72, 142))), int(rng.integers(6, 12)),
          int(rng.integers(4, 7)), str(rng.choice(["wheat", "wheat", "soil", "crop"])))
for near in [(150, 156), (240, 170)]:
    field(3, near, 7, 4, "crop")
# windmill (Verdant)
place(["x.x", ".x.", "x.x", ".B.", ".B.", "BBB"], {"x": "white", "B": "plank"}, 1, (100, 92))
# factories + smoke (Forge)
FACT = ["..s.s", "...c.", "s..c.", ".c.c.", "MMMMM", "MddMM", "MMMMM"]
fpal = {"s": "smoke", "c": "metal_d", "M": "metal", "d": "ink"}
for near in [(222, 84), (252, 92), (230, 122)]:
    place(FACT, fpal, 2, near, dyn="factory")
# sludge pond
place([".ssss.", "sSSSSs", "sSSSSs", ".ssss."], {"s": "sludge_d", "S": "sludge"}, 2, (244, 112))
# wind farm + solar (Forge)
TURB = ["x.x", ".x.", "x|x", ".|.", ".|.", ".|."]
for near in [(274, 96), (282, 100), (276, 106)]:
    place(TURB, {"x": "white", "|": "white"}, 2, near, dyn="turbine")
place(["NnNnNnNn", "nNnNnNnN", "NnNnNnNn"], {"N": "navy", "n": "navy_l"}, 2, (262, 138))

# Tidehaven: lighthouse + docks + boats
def coast_point(xc, ycmin):
    for y in range(H - 1, ycmin, -1):
        if land[y, xc]: return y
    return None
lx = 246; ly = coast_point(lx, 150)
if ly:
    blit([".y.", "RRR", "WWW", "RRR", "WWW", "OOO"], {"y": "gold", "R": "red", "W": "white", "O": "ink"},
         lx - 1, ly - 6, dyn="lighthouse")
hx_ = 196; hy = coast_point(hx_, 150)
if hy:
    for i in range(3):
        for j in range(5):
            img[hy + 1 + j, hx_ - 4 + i * 4] = P["plank"]
    img[hy + 1, hx_ - 4:hx_ + 5] = P["plank"]
for (bx, by) in [(186, 192), (224, 190), (120, 193), (300, 150)]:
    if not land[by, bx]:
        blit([".w.", "ww.", "PPP"], {"w": "white", "P": "plank"}, bx, by - 2, mark=False, dyn="boat")

# ---------- terrain kind layer (what each tile is, so the game can flood/burn/melt it) ----------
KINDS = ["deep", "sea", "shallow", "water", "marsh", "forest", "grass", "pasture", "rock", "snow", "beach",
         "field", "structure", "sludge"]
COLOR_KIND = {}
for name, kname in [("forest", "forest"), ("forest_d", "forest"), ("tree", "forest"), ("tree_d", "forest"),
                    ("trunk", "forest"), ("grass", "grass"), ("grass_l", "grass"), ("grass_d", "grass"),
                    ("meadow", "grass"), ("crop", "field"), ("pasture", "pasture"), ("rock", "rock"),
                    ("rock_l", "rock"), ("rock_d", "rock"), ("snow", "snow"), ("snow_d", "snow"), ("sand", "beach"),
                    ("sand_d", "beach"), ("marsh", "marsh"), ("shallow", "marsh"), ("wheat", "field"),
                    ("wheat_d", "field"), ("soil", "field"), ("soil_d", "field"), ("sludge", "sludge"),
                    ("sludge_d", "sludge")]:
    COLOR_KIND[tuple(int(v) for v in P[name])] = KINDS.index(kname)
kind = np.full((H, W), KINDS.index("structure"), np.uint8)
for y in range(H):
    for x in range(W):
        if not land[y, x]:
            kind[y, x] = KINDS.index("shallow" if d_land[y, x] <= 2 else "sea" if d_land[y, x] <= 9 else "deep")
        elif water[y, x]:
            kind[y, x] = KINDS.index("water")
        else:
            kind[y, x] = COLOR_KIND.get(tuple(int(v) for v in img[y, x]), KINDS.index("structure"))
# sheep sit on pasture
kind[(kind == KINDS.index("structure")) & (civ == 0) & (yy > 44)] = KINDS.index("pasture")

# ---------- borders ----------
OUT_COLOR = {0: "highland", 1: "verdant", 2: "forge", 3: "tidehaven"}
for y in range(H):
    for x in range(W):
        if not land[y, x] or water[y, x]: continue
        c = civ[y, x]
        # region boundary (horizontal lines): Highland south edge, Tidehaven north edge
        if (c == 0 and y == 65) or (c in (1, 2) and y == 145):
            img[y, x] = P[OUT_COLOR[c]] if (x // 3) % 2 == 0 else P["ink"]
            continue
        # province boundary inside a civ: dotted ink
        for (dx, dy) in ((1, 0), (0, 1)):
            x2, y2 = x + dx, y + dy
            if x2 < W and y2 < H and civ[y2, x2] == c and prov[y2, x2] != prov[y, x] and not water[y2, x2]:
                if (x + y) % 2 == 0:
                    img[y, x] = (img[y, x].astype(int) * 0.45).astype(np.uint8)

base = img.copy()   # everything static; the game draws DYN sprites + castles on top

# ---------- dynamic sprites (baked into the preview PNGs only) ----------
for d_ in DYN:
    for j, row in enumerate(d_["rows"]):
        for i, ch in enumerate(row):
            if ch in ". ": continue
            x, y = d_["x"] + i, d_["y"] + j
            if 0 <= x < W and 0 <= y < H: img[y, x] = hx(d_["pal"][ch])

# ---------- castles ----------
for k in castles:
    blit(k["rows"], {"O": "ink", "L": "stone_l", "M": "stone_m", "D": "stone_d", "d": "door",
                     "p": "ink", "F": k["civ"]}, k["x0"], k["y0"])

# ---------- export ----------
Image.fromarray(img).save(f"{OUT}/world-map-1x.png")
big = Image.fromarray(img).resize((W * S, H * S), Image.NEAREST)
big.save(f"{OUT}/world-map.png")

lab = big.copy()
dr = ImageDraw.Draw(lab); dr.fontmode = "1"
f8 = ImageFont.truetype(f"{FONT_DIR}/PressStart2P.ttf", 8)
f16 = ImageFont.truetype(f"{FONT_DIR}/PressStart2P.ttf", 16)
f24 = ImageFont.truetype(f"{FONT_DIR}/PressStart2P.ttf", 24)
def C(n): return tuple(int(v) for v in P[n])
def banner(cx, top, text, font, fill="#efe2bc", stripe=None, ink="#2a1a0e", pad=4):
    tw = dr.textlength(text, font=font); th = font.size
    w = int(tw) + pad * 2 + (6 if stripe else 0); h = th + pad * 2
    x0 = int(cx - w / 2); y0 = int(top)
    dr.rectangle([x0 + 3, y0 + 3, x0 + w + 3, y0 + h + 3], fill="#000000")
    dr.rectangle([x0, y0, x0 + w, y0 + h], fill=fill, outline=C("ink"), width=2)
    tx = x0 + pad + 1
    if stripe:
        dr.rectangle([x0 + 2, y0 + 2, x0 + 5, y0 + h - 2], fill=C(stripe)); tx += 6
    dr.text((tx, y0 + pad + 1), text, font=font, fill=ink)
for k in castles:
    banner(k["cx"] * S, (k["y0"] + k["h"]) * S + 2, k["name"].upper(), f8,
           fill="#f5c542" if k["capital"] else "#efe2bc", stripe=k["civ"])
REG = [("HIGHLAND HOLD", "highland", (150, 4)), ("VERDANT REACH", "verdant", (58, 68)),
       ("FORGE DOMINION", "forge", (262, 68)), ("TIDEHAVEN", "tidehaven", (60, 148))]
for (t, c, (x, y)) in REG:
    banner(x * S, y * S, t, f16, fill=C(c), ink="#1a120a", pad=6)
lab.save(f"{OUT}/world-map-labeled.png")

json.dump({"tileSize": S, "tiles": [W, H], "cellTiles": 8, "provinces": [
    {"id": k["id"], "name": k["name"], "civ": k["civ"], "capital": k["capital"],
     "castleTile": [k["cx"], k["cy"]], "castleCell": [k["cx"] // 8, k["cy"] // 8]} for k in castles]},
    open(f"{OUT}/provinces.json", "w"), indent=2)
# ---------- live-render layers ----------
import base64
def rle(a):
    flat = a.flatten().tolist(); out = []; cur = flat[0]; n = 0
    for v in flat:
        if v == cur: n += 1
        else: out += [cur, n]; cur = v; n = 1
    return out + [cur, n]
# areas for sea tiles: nearest area within 10 tiles (used for spills and coastal surges)
near = prov.copy()
frontier = [(y, x) for y in range(H) for x in range(W) if prov[y, x] >= 0]
for _ in range(10):
    nxt = []
    for (y, x) in frontier:
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            y2, x2 = y + dy, x + dx
            if 0 <= y2 < H and 0 <= x2 < W and near[y2, x2] < 0 and not land[y2, x2]:
                near[y2, x2] = near[y, x]; nxt.append((y2, x2))
    frontier = nxt
pal_list = sorted({tuple(int(v) for v in c) for c in base.reshape(-1, 3)})
pal_index = {c: i for i, c in enumerate(pal_list)}
base_idx = np.array([[pal_index[tuple(int(v) for v in base[y, x])] for x in range(W)] for y in range(H)], np.uint8)
CASTLE_PAL = {"O": "ink", "L": "stone_l", "M": "stone_m", "D": "stone_d", "d": "door", "p": "ink"}
layers = {
    "w": W, "h": H,
    "kinds": KINDS,
    "palette": ["#%02x%02x%02x" % c for c in pal_list],
    "base": base64.b64encode(base_idx.tobytes()).decode(),
    "kind": rle(kind),
    "area": rle(np.where(prov >= 0, prov, 255)),
    "near": rle(np.where(near >= 0, near, 255)),
    "sprites": [{k: v for k, v in d_.items()} for d_ in DYN],
    "castles": [{"id": k["id"], "x": k["x0"], "y": k["y0"], "rows": k["rows"],
                 "pal": {c: "#%02x%02x%02x" % tuple(P[n]) for c, n in CASTLE_PAL.items()}} for k in castles],
}
json.dump(layers, open(f"{OUT}/worldmap.json", "w"), separators=(",", ":"))
print("ok", [(k["name"], k["cx"], k["cy"]) for k in castles])
