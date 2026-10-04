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
    # northern range (lit from the top-left)
    mt_light="#9a907e", mt_shadow="#5a5348", mt_ridge="#b8ad97", mt_line="#3e3830", mt_floor="#776e60",
    mt_snow="#f4f4ec", mt_snow_d="#c6d4e0", foothill="#8c7d4b", foothill_d="#6f6239", ice="#bfe4f2",
    pine="#3d7a2e", pine_d="#24501b",
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
ice = np.zeros((H, W), bool)
for (sx, sy) in [(118, 14), (206, 16)]:                      # glacier ice channels into the reservoir
    for t in np.linspace(0, 1, 220):
        x = sx + (lake_c[0] - sx) * t + 3 * math.sin(t * 9)
        y = sy + (lake_c[1] - sy) * t
        paint_line([(x, y)], 2)
        for xi in range(int(math.floor(x - 0.5)), int(math.floor(x + 1.5))):
            yi = int(round(y))
            if 0 <= xi < W and 0 <= yi < H: ice[yi, xi] = True
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
# Biome boundaries flow organically. Every seam feathers with the SAME system: ordered (Bayer)
# dithering over a fixed band, keyed to distance from the seam, so transitions are coherent
# gradients rather than per-pixel noise. Each tile is painted a single palette colour (no blends),
# and ownership (`civ`) keeps its clean borders -- only the look of the land bleeds, not who owns it.
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16.0
bayer = BAYER[yy % 4, xx % 4]
BAND = 3.0   # tiles over which one biome dithers into the next
def across(coord, edge, band=BAND):
    """0 on the near side of `edge`, 1 on the far side, ramping across `band` tiles."""
    return np.clip((coord - edge) / band + 0.5, 0.0, 1.0)
north = 66 + (n_a - 0.5) * 26 + (n_b - 0.5) * 10 + 4 * np.sin(xx / 13.0)
south = 146 + (n_c - 0.5) * 28 + (n_a - 0.5) * 10 + 4 * np.sin(xx / 11.0 + 2)
river_seam = rx + (n_b - 0.5) * 16 + 3 * np.sin(yy / 9.0)
hl = land & (across(yy, north) <= bayer)
td = land & (across(yy, south) > bayer)
mid = land & ~hl & ~td
vd = mid & (across(xx, river_seam) <= bayer)
fg = mid & (across(xx, river_seam) > bayer)
# Highland: rock & snow up top, pasture below
put(hl, "pasture")
put(hl & (rnd < 0.18), "grass")
# Verdant: forest, clearings, marsh
put(vd, "forest_d")
put(vd & (rnd < 0.3), "tree_d")
clear_v = vd & (n_c > 0.64)
put(clear_v, "grass"); put(clear_v & (rnd < 0.2), "grass_l")
marsh_v = vd & (n_b > 0.74)
put(marsh_v, "marsh"); put(marsh_v & (rnd < 0.05), "shallow")
# Forge: plains
put(fg, "grass"); put(fg & (rnd < 0.2), "grass_l"); put(fg & (n_a > 0.68), "grass_d")
# Riparian treeline: Verdant's forest feathers east onto the Forge bank, fading with the same dither.
fringe = fg & (np.clip((river_seam + 7 - xx) / 7.0, 0, 1) > bayer)
put(fringe, "forest_d"); put(fringe & (rnd < 0.15), "tree_d")
# Tidehaven: grass + marsh, with a desert shore
put(td, "grass_l"); put(td & (rnd < 0.2), "grass")
marsh_t = td & (n_c > 0.66)
put(marsh_t, "marsh"); put(marsh_t & (rnd < 0.05), "shallow")
# Harborkeep's southern shore is desert: a sand band between the beach and the grass, dithered inland.
desert_edge = 170 + (n_c - 0.5) * 14 + 4 * np.sin(xx / 12.0)
sand_t = td & (across(yy, desert_edge, 5.0) > bayer)
put(sand_t, "sand"); put(sand_t & (rnd < 0.3), "sand_d")
# beaches
beach = land & (d_sea <= 2) & ~(hl & (yy < 40))
put(beach, "sand"); put(beach & (rnd < 0.2), "sand_d")
# water on land
put(water_land, "river")
put(water_land & (rnd < 0.08), "foam")
put(lake & land & (((xx - lake_c[0]) / 9.0) ** 2 + ((yy - lake_c[1]) / 4.0) ** 2 < 1), "shallow")
put(ice & land & ~lake, "ice")

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
# One town per civilization: a keep the town grows around (AGENTS.md §5.1a).
PROV = [
    ("frostpeak", "Frostpeak", 0, True, (120, 44)),
    ("mossholm", "Mossholm", 1, True, (80, 108)),
    ("brasshold", "Brasshold", 2, True, (232, 104)),
    ("harborkeep", "Harborkeep", 3, True, (200, 166)),
]
TOWN_R = (17, 11)   # clearing around each keep (x, y radius)

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
    # a grass clearing for the town to grow into: no trees or mountains, meadow underfoot
    kcx, kcy = x0 + 1 + w // 2, y0 + 1 + h // 2
    clearing = (((xx - kcx) / TOWN_R[0]) ** 2 + ((yy - kcy) / TOWN_R[1]) ** 2 < 1) & (civ == c) & ~water
    img[clearing] = P["grass"]
    img[clearing & (rnd < 0.25)] = P["grass_l"]
    img[clearing & (rnd > 0.93)] = P["meadow"]
    occupied |= clearing

