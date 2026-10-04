"""16x16 pixel-art trade arrows, one set per kingdom, exported at 64x64 (nearest neighbour).

Hard 1 px black outline; the fill is the kingdom's colour, light on the top half and dark on the
bottom half. No other colours, no anti-aliasing. Variants:
  <kingdom>-send.png     thick arrow pointing right
  <kingdom>-receive.png  thick arrow pointing left
  <kingdom>-swap.png     two thin arrows: top points right, bottom points left

Usage: python tools/arrow_sprites.py apps/web/public/assets/arrows
"""
import sys
from PIL import Image

KINGDOMS = {
    "highland": ("#a07ad6", "#6e4fa0"),
    "verdant": ("#7fd65a", "#4f9a34"),
    "forge": ("#f08a3c", "#b85a1e"),
    "tidehaven": ("#46d6d0", "#1e8a86"),
}
SIZE, SCALE = 16, 4
BLACK = (0, 0, 0, 255)


def rgba(hex_):
    return tuple(int(hex_[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


def thick_right():
    """Fill pixels and the row that splits light from dark: 3 px shaft, 7 px tall head."""
    fill = {(x, y) for x in range(2, 10) for y in range(6, 9)}
    for x in range(10, 14):
        h = 3 - (x - 10)
        fill |= {(x, y) for y in range(7 - h, 7 + h + 1)}
    return fill, 7


def thin_right(cx0, cy):
    """A thin arrow: 2 px shaft (rows cy, cy+1) and a 6 px tall head."""
    fill = {(x, y) for x in range(cx0, cx0 + 8) for y in (cy, cy + 1)}
    for i, x in enumerate(range(cx0 + 8, cx0 + 11)):
        h = 2 - i
        fill |= {(x, y) for y in range(cy - h, cy + 1 + h + 1)}
    return fill


def mirror(fill):
    return {(SIZE - 1 - x, y) for x, y in fill}


def render(parts, light, dark):
    """parts: list of (fill pixels, last light row). Outline = 4-neighbours of the fill."""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()
    every = set().union(*(f for f, _ in parts))
    for fill, split in parts:
        for x, y in fill:
            px[x, y] = light if y <= split else dark
    for x, y in every:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if n not in every and 0 <= n[0] < SIZE and 0 <= n[1] < SIZE:
                px[n] = BLACK
    return img.resize((SIZE * SCALE, SIZE * SCALE), Image.NEAREST)


def variants():
    right, split = thick_right()
    top = thin_right(1, 3)                   # rows 1..6, points right
    bottom = mirror(thin_right(1, 11))       # rows 9..14, points left
    return {
        "send": [(right, split)],
        "receive": [(mirror(right), split)],
        "swap": [(top, 3), (bottom, 11)],
    }


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    sheet = Image.new("RGBA", (3 * 64 + 4 * 8, 4 * 64 + 5 * 8), (128, 128, 128, 255))
    for row, (name, (light, dark)) in enumerate(KINGDOMS.items()):
        for col, (kind, parts) in enumerate(variants().items()):
            img = render(parts, rgba(light), rgba(dark))
            img.save(f"{out}/{name}-{kind}.png")
            sheet.alpha_composite(img, (8 + col * 72, 8 + row * 72))
    sheet.save(f"{out}/_sheet.png")
    print("wrote", out)
