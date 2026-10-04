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
    # river (section 1 polish)
    river_deep="#2a78ad", river_edge="#7cc9ee", bank="#5d7a3a", dam_l="#a0a0a0", dam_d="#5a5a58",
    spill="#e8f6fb", wet_sand="#c9b06a",
    # farms (section 3 polish)
    hedge="#2f5a26", wheat_r="#b39432", crop_l="#7cbf4a", crop_r="#5a9a34", soil_r="#6e4a28",
    roof="#b5432f", roof_d="#8a2f22", wall="#efe2bc",
    # section 4 polish: marsh, grass tufts, flowers
    marsh2="#4d7a5f", reed="#8aa050", pool="#3a8bbd", tuft_d="#4d8732", tuft_l="#74b04a",
    flower_w="#f6efdc", flower_y="#f5c542", flower_p="#e07a9a",
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
lake = (((xx - lake_c[0]) / 14.0) ** 2 + ((yy - lake_c[1]) / 7.5) ** 2 + (n_land - 0.5) * 0.2) < 1
water |= lake & land
DAM_Y = 54
def paint_line(pts, width):
    for (x, y) in pts:
        r = width / 2
        x0, x1 = int(math.floor(x - r + 0.5)), int(math.floor(x + r + 0.5))
        for xi in range(x0, x1):
            yi = int(round(y))
            if 0 <= xi < W and 0 <= yi < H: water[yi, xi] = True
def river_w(y):
    if y >= 168: return 3
    if y >= 140: return 6
    if y >= 92: return 4
    return 2
for y in np.arange(DAM_Y - 2, H, 0.5):                       # main river
    x = river_x(y)
    if y > 120 and not land[int(y), int(x)]:
        break
    paint_line([(x, y)], river_w(y))
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
d_sea = dist_from(~land, 6)

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

# ---------- farms: irregular clusters of 2-4 fields sharing hedges, plus a farmhouse ----------
FIELD_TONES = {"wheat": ("wheat", "wheat_r"), "crop": ("crop_l", "crop_r"), "soil": ("soil", "soil_r")}
def paint_field(x, y, w, h, kind, dirn):
    """Rows of two tones; `dirn` is h (rows), v (columns) or d (diagonal furrows)."""
    a, b = FIELD_TONES[kind]
    for j in range(h):
        for i in range(w):
            dark = (j % 2) if dirn == "h" else (i % 2) if dirn == "v" else ((i + j) % 3 == 0)
            img[y + j, x + i] = P[b if dark else a]

FARMHOUSE = [".OOO.", "ORRrO", "OWWWO", "OWdWO", "OOOOO"]
FARM_PAL = {"O": "ink", "R": "roof", "r": "roof_d", "W": "wall", "d": "door"}
HAY = [".OO.", "OHhO", ".OO."]
HAY_PAL = {"O": "ink", "H": "wheat", "h": "wheat_r"}

def farm_layout(frng):
    """2-4 fields as (dx, dy, w, h), packed side by side or stacked with 1px hedges, staggered."""
    n = int(frng.integers(2, 5))
    fields = [(0, 0, int(frng.integers(6, 10)), int(frng.integers(5, 8)))]
    for k in range(1, n):
        px, py, pw, ph = fields[k - 1] if k != 2 or n < 4 else fields[0]
        if k % 2 == 1:   # to the right, sharing the hedge column, slightly staggered
            fields.append((px + pw + 1, py + int(frng.integers(-2, 3)), int(frng.integers(5, 9)), int(frng.integers(5, 8))))
        else:            # below, sharing the hedge row
            fields.append((px + int(frng.integers(-2, 3)), py + ph + 1, int(frng.integers(6, 10)), int(frng.integers(4, 6))))
    return fields

def farm_fits(cells, region):
    for (x, y) in cells:
        if not (0 <= x < W and 0 <= y < H): return False
        if not land[y, x] or water[y, x] or occupied[y, x] or civ[y, x] != region: return False
        if d_sea[y, x] <= 5: return False
    return True