# one area per civilization, owned by its town
prov = np.where(civ >= 0, civ, -1)

# ---------- landmarks & scenery ----------
# ---------- the northern range ----------
# One connected range lit from the top-left: back row of large peaks, then medium, then small, each row
# overlapping the one behind by ~40%, drawn back to front. A rock floor fills the gaps, foothills run
# along the front and dither into the grass, and a light-blue ice channel stays clear down to the reservoir.
mrng = np.random.default_rng(2027)
SIZES = {"large": 32, "medium": 20, "small": 12}

def peak_sprite(hgt, seed):
    """Return (mask, colour-name grid, spine column) for one peak ~1.6x as wide as tall."""
    r = np.random.default_rng(seed)
    wid = int(round(hgt * 1.6)) | 1
    apex = wid // 2 + int(r.integers(-1, 2))
    mask = np.zeros((hgt, wid), bool)
    left_n = right_n = 0
    for j in range(hgt):
        t = (j + 1) / hgt
        if j % 3 == 0:                                   # uneven ridgelines: 1-2px notches
            left_n = int(r.choice([0, 0, 1, 2])); right_n = int(r.choice([0, 0, 1, 2]))
        lo = int(round(apex - t * apex)) + (left_n if 1 < j < hgt - 2 else 0)
        hi = int(round(apex + t * (wid - 1 - apex))) - (right_n if 1 < j < hgt - 2 else 0)
        mask[j, max(0, lo):min(wid, hi + 1)] = True
    snowy = hgt >= 20
    snow_line = [int(hgt * 0.3) + int(r.integers(0, 3)) for _ in range(wid)]   # jagged 2-3px edge
    grid = np.full((hgt, wid), "", object)
    for j in range(hgt):
        for i in range(wid):
            if not mask[j, i]: continue
            lit = i < apex
            if i == apex and j < hgt * 0.85: c = "mt_ridge"          # highlight down the spine
            else: c = "mt_light" if lit else "mt_shadow"
            if snowy and j < snow_line[i]: c = "mt_snow" if lit or i == apex else "mt_snow_d"
            grid[j, i] = c
    # 2-3 small cracks on the shadow side
    shade = [(j, i) for j in range(int(hgt * 0.4), hgt - 1) for i in range(apex + 2, wid) if mask[j, i]
             and mask[j, i - 1] and i + 1 < wid and mask[j, i + 1]]
    for k in r.choice(len(shade), size=min(len(shade), int(r.integers(2, 4))), replace=False):
        j, i = shade[k]
        grid[j, i] = "mt_line"
        if j + 1 < hgt and mask[j + 1, i]: grid[j + 1, i] = "mt_line"
    return mask, grid

# where the range may go: highland land that isn't the town, water, ice or the dam
protect = occupied.copy()
protect |= dist_from(ice | lake | water, 2) <= 2
dam_x = int(round(river_x(DAM_Y)))
protect[DAM_Y - 6:DAM_Y + 4, dam_x - 9:dam_x + 10] = True
highland_land = land & (civ == 0)
land_top = np.array([np.argmax(land[:, x]) if land[:, x].any() else H for x in range(W)], float)
land_top = np.convolve(np.pad(land_top, 7, mode="edge"), np.ones(15) / 15, mode="valid")
row_back = land_top + 33                    # base line of the back (large) row
BASE = {"large": row_back, "medium": row_back + 7, "small": row_back + 11}   # ~40% overlap per row
front = np.minimum(row_back + 11, 56).astype(int)

