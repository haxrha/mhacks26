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

    # Arms folded across the chest: dark creases above and below, near forearm over the far one,
    # little fist poking out on the right.
    row(24, 8, 20, ARM_LINE)
    row(25, 7, 19, FUR_L); row(26, 7, 19, FUR)
    row(27, 9, 21, ARM_LINE)
    row(28, 9, 21, FUR); row(29, 10, 20, FUR_D)
    row(30, 10, 19, ARM_LINE)
    put(20, 25, FUR_L); put(21, 25, FUR_L); put(21, 26, FUR); put(22, 26, FUR)
    put(6, 28, FUR_D); put(7, 28, FUR)  # far elbow

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


CHARACTERS = {"ostra": draw_lorax, "pell": draw_log}

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
