"""Draw the custom leaders in the same 8-bit style as the sprites lifted from the reference.

  first leader slot (sprite id "ostra"): The Lorax, an orange furball with a huge yellow mustache
  last leader slot  (sprite id "pell"):  Tung Tung Tung Sahur, a wooden log with a bat

Shapes are drawn on a 29x46 grid with flat colours, then a 1 px dark outline is added around the
figure. For each character this writes the four files the game loads:
  <id>.png, <id>-talk.png (mouth open), <id>-portrait.png, <id>-portrait-talk.png (32x32 on cream)

Usage: python tools/custom_leaders.py apps/web/public/assets/leaders [assets/portraits]
Run it after tools/extract_leaders.py, which would otherwise restore the original art.
"""
import sys
from PIL import Image

W, H = 29, 46
OUTLINE = (42, 26, 14, 255)
CLEAR = (0, 0, 0, 0)
WHITE, PUPIL = (244, 240, 228, 255), (26, 18, 10, 255)
MOUTH, INSIDE, TONGUE = (110, 42, 26, 255), (58, 22, 18, 255), (200, 80, 70, 255)
CREAM = (217, 187, 120, 255)
# Tung Tung Tung Sahur
WOOD_L, WOOD, WOOD_D = (226, 150, 84, 255), (196, 116, 56, 255), (150, 82, 38, 255)
GRAIN = (112, 58, 26, 255)
END_GRAIN = (240, 184, 120, 255)
RING = (74, 42, 20, 255)
BAT, BAT_D = (206, 124, 62, 255), (156, 86, 40, 255)
# The Lorax
FUR_L, FUR, FUR_D = (246, 150, 70, 255), (226, 112, 40, 255), (184, 78, 26, 255)
STACHE_L, STACHE, STACHE_D = (252, 228, 140, 255), (240, 202, 96, 255), (204, 160, 64, 255)
IRIS = (96, 150, 64, 255)
ARM_LINE = (140, 56, 20, 255)
# Shrek
OGRE_L, OGRE, OGRE_D = (178, 206, 84, 255), (146, 178, 58, 255), (108, 140, 40, 255)
BROWN_EYE = (92, 56, 30, 255)
TUNIC_L, TUNIC, TUNIC_D = (240, 234, 214, 255), (220, 210, 184, 255), (184, 172, 146, 255)
VEST, VEST_D = (110, 76, 46, 255), (74, 50, 30, 255)
PANTS, PANTS_D = (140, 104, 48, 255), (112, 80, 36, 255)
BOOT, BOOT_D = (78, 62, 52, 255), (52, 40, 34, 255)
# Olaf
SNOW_L, SNOW, SNOW_D = (252, 253, 255, 255), (228, 236, 246, 255), (182, 198, 220, 255)
COAL = (40, 40, 48, 255)
TWIG, TWIG_D = (118, 78, 44, 255), (84, 54, 30, 255)
CARROT, CARROT_D = (244, 126, 44, 255), (204, 88, 26, 255)


def canvas():
    """A blank sprite plus `put`, `line` and `row` drawing helpers bound to it."""
    img = Image.new("RGBA", (W, H), CLEAR)
    px = img.load()

    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            px[x, y] = c

    def line(x0, y0, x1, y1, c, thick=1):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            x = round(x0 + (x1 - x0) * i / n)
            y = round(y0 + (y1 - y0) * i / n)
            for t in range(thick):
                put(x + t, y, c)

    def row(y, x0, x1, c):
        for x in range(x0, x1 + 1):
            put(x, y, c)

    return img, put, line, row


