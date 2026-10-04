"""Turn any image into 8-bit style pixel art with Pillow.

How it works:
  1. Downsample: shrink the image so each output "pixel" stands for a block of PIXEL_SIZE x PIXEL_SIZE
     source pixels. NEAREST keeps hard edges; BILINEAR averages each block (smoother colours).
  2. Quantize: reduce the picture to a small palette (e.g. 16 or 32 colours), like old consoles.
  3. Upscale: blow the small image back up to the original size with NEAREST, so every block stays
     a crisp square instead of being blurred.

Usage:
  python tools/pixelate.py input.png output.png
  python tools/pixelate.py input.png output.png --pixel-size 12 --colors 16 --resample bilinear --dither
  python tools/pixelate.py input.png sprite.png --pixel-size 8 --colors 24 --no-upscale   # keep it tiny
"""
import argparse
from PIL import Image

# ---- Adjustable defaults ----------------------------------------------------------------------
PIXEL_SIZE = 8          # size of one "retro pixel" in source pixels (bigger = blockier)
COLORS = 16             # palette size: 16 or 32 feel 8-bit; 4-8 feels Game Boy
RESAMPLE = "nearest"    # "nearest" (sharp, may alias) or "bilinear" (averages each block)
DITHER = False          # Floyd-Steinberg dithering: retro texture, but noisier
# ----------------------------------------------------------------------------------------------

RESAMPLERS = {"nearest": Image.NEAREST, "bilinear": Image.BILINEAR}


def pixelate(img, pixel_size=PIXEL_SIZE, colors=COLORS, resample=RESAMPLE, dither=DITHER, upscale=True):
    """Return an 8-bit style copy of `img` (a PIL Image)."""
    if pixel_size < 1:
        raise ValueError("pixel_size must be >= 1")
    if not 2 <= colors <= 256:
        raise ValueError("colors must be between 2 and 256")

    # Keep transparency aside: quantize works on RGB, then we restore a hard-edged alpha.
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    rgba = img.convert("RGBA")
    width, height = rgba.size

    # 1. Downsample to the low-res grid (at least 1x1).
    small_size = (max(1, width // pixel_size), max(1, height // pixel_size))
    small = rgba.resize(small_size, RESAMPLERS[resample])

    # 2. Quantize the colours to a limited palette. MEDIANCUT picks colours that suit this image.
    rgb = small.convert("RGB")
    paletted = rgb.quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.FLOYDSTEINBERG if dither else Image.Dither.NONE,
    )
    small_out = paletted.convert("RGBA")
    if has_alpha:
        # Retro sprites have no soft edges: each pixel is either fully on or fully off.
        alpha = small.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
        small_out.putalpha(alpha)

    if not upscale:
        return small_out

    # 3. Upscale back with NEAREST so the blocks stay perfectly sharp.
    return small_out.resize((small_size[0] * pixel_size, small_size[1] * pixel_size), Image.NEAREST)


def main():
    p = argparse.ArgumentParser(description="Convert an image into 8-bit pixel art.")
    p.add_argument("input")
    p.add_argument("output")
    p.add_argument("--pixel-size", type=int, default=PIXEL_SIZE, help="block size in source pixels")
    p.add_argument("--colors", type=int, default=COLORS, help="palette size (e.g. 16 or 32)")
    p.add_argument("--resample", choices=RESAMPLERS, default=RESAMPLE, help="downsampling filter")
    p.add_argument("--dither", action="store_true", help="enable Floyd-Steinberg dithering")
    p.add_argument("--no-upscale", action="store_true", help="save the small sprite instead")
    a = p.parse_args()

    out = pixelate(Image.open(a.input), a.pixel_size, a.colors, a.resample, a.dither, not a.no_upscale)
    out.save(a.output)
    print(f"saved {a.output} ({out.size[0]}x{out.size[1]}, {a.colors} colours, {a.pixel_size}px blocks)")


if __name__ == "__main__":
    main()