# rock floor across the whole range so there are no empty patches between peaks
floor = highland_land & (yy <= front[None, :] + 1) & ~protect
put(floor, "mt_floor")
put(floor & (rnd < 0.11), "mt_shadow")              # pebbles
put(floor & (np.roll(rnd, 1, axis=1) < 0.04), "mt_shadow")   # a few 2px pebbles

# foothills: a 6-10px band below the front row, dithered 2px into the grass
fh_len = (6 + 4 * vnoise(10)).astype(int)
foot = np.zeros((H, W), bool)
for x in range(W):
    for y in range(front[x] + 2, min(H, front[x] + 2 + fh_len[0, x])):
        foot[y, x] = True
foot &= highland_land & ~protect
edge = foot & ~np.roll(foot, -2, axis=0)            # bottom 2 rows of the band
foot_fill = foot & ~(edge & (((xx + yy) & 1) == 1))   # checker blend into grass
put(foot_fill, "foothill")
put(foot_fill & ((xx // 5 + yy // 3) % 3 == 0) & (xx % 5 >= 3), "foothill_d")   # bump shading
occupied |= floor | foot

# peaks: back to front, seeded spacing, +-3px jitter, never two same-size peaks in a perfect line
union = np.zeros((H, W), bool)
placed_peaks = 0

def fits(mask, x, top, avoid_union=False):
    hgt, wid = mask.shape
    if top < 2 or top + hgt > H or x < 0 or x + wid > W: return False
    box = (slice(top, top + hgt), slice(x, x + wid))
    if not (highland_land[box] | ~mask).all(): return False
    if (protect[box] & mask).any(): return False
    if avoid_union and (union[box] & mask).any(): return False
    return True

def stamp(mask, grid, x, top):
    global placed_peaks
    hgt, wid = mask.shape
    for j2 in range(hgt):
        for i2 in range(wid):
            if mask[j2, i2]:
                img[top + j2, x + i2] = P[grid[j2, i2]]
                union[top + j2, x + i2] = True
    placed_peaks += 1

for row in ("large", "medium", "small"):
    hgt = SIZES[row]
    wid = int(round(hgt * 1.6)) | 1
    x = int(mrng.integers(0, wid // 2))
    last_y = None
    while x < W - 4:
        mask, grid = peak_sprite(hgt, int(mrng.integers(0, 1 << 30)))
        want = int(BASE[row][min(W - 1, x + wid // 2)] + mrng.integers(-3, 4))
        done = False
        for dy in (0, -2, 2, -4, 4, -6, 6, -8, 8):
            base_y = want + dy
            if last_y is not None and base_y == last_y: continue      # no perfect lines
            if fits(mask, x, base_y - hgt + 1):
                stamp(mask, grid, x, base_y - hgt + 1)
                last_y, done = base_y, True
                break
        x += int(wid * mrng.uniform(0.55, 0.9)) if done else int(mrng.integers(3, 7))

# fill pass: cover the remaining open rock with peaks that sit on bare floor (no overlap, so order holds)
for row in ("medium", "small", "small"):
    hgt = SIZES[row]
    cands = [(int(x), int(y)) for y in range(0, H, 3) for x in range(0, W, 3)]
    mrng.shuffle(cands)
    for (x, y) in cands:
        if not floor[min(H - 1, y), min(W - 1, x)] or union[min(H - 1, y), min(W - 1, x)]: continue
        mask, grid = peak_sprite(hgt, int(mrng.integers(0, 1 << 30)))
        top = y - hgt + 1
        if fits(mask, x - mask.shape[1] // 2, top, avoid_union=True):
            stamp(mask, grid, x - mask.shape[1] // 2, top)
# 1px dark-rock outline on the outer silhouette only (sides and top, not along the base)
outline = ~union & (np.roll(union, 1, axis=1) | np.roll(union, -1, axis=1) | np.roll(union, -1, axis=0)) & land
img[outline] = P["mt_line"]
occupied |= union | outline

# life: pines on the foothills, and 1-2 mine entrances with plank frames on the lower slopes
PINE = (["..g..", ".gGg.", ".ggG.", "ggGGG", ".ggG.", "gggGG", "..t.."], {"g": "pine", "G": "pine_d", "t": "trunk"})
pines = 0
for _ in range(400):
    x, y = int(mrng.integers(4, W - 9)), int(mrng.integers(30, 60))
    near_foot = foot[min(H - 1, y + 6), x + 2] or (front[x + 2] + 2 <= y + 6 <= front[x + 2] + 16 and highland_land[min(H - 1, y + 6), x + 2])
    if near_foot and not union[y:y + 7, x:x + 5].any() and not protect[y:y + 7, x:x + 5].any():
        blit(PINE[0], PINE[1], x, y); pines += 1
    if pines >= 9: break
MINE_FRAME = [".PPP.", "PdddP", "PdddP", "PdddP"]
mines = 0
for _ in range(800):
    x, y = int(mrng.integers(10, W - 10)), int(mrng.integers(30, 60))
    spot = (slice(y, y + 4), slice(x, x + 5))
    if union[spot].all() and (yy[spot] >= front[x] - 6).all() and not protect[spot].any():
        blit(MINE_FRAME, {"P": "plank", "d": "ink"}, x, y); mines += 1
        x_used = x
    if mines >= 2: break
print("range:", placed_peaks, "peaks,", pines, "pines,", mines, "mines")

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
# (Kilns, mines, windmills and the rest are built by players and drawn by the game around each town.)

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
                    ("sludge_d", "sludge"), ("mt_light", "rock"), ("mt_shadow", "rock"), ("mt_ridge", "rock"),
                    ("mt_line", "rock"), ("mt_floor", "rock"), ("foothill", "rock"), ("foothill_d", "rock"),
                    ("mt_snow", "snow"), ("mt_snow_d", "snow"), ("pine", "forest"), ("pine_d", "forest")]:
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
# Territory is now shown by a per-civ wash in the live renderer (worldRender.ts), not baked lines.
DRAW_BORDERS = False
OUT_COLOR = {0: "highland", 1: "verdant", 2: "forge", 3: "tidehaven"}
for y in range(H) if DRAW_BORDERS else ():
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
    banner(k["cx"] * S, (k["y0"] + k["h"]) * S + 2, k["name"].upper(), f8, fill="#f5c542", stripe=k["civ"])
REG = [("HIGHLAND HOLD", "highland", (150, 4)), ("VERDANT REACH", "verdant", (58, 68)),
       ("FORGE DOMINION", "forge", (262, 68)), ("TIDEHAVEN", "tidehaven", (60, 148))]
for (t, c, (x, y)) in REG:
    banner(x * S, y * S, t, f16, fill=C(c), ink="#1a120a", pad=6)
lab.save(f"{OUT}/world-map-labeled.png")

json.dump({"tileSize": S, "tiles": [W, H], "towns": [
    {"id": k["id"], "name": k["name"], "civ": k["civ"], "keepTile": [k["cx"], k["cy"]]} for k in castles]},
    open(f"{OUT}/towns.json", "w"), indent=2)

# ---------- building plots: where each town grows, nearest the keep first ----------
SLOT_W, SLOT_H = 7, 7
def town_slots(k, ci, n=44):
    taken = np.zeros((H, W), bool)
    taken[k["y0"] - 1:k["y0"] + k["h"] + 1, k["x0"] - 1:k["x0"] + k["w"] + 1] = True
    taken[k["y0"] + k["h"]:k["y0"] + k["h"] + 8, k["cx"] - 16:k["cx"] + 16] = True   # nameplate
    kcx, kcy = k["x0"] + k["w"] / 2, k["y0"] + k["h"] / 2
    cands = []
    for y in range(max(0, int(kcy) - 34), min(H - SLOT_H, int(kcy) + 34)):
        for x in range(max(0, int(kcx) - 50), min(W - SLOT_W, int(kcx) + 50)):
            box = (slice(y, y + SLOT_H), slice(x, x + SLOT_W))
            if not (civ[box] == ci).all() or water[box].any(): continue
            if ((yy[box] == 65) | (yy[box] == 145)).any(): continue
            d = ((x + SLOT_W / 2 - kcx) / 1.4) ** 2 + (y + SLOT_H / 2 - kcy) ** 2
            cands.append((d, x, y))
    out = []
    for d, x, y in sorted(cands):
        box = (slice(y, y + SLOT_H), slice(x, x + SLOT_W))
        if taken[box].any(): continue
        taken[y - 1:y + SLOT_H + 1, x - 1:x + SLOT_W + 1] = True
        out.append([x, y])
        if len(out) >= n: break
    return out
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
                 "pal": {c: "#%02x%02x%02x" % tuple(P[n]) for c, n in CASTLE_PAL.items()},
                 "slots": town_slots(k, i)} for i, k in enumerate(castles)],
}
json.dump(layers, open(f"{OUT}/worldmap.json", "w"), separators=(",", ":"))
print("ok", [(k["name"], k["cx"], k["cy"]) for k in castles])