def outline(img):
    """Add a 1 px dark outline around every opaque pixel of the figure."""
    a = img.load()
    edge = []
    for y in range(H):
        for x in range(W):
            if a[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and a[nx, ny][3] and a[nx, ny] != OUTLINE:
                    edge.append((x, y))
                    break
    for x, y in edge:
        a[x, y] = OUTLINE
    return img


def draw_lorax(talking=False):
    img, put, line, row = canvas()

    # Round furry body, widest at the belly: light fur on the left, shade on the right.
    widths = {18: (8, 20), 19: (7, 21), 20: (6, 22), 21: (6, 22)}
    for y in range(22, 36):
        widths[y] = (5, 23)
    widths.update({36: (6, 22), 37: (6, 22), 38: (7, 21), 39: (8, 20), 40: (9, 19)})
    for y, (x0, x1) in widths.items():
        for x in range(x0, x1 + 1):
            put(x, y, FUR_L if x <= x0 + 2 else FUR_D if x >= x1 - 2 else FUR)
    for x, y in ((9, 30), (12, 34), (17, 32), (14, 37), (19, 31), (11, 22), (16, 36)):
        put(x, y, FUR_D)  # fur flecks
    for x, y in ((8, 33), (13, 31), (18, 38)):
        put(x, y, FUR_L)

    # Furry arms hanging out from the shoulders, little mitten hands at the ends.
    for i, y in enumerate(range(20, 31)):
        lx = 3 - i // 4          # 3 px thick, drifting outward as it goes down
        rx = 23 + i // 4
        put(lx, y, FUR_L); put(lx + 1, y, FUR_L); put(lx + 2, y, FUR)
        put(rx, y, FUR); put(rx + 1, y, FUR); put(rx + 2, y, FUR_D)
    for y in (31, 32, 33):                                   # mitten hands
        row(y, 0, 3, FUR_L if y < 33 else FUR)
        row(y, 25, 28, FUR if y < 33 else FUR_D)
    put(4, 31, FUR_L); put(24, 31, FUR)                      # thumbs
    row(21, 5, 6, ARM_LINE); row(21, 22, 23, ARM_LINE)       # shoulder creases

    # Head: rounded top with tufts of fur.
    for y in range(5, 18):
        x0, x1 = (8, 20) if y in (5, 6) else (7, 21)
        for x in range(x0, x1 + 1):
            put(x, y, FUR_L if x <= x0 + 1 else FUR_D if x >= x1 - 1 else FUR)
    for x, y in ((10, 4), (11, 3), (14, 3), (15, 2), (18, 4)):
        put(x, y, FUR); put(x, y + 1, FUR)

    # Bushy yellow eyebrows over skeptical, half-lidded eyes with green irises.
    row(7, 7, 12, STACHE); row(8, 8, 12, STACHE_D); put(6, 7, STACHE_L)
    row(7, 16, 21, STACHE); row(8, 16, 20, STACHE_D); put(22, 7, STACHE_L)
    for ex in (8, 16):
        row(9, ex, ex + 4, FUR_D)  # heavy lid
        row(10, ex, ex + 4, WHITE); row(11, ex, ex + 4, WHITE)
        put(ex + 2, 10, IRIS); put(ex + 3, 10, IRIS)
        put(ex + 2, 11, PUPIL); put(ex + 3, 11, IRIS)
    row(12, 13, 15, FUR_D)  # nose

    # Enormous bushy mustache: full across the face, wings drooping down past the chin on each side,
    # wispy strands, and a gap in the middle where the mouth shows.
    stache = {13: [(11, 17)], 14: [(8, 20)], 15: [(5, 23)], 16: [(3, 25)], 17: [(2, 26)],
              18: [(2, 12), (16, 26)], 19: [(2, 10), (18, 26)], 20: [(3, 8), (20, 25)],
              21: [(3, 6), (22, 25)], 22: [(4, 5), (23, 24)]}
    for y, spans in stache.items():
        for x0, x1 in spans:
            for x in range(x0, x1 + 1):
                if y <= 14:
                    c = STACHE_L
                elif y >= 19:
                    c = STACHE_D if x % 2 else STACHE
                else:
                    c = STACHE_L if (x + y) % 3 == 0 else STACHE
                put(x, y, c)
    if talking:
        row(18, 13, 15, INSIDE); row(19, 12, 16, INSIDE); put(14, 19, TONGUE)
    else:
        row(18, 13, 15, FUR_D); row(19, 12, 16, MOUTH)

    # Stubby legs and pointy feet.
    for x in (11, 12, 16, 17):
        put(x, 41, FUR_D); put(x, 42, FUR_D)
    row(43, 8, 12, FUR); row(44, 7, 12, FUR_D)
    row(43, 16, 20, FUR); row(44, 16, 21, FUR_D)
    return outline(img)


def draw_shrek(talking=False):
    img, put, line, row = canvas()

    # Big green hands raised beside the head, fingers spread.
    for hx in (0, 23):
        for y in range(7, 12):
            row(y, hx + 1, hx + 4, OGRE if y < 10 else OGRE_D)
        for f in range(4):
            put(hx + 1 + f, 6 - (f % 2), OGRE_L)  # fingertips
            put(hx + 1 + f, 5 + (f % 2), OGRE)
        put(hx if hx == 0 else hx + 5, 9, OGRE)    # thumb
    # Sleeves from the hands down to the shoulders.
    line(3, 12, 7, 18, TUNIC, 2)
    line(25, 12, 21, 18, TUNIC, 2)
    line(4, 13, 7, 17, TUNIC_D)
    line(24, 13, 21, 17, TUNIC_D)

    # Torso: cream tunic with a big belly, open brown vest, laces, belt and a ragged hem.
    for y in range(16, 34):
        x0, x1 = (8, 20) if y < 24 else (7, 21)
        for x in range(x0, x1 + 1):
            put(x, y, TUNIC_L if x <= x0 + 1 else TUNIC_D if x >= x1 - 1 else TUNIC)
    for y in range(16, 27):
        for x in (8, 9, 10, 11, 17, 18, 19, 20):
            if y < 26 or x in (8, 20):
                put(x, y, VEST if (x + y) % 3 else VEST_D)
    put(14, 17, VEST_D); put(13, 18, VEST_D); put(15, 18, VEST_D)  # laces
    row(30, 7, 21, VEST_D)                                         # belt
    for x in range(7, 22, 2):
        put(x, 33, CLEAR)                                          # ragged hem

    # Head: round green face with ear stalks, heavy brow, bulb nose and a big open grin.
    for y in range(4, 16):
        x0, x1 = (10, 18) if y in (4, 15) else (9, 19)
        for x in range(x0, x1 + 1):
            put(x, y, OGRE_L if x <= x0 + 1 else OGRE_D if x >= x1 - 1 else OGRE)
    put(8, 6, OGRE); put(7, 5, OGRE_L); put(7, 4, OGRE)      # left ear
    put(20, 6, OGRE); put(21, 5, OGRE_D); put(21, 4, OGRE)   # right ear
    row(7, 10, 12, OGRE_D); row(7, 16, 18, OGRE_D)           # brow
    for ex in (11, 16):
        put(ex, 8, WHITE); put(ex + 1, 8, WHITE)
        put(ex + 1 if ex == 11 else ex, 8, BROWN_EYE)
    row(10, 13, 15, OGRE_D); put(14, 9, OGRE); put(14, 11, OGRE_D)  # nose
    if talking:
        row(12, 11, 17, MOUTH)
        row(13, 11, 17, INSIDE); put(12, 13, WHITE); put(16, 13, WHITE)
        row(14, 12, 16, INSIDE); put(14, 14, TONGUE); put(13, 14, TONGUE)
        row(15, 12, 16, MOUTH)
    else:
        row(12, 11, 17, MOUTH)
        row(13, 12, 16, WHITE)
        row(14, 12, 16, INSIDE); put(14, 14, TONGUE)

    # Brown trousers in a wide stance and dark boots.
    for y in range(34, 41):
        d = (y - 34) // 3
        row(y, 8 - d, 11 - d, PANTS); put(11 - d, y, PANTS_D)
        row(y, 17 + d, 20 + d, PANTS); put(20 + d, y, PANTS_D)
    row(41, 4, 10, BOOT); row(42, 3, 10, BOOT); row(43, 3, 10, BOOT_D)
    row(41, 18, 24, BOOT); row(42, 18, 25, BOOT); row(43, 18, 25, BOOT_D)
    return outline(img)


def draw_olaf(talking=False):
    img, put, line, row = canvas()

    def shade(x, y, cx, cy, rx, ry):
        """Clean snow: bright on the upper left, cool shade on the lower right."""
        d = (x - cx) / max(rx, 1) + (y - cy) / max(ry, 1)
        return SNOW_L if d < -0.7 else SNOW_D if d > 0.75 else SNOW

    def blob(spans, cx, cy, rx, ry):
        for y, (x0, x1) in spans.items():
            for x in range(x0, x1 + 1):
                put(x, y, shade(x, y, cx, cy, rx, ry))

    def egg(cx, cy, rx, ry, tilt=0.0):
        """Ellipse leaning sideways by `tilt` pixels per row, for a dynamic pose."""
        spans = {}
        for y in range(cy - ry, cy + ry + 1):
            t = (y - cy) / (ry + 0.5)
            half = rx * (1 - t * t) ** 0.5
            off = (y - cy) * tilt
            spans[y] = (round(cx + off - half), round(cx + off + half))
        blob(spans, cx, cy, rx, ry)

    # Thin stick arms raised in an energetic pose, with twig fingers (behind the torso).
    line(11, 25, 4, 17, TWIG)
    line(4, 17, 3, 13, TWIG); line(4, 17, 1, 16, TWIG_D); line(4, 17, 2, 19, TWIG_D)
    line(7, 21, 6, 18, TWIG_D)
    line(17, 25, 24, 17, TWIG)
    line(24, 17, 25, 13, TWIG); line(24, 17, 27, 16, TWIG_D); line(24, 17, 26, 19, TWIG_D)
    line(21, 21, 22, 18, TWIG_D)

    # Two stubby pillar feet under the body.
    for y in range(40, 45):
        row(y, 8, 11, SNOW if y < 43 else SNOW_D)
        row(y, 17, 20, SNOW if y < 43 else SNOW_D)
    put(8, 44, CLEAR); put(11, 44, CLEAR); put(17, 44, CLEAR); put(20, 44, CLEAR)

    # Lower body: a larger, wider egg leaning to one side, with two coal buttons stacked.
    egg(14, 34, 8, 6, tilt=0.18)
    # Upper torso: a small, slightly flattened snowball with one coal button.
    egg(14, 25, 4, 3)

    # Head: tall diamond-oval, big upper skull, narrower cheeks, then a jutting lower jaw.
    head = {5: (12, 16), 6: (10, 18), 7: (9, 19), 8: (8, 20), 9: (7, 21), 10: (7, 21),
            11: (7, 21), 12: (7, 21), 13: (8, 20), 14: (8, 20), 15: (8, 20), 16: (8, 21),
            17: (8, 21), 18: (8, 21), 19: (9, 20), 20: (10, 19), 21: (12, 17)}
    blob(head, 14, 13, 7, 8)

    # Three thin branching twigs sprouting straight up from the top centre.
    line(14, 4, 14, 0, TWIG); put(15, 1, TWIG); put(13, 2, TWIG_D)
    line(12, 5, 11, 1, TWIG); put(10, 2, TWIG_D)
    line(16, 5, 17, 1, TWIG); put(18, 2, TWIG_D)

    # Coal buttons: one on the upper torso, two vertically on the lower body.
    for x, y in ((14, 25), (14, 31), (15, 35)):
        row(y, x, x + 1, COAL); put(x, y + 1, COAL)

    # Thin stick eyebrows over two large round black eyes set close together.
    line(8, 8, 12, 7, TWIG_D)
    line(16, 7, 20, 8, TWIG_D)
    for ex in (8, 16):
        for y in range(9, 13):
            row(y, ex, ex + 3, COAL)
        for cx, cy in ((ex, 9), (ex + 3, 9), (ex, 12), (ex + 3, 12)):
            put(cx, cy, SNOW)                     # round off the corners
        put(ex + 1, 10, WHITE)                    # glint

    # Long, slightly curved carrot nose sticking out from between the eyes.
    row(12, 13, 18, CARROT); put(19, 13, CARROT); put(20, 13, CARROT_D)
    row(13, 14, 18, CARROT_D)

    # Huge open mouth with one big rectangular tooth on the top gumline.
    bottom = 20 if talking else 19
    row(15, 10, 18, MOUTH)
    for y in range(16, bottom):
        row(y, 10 if y < 18 else 11, 18 if y < 18 else 17, INSIDE)
    row(16, 13, 15, WHITE); row(17, 13, 15, WHITE)
    row(bottom - 1, 13, 15, TONGUE)
    row(bottom, 12, 16, MOUTH)
    return outline(img)


def draw_log(talking=False):
    img, put, line, row = canvas()

    # Bat first, so the hand and body sit in front of it: handle up at the hand, barrel on the floor.
    line(7, 24, 2, 43, BAT)
    line(6, 30, 2, 43, BAT_D)
    line(4, 35, 1, 43, BAT, 2)

    # Log body (head and torso are one piece): light left edge, dark right edge, end grain on top.
    for y in range(1, 32):
        for x in range(9, 21):
            put(x, y, WOOD_L if x <= 10 else WOOD_D if x >= 19 else WOOD)
    put(9, 1, CLEAR); put(20, 1, CLEAR)
    row(1, 10, 19, END_GRAIN)
    for x in range(11, 19):
        put(x, 2, END_GRAIN if x in (11, 18) else WOOD_L)
    line(12, 19, 12, 23, GRAIN)  # long grain streaks and a knot
    line(12, 26, 12, 29, GRAIN)
    line(17, 21, 17, 27, GRAIN)
    put(15, 24, GRAIN); put(14, 25, GRAIN); put(15, 26, GRAIN); put(16, 25, GRAIN)

    # Big round staring eyes with dark rings, and heavy brows.
    for ex in (9, 16):
        for y in range(6, 11):
            for x in range(ex, ex + 5):
                if not ((x in (ex, ex + 4)) and (y in (6, 10))):
                    put(x, y, RING)
        for y in range(7, 10):
            row(y, ex + 1, ex + 3, WHITE)
        put(ex + 2, 8, PUPIL); put(ex + 2, 7, PUPIL)
        line(ex + 1, 5, ex + 3, 5, GRAIN)

    # Nose and a wide toothy grin.
    put(14, 11, WOOD_D); put(15, 11, WOOD_D); put(14, 12, GRAIN); put(15, 12, WOOD_D)
    put(10, 13, MOUTH); put(19, 13, MOUTH)
    if talking:
        row(14, 11, 18, MOUTH)
        row(15, 12, 17, INSIDE); put(11, 15, MOUTH); put(18, 15, MOUTH)
        row(16, 12, 17, INSIDE); put(14, 16, TONGUE); put(15, 16, TONGUE)
        row(17, 12, 17, MOUTH)
    else:
        put(11, 14, MOUTH); put(18, 14, MOUTH)
        row(14, 12, 17, WHITE)
        row(15, 12, 17, MOUTH)

    # Thin arms: left hand grips the bat handle, right arm hangs.
    line(8, 17, 7, 26, WOOD)
    put(6, 26, WOOD_L); put(7, 27, WOOD_L); put(6, 27, WOOD)
    line(21, 17, 22, 27, WOOD_D)
    put(22, 28, WOOD); put(23, 28, WOOD)

    # Thin legs and big bare feet.
    line(12, 32, 12, 42, WOOD)
    line(17, 32, 17, 42, WOOD_D)
    for x in range(8, 14):
        put(x, 43, WOOD_L if x < 10 else WOOD)
        put(x, 44, WOOD)
    for x in range(16, 22):
        put(x, 43, WOOD if x < 20 else WOOD_D)
        put(x, 44, WOOD_D)
    put(8, 43, END_GRAIN); put(16, 43, END_GRAIN)
    return outline(img)


def portrait(sprite):
    """Head close-up on cream, like the other leaders' 32x32 portraits."""
    port = Image.new("RGBA", (32, 32), CREAM)
    port.alpha_composite(sprite.crop((-1, 0, 31, 30)), (0, 4))
    return port


CHARACTERS = {"ostra": draw_lorax, "moss": draw_shrek, "brask": draw_olaf, "pell": draw_log}

if __name__ == "__main__":
    outs = sys.argv[1:] or ["."]
    for sprite_id, draw in CHARACTERS.items():
        still, talk = draw(), draw(talking=True)
        for out in outs:
            still.save(f"{out}/{sprite_id}.png")
            talk.save(f"{out}/{sprite_id}-talk.png")
            portrait(still).save(f"{out}/{sprite_id}-portrait.png")
            portrait(talk).save(f"{out}/{sprite_id}-portrait-talk.png")
    print("wrote", ", ".join(outs))
