"""Draw the first leader: a wooden-log character with a bat, in the same 8-bit style as the others.

Shapes are drawn on a 29x46 grid with flat colours, then a 1 px dark outline is added around the
figure (like the sprites extracted from the reference). Writes the four files the game loads:
  ostra.png, ostra-talk.png (mouth open), ostra-portrait.png, ostra-portrait-talk.png (32x32 on cream)

Usage: python tools/log_leader.py apps/web/public/assets/leaders [assets/portraits]
"""
import sys
from PIL import Image

W, H = 29, 46
OUTLINE = (42, 26, 14, 255)
WOOD_L, WOOD, WOOD_D = (226, 150, 84, 255), (196, 116, 56, 255), (150, 82, 38, 255)
GRAIN = (112, 58, 26, 255)
END_GRAIN = (240, 184, 120, 255)
RING = (74, 42, 20, 255)
WHITE, PUPIL = (244, 240, 228, 255), (26, 18, 10, 255)
MOUTH, INSIDE, TONGUE = (110, 42, 26, 255), (58, 22, 18, 255), (200, 80, 70, 255)
BAT, BAT_D = (206, 124, 62, 255), (156, 86, 40, 255)
CREAM = (217, 187, 120, 255)


def draw(talking=False):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = img.load()

    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            px[x, y] = c

    def line(x0, y0, x1, y1, c, thick=1):
        n = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(n + 1):
            x = round(x0 + (x1 - x0) * i / n)
            y = round(y0 + (y1 - y0) * i / n)
            for t in range(thick):
                put(x + t, y, c)

    # Bat first, so the hand and body sit in front of it: handle up at the hand, barrel on the floor.
    line(7, 24, 2, 43, BAT)
    line(6, 30, 2, 43, BAT_D)
    line(4, 35, 1, 43, BAT, 2)

    # Log body (head and torso are one piece): light left edge, dark right edge, end grain on top.
    for y in range(1, 32):
        for x in range(9, 21):
            put(x, y, WOOD_L if x <= 10 else WOOD_D if x >= 19 else WOOD)
    put(9, 1, (0, 0, 0, 0)); put(20, 1, (0, 0, 0, 0))
    for x in range(10, 20):
        put(x, 1, END_GRAIN)
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
                corner = (x in (ex, ex + 4)) and (y in (6, 10))
                if not corner:
                    put(x, y, RING)
        for y in range(7, 10):
            for x in range(ex + 1, ex + 4):
                put(x, y, WHITE)
        put(ex + 2, 8, PUPIL)
        put(ex + 2, 7, PUPIL)
        line(ex + 1, 5, ex + 3, 5, GRAIN)

    # Nose and grin.
    put(14, 11, WOOD_D); put(15, 11, WOOD_D); put(14, 12, GRAIN); put(15, 12, WOOD_D)
    if talking:
        put(10, 13, MOUTH); put(19, 13, MOUTH)
        line(11, 14, 18, 14, MOUTH)
        line(12, 15, 17, 15, INSIDE)
        put(11, 15, MOUTH); put(18, 15, MOUTH)
        line(12, 16, 17, 16, INSIDE)
        put(14, 16, TONGUE); put(15, 16, TONGUE)
        line(12, 17, 17, 17, MOUTH)
    else:
        # wide toothy grin
        put(10, 13, MOUTH); put(19, 13, MOUTH)
        put(11, 14, MOUTH); put(18, 14, MOUTH)
        line(12, 14, 17, 14, WHITE)
        line(12, 15, 17, 15, MOUTH)

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

    # 1 px outline around the whole figure.
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


def portrait(sprite):
    """Head close-up on cream, like the other leaders' 32x32 portraits."""
    port = Image.new("RGBA", (32, 32), CREAM)
    port.alpha_composite(sprite.crop((-1, 0, 31, 30)), (0, 4))
    return port


if __name__ == "__main__":
    outs = sys.argv[1:] or ["."]
    still, talk = draw(), draw(talking=True)
    for out in outs:
        still.save(f"{out}/ostra.png")
        talk.save(f"{out}/ostra-talk.png")
        portrait(still).save(f"{out}/ostra-portrait.png")
        portrait(talk).save(f"{out}/ostra-portrait-talk.png")
    print("wrote", ", ".join(outs))
