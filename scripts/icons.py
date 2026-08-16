#!/usr/bin/env python3
"""Bakes every icon PNG this app ships, from one description of the mark.

Run:  python3 scripts/icons.py            (writes to repo root)
      python3 scripts/icons.py --check    (verifies, writes nothing)

WHY THIS EXISTS. Until v4.6.3 the icons were baked outside the repo and the
only record of how was prose in the head comment. That is fine until someone
needs to change one of them, and then every measurement the comment asserts -
the W's diagonal against the maskable safe zone, the flatten to RGB - has to
be reproduced by hand and trusted. Here they are executable instead.

THE FLATTEN IS THE POINT, not a detail. iOS composites any transparency onto
black, so an alpha channel buys nothing and risks a black wedge showing
through its own superellipse mask. Everything below is built on an opaque RGB
canvas and asserted alpha-free on the way out; test/structure.test.js asserts
it again on the committed files, because "a future regeneration forgets the
flatten" is exactly the kind of change that looks right on a desktop and is
wrong on a phone.

THIS IS NOT A FIX FOR THE DARK ICON PROBLEM. See the icon comment in
index.html: no icon design defeats the iOS dark transform. This mark degrades
gracefully under it instead of falling apart. That is the whole claim.
"""

import sys, os
from PIL import Image, ImageDraw, ImageFont

ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT  = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'

# Straight from the app's tokens. --sign and --char are declared once in :root
# and never themed, so the icon and the header tile are the same two colours in
# both appearances - which is the reason the tile can be pixel-identical light
# and dark, and the reason a dark icon VARIANT would contradict the app.
CHAR = (0x14, 0x11, 0x0E)   # --char, the ground
SIGN = (0xFF, 0xC7, 0x2C)   # --sign, the W
GRID = (0x33, 0x2C, 0x24)   # --line (dark theme): the waffle, one step up from
                            # the ground. Light enough to read as texture at
                            # 180px, dark enough that the icon still reads as
                            # one flat dark tile rather than as a pattern.

# 4 wells across, with the outer margin equal to the inner gutter, and the
# gutter a quarter of a well: 4w + 5g = 1 and g = w/4.
WELLS   = 4
WELL    = 1.0 / (WELLS + (WELLS + 1) / 4.0)
GUTTER  = WELL / 4.0
RADIUS  = 0.20          # of a well, so the waffle reads as pressed, not tiled

W_WIDTH = 0.62          # target glyph width as a fraction of the icon
SS      = 4             # supersample factor; the grid edges alias badly at 1x


def _fit_font(target_px):
    """Point size whose rendered 'W' is target_px wide. Bisection rather than a
    ratio, because Liberation's advance width and its INK width differ and it
    is the ink that has to land on 0.62."""
    lo, hi = 1, target_px * 4
    while lo < hi:
        mid = (lo + hi + 1) // 2
        f = ImageFont.truetype(FONT, mid)
        l, t, r, b = f.getbbox('W')
        if (r - l) <= target_px:
            lo = mid
        else:
            hi = mid - 1
    return ImageFont.truetype(FONT, lo)


def render(size, grid=True):
    """One icon, opaque, square, no corner radius of its own - iOS masks with
    its superellipse and Android launchers apply their own shape, so a source
    that rounds its own corners shows dark wedges through the mask."""
    S = size * SS
    im = Image.new('RGB', (S, S), CHAR)
    d = ImageDraw.Draw(im)

    if grid:
        # Dropped at 32 and 16: the wells are under two pixels there and only
        # add noise around the W.
        w, g = WELL * S, GUTTER * S
        for row in range(WELLS):
            for col in range(WELLS):
                x = g + col * (w + g)
                y = g + row * (w + g)
                d.rounded_rectangle([x, y, x + w, y + w], radius=w * RADIUS, fill=GRID)

    f = _fit_font(int(round(W_WIDTH * S)))
    l, t, r, b = f.getbbox('W')
    # Centre on the INK box. Liberation's 'W' carries asymmetric side bearings
    # and a font-metrics centring puts the glyph visibly left of centre - the
    # same trap the 3.5.0 icons hit and corrected by 2.5px.
    d.text(((S - (r - l)) / 2 - l, (S - (b - t)) / 2 - t), 'W', font=f, fill=SIGN)

    return im.resize((size, size), Image.LANCZOS)


def glyph_metrics(size=512):
    """The two numbers the head comment asserts: the W's width and the diagonal
    of its bounding box, both as fractions of the icon. The diagonal is what
    decides whether a circular maskable crop clips the glyph."""
    S = size * SS
    f = _fit_font(int(round(W_WIDTH * S)))
    l, t, r, b = f.getbbox('W')
    wf, hf = (r - l) / S, (b - t) / S
    return wf, hf, (wf * wf + hf * hf) ** 0.5


# name -> (px, draw the waffle grid?)
TARGETS = [
    ('apple-touch-icon.png',    180, True),
    ('icon-192.png',            192, True),
    ('icon-512.png',            512, True),
    # Identical contents to icon-512 on purpose: the W's diagonal already sits
    # inside the maskable safe zone, so there is nothing to shrink. Both files
    # still ship because the manifest declares purpose "maskable" separately
    # and a launcher may fetch either. The grid's outer wells DO get clipped by
    # a circular crop; that is intended, the grid is background texture and
    # only the W has to survive the mask.
    ('icon-maskable-512.png',   512, True),
    ('favicon-32.png',           32, False),
    ('favicon-16.png',           16, False),
]


def main():
    check = '--check' in sys.argv
    wf, hf, diag = glyph_metrics()
    print('glyph: width %.3f  height %.3f  diagonal %.3f of the icon' % (wf, hf, diag))
    print('maskable safe zone: diagonal must stay under 0.80 -> %s'
          % ('OK' if diag < 0.80 else 'CLIPS'))
    if diag >= 0.80:
        sys.exit('the W would be clipped by a circular mask')

    for name, px, grid in TARGETS:
        im = render(px, grid)
        assert im.mode == 'RGB', name + ' is not flat RGB'
        path = os.path.join(ROOT, name)
        if check:
            if not os.path.exists(path):
                sys.exit(name + ' missing')
            cur = Image.open(path)
            same = (cur.mode == 'RGB' and cur.size == (px, px)
                    and cur.convert('RGB').tobytes() == im.tobytes())
            print('  %-24s %s' % (name, 'matches' if same else 'DIFFERS from a fresh bake'))
        else:
            im.save(path, 'PNG', optimize=True)
            print('  %-24s %dx%d %s' % (name, px, px, 'grid' if grid else 'no grid'))


if __name__ == '__main__':
    main()