def farm_cluster(region, near, frng, extras=True):
    """Find a spot near `near`, paint the fields, hedges, farmhouse and hay; return the bounding box."""
    fields = farm_layout(frng)
    kinds = ["wheat", "crop", "soil"]
    for r in range(0, 30):
        for _ in range(8):
            ox = near[0] + int(frng.integers(-r - 1, r + 2))
            oy = near[1] + int(frng.integers(-r // 2 - 1, r // 2 + 2))
            rects = [(ox + dx, oy + dy, w, h) for (dx, dy, w, h) in fields]
            x0 = min(x for x, _, _, _ in rects) - 1; y0 = min(y for _, y, _, _ in rects) - 1
            x1 = max(x + w for x, _, w, _ in rects); y1 = max(y + h for _, y, _, h in rects)
            hx, hy = (x1 + 1, y0 + 1) if frng.random() < 0.5 else (x0 - 6, y0 + 1)   # farmhouse side
            cells = {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}
            cells |= {(hx + i, hy + j) for i in range(5) for j in range(5)}
            if not farm_fits(cells, region): continue
            hedge = set()
            for (x, y, w, h) in rects:
                hedge |= {(x + i, y + j) for i in range(-1, w + 1) for j in range(-1, h + 1)}
            for (x, y) in hedge: img[y, x] = P["hedge"]
            for (x, y, w, h) in rects:
                paint_field(x, y, w, h, kinds[int(frng.integers(0, 3))], "hvd"[int(frng.integers(0, 3))])
            blit(FARMHOUSE, FARM_PAL, hx, hy)
            if extras:
                for k in range(int(frng.integers(1, 3))):
                    bx, by = (hx + int(frng.integers(-1, 3)), hy + 6 + k * 3)
                    if farm_fits({(bx + i, by + j) for i in range(4) for j in range(3)}, region):
                        blit(HAY, HAY_PAL, bx, by)
            for (x, y) in cells: occupied[y, x] = True
            FARMS.append((x0 - 1, y0 - 1, x1 - x0 + 3, y1 - y0 + 3))
            return True
    return False
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
hl = land & (across(yy, north, band=14.0) <= bayer)   # wide, soft seam into the lowlands
td = land & (across(yy, south) > bayer)
mid = land & ~hl & ~td
vd = mid & (across(xx, river_seam) <= bayer)
fg = mid & (across(xx, river_seam) > bayer)
# Highland: rock & snow up top, pasture below
put(hl, "pasture")
# Pasture fades toward the lowland grass over the last ~16 tiles, so there is no visible line.
fade = np.clip((yy - (north - 18)) / 18.0, 0.0, 1.0)
put(hl & (rnd < 0.18 + 0.7 * fade), "grass")
# Verdant: forest, clearings, marsh
put(vd, "forest_d")
put(vd & (rnd < 0.3), "tree_d")
clear_v = vd & (n_c > 0.64)
put(clear_v, "grass"); put(clear_v & (rnd < 0.2), "grass_l")
marsh_v = vd & (n_b > 0.74)
put(marsh_v, "marsh2"); put(marsh_v & (rnd < 0.18), "reed")
pools_marsh_v = marsh_v & (rnd > 0.985)
pools_marsh_v = pools_marsh_v | np.roll(pools_marsh_v, 1, axis=1)        # 2px pools
put(pools_marsh_v & marsh_v, "pool")
forest_body = vd & ~clear_v & ~marsh_v
forest_rim = forest_body & (dist_from(~forest_body, 3) <= 2)
put(forest_rim, "grass"); put(forest_rim & (rnd < 0.2), "grass_l")
# Forge: plains
put(fg, "grass"); put(fg & (rnd < 0.2), "grass_l"); put(fg & (n_a > 0.68), "grass_d")
# Riparian treeline: Verdant's forest feathers east onto the Forge bank, fading with the same dither.
fringe = fg & (np.clip((river_seam + 7 - xx) / 7.0, 0, 1) > bayer)
put(fringe, "forest_d"); put(fringe & (rnd < 0.15), "tree_d")
# Tidehaven: grass + marsh, with a desert shore
put(td, "grass_l"); put(td & (rnd < 0.2), "grass")
marsh_t = td & (n_c > 0.66)
put(marsh_t, "marsh2"); put(marsh_t & (rnd < 0.18), "reed")
pools_marsh_t = marsh_t & (rnd > 0.985)
pools_marsh_t = pools_marsh_t | np.roll(pools_marsh_t, 1, axis=1)        # 2px pools
put(pools_marsh_t & marsh_t, "pool")
# Harborkeep's southern shore is desert: a sand band between the beach and the grass, dithered inland.
desert_edge = 170 + (n_c - 0.5) * 14 + 4 * np.sin(xx / 12.0)
sand_t = td & (across(yy, desert_edge, 5.0) > bayer)
put(sand_t, "sand"); put(sand_t & (rnd < 0.3), "sand_d")
# beaches
beach_w = 3 + np.floor(n_c * 2.99).astype(int)          # 3-5px of sand along the coast
beach = land & (d_sea <= beach_w) & ~(hl & (yy < 40))
put(beach, "sand"); put(beach & (rnd < 0.2), "sand_d")
put(beach & (d_sea == 1), "wet_sand")                     # darker wet line next to the foam
# water on land: body, deep centre, lit top-left edge, and a 1px darker bank outside
ice &= ~lake                       # glacier channels stop at the reservoir's edge
wl = water_land & ~ice
lk = wl & lake
d_in = dist_from(~wl, 4)
put(wl, "river")
put(wl & ~lk & (d_in >= 2), "river_deep")                       # river: centre channel
put(lk & (d_in >= 3), "river_deep")                              # lake: deep middle
lit = wl & (~np.roll(wl, 1, axis=1) | ~np.roll(wl, 1, axis=0))  # left or top neighbour is dry
put(wl & ~lk & lit, "river_edge")
put(lk & (d_in == 1), "river_edge")                              # lake: lighter rim all round
put(ice & land & ~lake, "ice")
near_wl = np.zeros_like(wl)
near_wl[1:, :] |= wl[:-1, :]; near_wl[:-1, :] |= wl[1:, :]; near_wl[:, 1:] |= wl[:, :-1]; near_wl[:, :-1] |= wl[:, 1:]
sandy = (img == P["sand"]).all(2) | (img == P["sand_d"]).all(2)
bank = land & ~water & ~ice & near_wl & ~sandy & (d_sea > 1)
put(bank, "bank")

grassy = np.zeros((H, W), bool)
for g in ("grass", "grass_l", "grass_d", "pasture", "meadow"):
    grassy |= (img == P[g]).all(2)
grassy &= land & ~water
put(grassy & (n_b > 0.58) & (rnd < 0.28), "tuft_d")
put(grassy & (n_a < 0.42) & (rnd > 0.72), "tuft_l")
flowers = grassy & (rnd > 0.9965)
put(flowers & ((xx + yy) % 3 == 0), "flower_w")
put(flowers & ((xx + yy) % 3 == 1), "flower_y")
put(flowers & ((xx + yy) % 3 == 2), "flower_p")

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
FARMS = []   # (x, y, w, h) boxes baked into the map that building plots must avoid
TOWN_LAND = np.zeros((H, W), bool)   # what the mountains must leave alone: clearing, keep, farm
for (pid, name, c, cap, (cx, cy)) in PROV:
    rows = castle_rows(cap)
    w, h = len(rows[0]), len(rows)
    x0, y0 = nearest_spot(cx, cy, w + 2, h + 2, c)
    castles.append(dict(id=pid, name=name, civ=CIVS[c], capital=cap, rows=rows,
                        x0=x0 + 1, y0=y0 + 1, w=w, h=h, cx=x0 + 1 + w // 2, cy=y0 + 1 + h - 2))
    occupied[y0 - 3:y0 + h + 6, x0 - 3:x0 + w + 5] = True     # keep clear around castles + label
    # a grass clearing for the town to grow into: no trees or mountains, meadow underfoot
    kcx, kcy = x0 + 1 + w // 2, y0 + 1 + h // 2
    # Organic edge: a noisy oval whose rim dithers into the surrounding terrain (no hard box).
    r = ((xx - kcx) / TOWN_R[0]) ** 2 + ((yy - kcy) / TOWN_R[1]) ** 2 + (n_c - 0.5) * 0.45
    rim = np.clip((r - 0.7) / 0.3, 0, 1)
    clearing = (r < 1) & (rnd >= rim) & (civ == c) & ~water
    if c == 0:
        # Highland: an alpine pasture with rocks poking through, so it sits in the mountains.
        img[clearing] = P["pasture"]
        img[clearing & (rnd < 0.2)] = P["grass"]
        img[clearing & (rnd > 0.95)] = P["rock"]
    else:
        img[clearing] = P["grass"]
        img[clearing & (rnd < 0.25)] = P["grass_l"]
        img[clearing & (rnd > 0.93)] = P["meadow"]
    occupied |= clearing
    TOWN_LAND[clearing] = True
    TOWN_LAND[y0:y0 + h + 2, x0:x0 + w + 2] = True
    if c == 0:
        # A fenced wheat farm at the edge of Frostpeak's pasture (kept out of the building plots).
        fx, fy = kcx - 21, kcy - 4
        img[fy:fy + 6, fx:fx + 9] = P["hedge"]
        paint_field(fx + 1, fy + 1, 3, 4, "wheat", "h")
        paint_field(fx + 5, fy + 1, 3, 4, "crop", "v")
        FARMS.append((fx - 1, fy - 1, 11, 8))
        TOWN_LAND[fy - 1:fy + 7, fx - 1:fx + 10] = True

# one area per civilization, owned by its town
prov = np.where(civ >= 0, civ, -1)

# ---------- landmarks & scenery ----------
# ---------- the northern range ----------
# One connected range lit from the top-left: back row of large peaks, then medium, then small, each row
# overlapping the one behind by ~40%, drawn back to front. A rock floor fills the gaps, foothills run
# along the front and dither into the grass, and a light-blue ice channel stays clear down to the reservoir.
mrng = np.random.default_rng(2027)
SIZES = {"large": 20, "medium": 14, "small": 10}   # a slim coastal range; green pasture below

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
protect = (occupied & (civ != 0)) | TOWN_LAND
protect |= dist_from(ice | lake | water, 2) <= 2
dam_x = int(round(river_x(DAM_Y)))
protect[DAM_Y - 6:DAM_Y + 4, dam_x - 9:dam_x + 10] = True
highland_land = land & (civ == 0)
# The rocky range only runs along the top-right coast (right of the lake); the west stays pasture.
range_land = highland_land
west = xx[0] < 172 + (n_b[0] - 0.5) * 18   # per column: the slim north-west strip
land_top = np.array([np.argmax(land[:, x]) if land[:, x].any() else H for x in range(W)], float)
land_top = np.convolve(np.pad(land_top, 7, mode="edge"), np.ones(15) / 15, mode="valid")
row_back = land_top + np.where(west, 11, 19)   # base line of the back row (shallower in the west)
BASE = {"large": row_back, "medium": row_back + 5, "small": row_back + 8}    # rows overlap a little
front = (row_back + 8).astype(int)   # follows the coastline; range_land keeps it in Highland

# rock floor across the whole range so there are no empty patches between peaks
floor = range_land & (yy <= front[None, :] + 1) & ~protect
put(floor, "mt_floor")
put(floor & (rnd < 0.11), "mt_shadow")              # pebbles
put(floor & (np.roll(rnd, 1, axis=1) < 0.04), "mt_shadow")   # a few 2px pebbles

# foothills: a 6-10px band below the front row, dithered 2px into the grass
fh_len = (3 + 3 * vnoise(10)).astype(int)
foot = np.zeros((H, W), bool)
for x in range(W):
    for y in range(front[x] + 2, min(H, front[x] + 2 + fh_len[0, x])):
        foot[y, x] = True
foot &= range_land & ~protect
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
    if not (range_land[box] | ~mask).all(): return False
    base_row = top + hgt - 1
    base_cols = [x + i for i in range(wid) if mask[hgt - 1, i]]
    if not all(floor[base_row, c] or floor[base_row - 1, c] for c in base_cols): return False
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
        x += int(wid * mrng.uniform(1.0, 1.7)) if done else int(mrng.integers(4, 9))   # spaced out

# fill pass: cover the remaining open rock with peaks that sit on bare floor (no overlap, so order holds)
for row in ("small",):
    hgt = SIZES[row]
    cands = [(int(x), int(y)) for y in range(0, H, 3) for x in range(0, W, 3)]
    mrng.shuffle(cands)
    for (x, y) in cands[: len(cands) // 3]:   # only a light sprinkle of extra peaks
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
scatter(TREE, 1, 9000, cond=~clear_v & ~marsh_v & ~beach)
scatter(TREE_L, 1, 300, cond=clear_v & ~beach)
scatter(TREE_L, 2, 220, cond=~beach)
scatter(TREE_L, 3, 120, cond=~marsh_t & ~beach)

def place(rows, pal, region, near, tries=400, dyn=None):
    w, h = len(rows[0]), len(rows)
    for r in range(tries):
        x = int(near[0] + rng.integers(-r // 4 - 2, r // 4 + 3)); y = int(near[1] + rng.integers(-r // 6 - 2, r // 6 + 3))
        if free(x, y, w, h, region): blit(rows, pal, x, y, dyn=dyn); return (x, y)
    return None

# dam across the lake outlet
dxc = int(round(river_x(DAM_Y)))
blit(["OOOOOOOOOOO", "OLLLLLLLLLO", "OMMMsssMMMO", "OOOOsssOOOO"],
     {"O": "ink", "L": "dam_l", "M": "dam_d", "s": "spill"}, dxc - 5, DAM_Y - 2, dyn="dam")
# farm clusters: Verdant west, Forge plains, Tidehaven
frng = np.random.default_rng(4242)
for near in [(60, 128), (100, 96)]:
    farm_cluster(1, near, frng)
for near in [(196, 84), (262, 86), (210, 126), (272, 128), (240, 100)]:
    farm_cluster(2, near, frng)
for near in [(150, 156), (240, 166)]:
    farm_cluster(3, near, frng)
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
BEACHED = ["..m...", ".OPPPO", "OPpppP", ".OOOO."]
beached = 0
for tx, ty in [(118, 176), (40, 150), (292, 126), (158, 184), (70, 172)]:
    if beached >= 3: break
    best = None
    for y in range(max(2, ty - 14), min(H - 5, ty + 14)):
        for x in range(max(2, tx - 14), min(W - 8, tx + 14)):
            box = (slice(y, y + 4), slice(x, x + 6))
            if not land[box].all() or occupied[box].any() or water[box].any(): continue
            if d_sea[y + 3, x + 2] > 1: continue                 # right at the water's edge
            d = (x - tx) ** 2 + (y - ty) ** 2
            if best is None or d < best[0]: best = (d, x, y)
    if best:
        _, x, y = best
        blit(BEACHED, {"m": "plank", "O": "ink", "P": "plank", "p": "soil"}, x, y)
        beached += 1
print("beached boats:", beached)
for (bx, by) in [(186, 192), (224, 190), (120, 193), (300, 150)]:
    if not land[by, bx]:
        blit([".w.", "ww.", "PPP"], {"w": "white", "P": "plank"}, bx, by - 2, mark=False, dyn="boat")

# ---------- terrain kind layer (what each tile is, so the game can flood/burn/melt it) ----------
KINDS = ["deep", "sea", "shallow", "water", "marsh", "forest", "grass", "pasture", "rock", "snow", "beach",
         "field", "structure", "sludge"]
COLOR_KIND = {}
for name, kname in [("forest", "forest"), ("forest_d", "forest"), ("tree", "forest"), ("tree_d", "forest"),
                    ("trunk", "forest"), ("grass", "grass"), ("grass_l", "grass"), ("grass_d", "grass"),
                    ("meadow", "grass"), ("bank", "grass"), ("wet_sand", "beach"), ("hedge", "grass"), ("marsh2", "marsh"), ("reed", "marsh"), ("pool", "marsh"),
                    ("tuft_d", "grass"), ("tuft_l", "grass"), ("flower_w", "grass"), ("flower_y", "grass"),
                    ("flower_p", "grass"),
                    ("wheat_r", "field"), ("crop_l", "field"), ("crop_r", "field"), ("soil_r", "field"), ("crop", "field"), ("pasture", "pasture"), ("rock", "rock"),
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
    for fx, fy, fw, fh in FARMS:
        taken[fy:fy + fh, fx:fx + fw] = True
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
