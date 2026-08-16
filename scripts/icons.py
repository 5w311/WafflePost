#!/usr/bin/env python3
"""Verifies the icon PNGs this app ships against the invariants that matter.

Run:  python3 scripts/icons.py

WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT. v4.6.3 shipped a generator
here, because the supplied assets had not reached the session and the mark had
to come from somewhere. v4.7.1 replaced its output with the real files, which
are AUTHORED OUTSIDE THIS REPO. A generator that cannot reproduce what ships
is worse than no generator - it invites someone to run it and quietly replace
hand-made assets with an approximation - so it is gone, and what is left is
the half that was actually earning its place: measurement.

It checks what prose cannot: that every shipped file is flat RGB at the size
it claims, that the two 512s really are the same bytes, and that the W clears
the maskable safe circle - measured pixel by pixel on the shipped file rather
than argued from a bounding box. test/structure.test.js covers the format and
the byte-identity in plain node with no dependency; the safe-circle geometry
needs a decoder, which is why it lives here.

THE FLATTEN IS THE POINT, not a detail. iOS composites any transparency onto
black, so an alpha channel buys nothing and risks a black wedge showing
through its own superellipse mask. "A future regeneration forgets the flatten"
is exactly the kind of change that looks right on a desktop and is wrong on a
phone, so it is asserted on the committed bytes in two places.
"""

import sys, os, math, hashlib
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIGN = (0xFF, 0xC7, 0x2C)          # --sign, the W
SAFE_R = 0.40                      # centre-80% circle: the maskable safe zone

# name -> expected square size
TARGETS = [('apple-touch-icon.png', 180), ('icon-192.png', 192),
           ('icon-512.png', 512), ('icon-maskable-512.png', 512),
           ('favicon-32.png', 32), ('favicon-16.png', 16)]


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:12]


def glyph_geometry(path):
    """Where the yellow actually is. Returns the W's bounding box as fractions
    of the icon, plus the furthest yellow pixel's radius from centre - which is
    the number that decides whether a circular crop clips the mark. The
    bounding-box diagonal OVERSTATES the risk, because the box corners are
    empty; both are reported so the difference stays visible."""
    im = Image.open(path).convert('RGB')
    S = im.size[0]
    px = im.load()
    xs, ys, maxr = [], [], 0.0
    c = (S - 1) / 2
    for y in range(S):
        for x in range(S):
            p = px[x, y]
            if all(abs(p[i] - SIGN[i]) < 70 for i in range(3)):
                xs.append(x); ys.append(y)
                maxr = max(maxr, math.hypot(x - c, y - c) / S)
    if not xs:
        return None
    w = (max(xs) - min(xs) + 1) / S
    h = (max(ys) - min(ys) + 1) / S
    return w, h, math.hypot(w, h), maxr


def main():
    bad = []
    for name, size in TARGETS:
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            bad.append(name + ' is missing'); continue
        im = Image.open(path)
        ok_mode = im.mode == 'RGB'
        ok_size = im.size == (size, size)
        print('  %-24s %-9s %-5s %s' % (name, '%dx%d' % im.size, im.mode, sha(path)))
        if not ok_mode:
            bad.append('%s is %s, not flat RGB - iOS composites alpha onto black' % (name, im.mode))
        if not ok_size:
            bad.append('%s is %dx%d, expected %d' % (name, im.size[0], im.size[1], size))

    a = os.path.join(ROOT, 'icon-512.png')
    b = os.path.join(ROOT, 'icon-maskable-512.png')
    if os.path.exists(a) and os.path.exists(b):
        same = open(a, 'rb').read() == open(b, 'rb').read()
        print('\n512 pair byte-identical: %s' % same)
        # Not a failure if they ever diverge - a future mark might genuinely
        # need a shrunk maskable - but it contradicts the head comment, so say
        # so loudly rather than letting the two drift apart in silence.
        if not same:
            bad.append('the two 512s differ; the head comment says they are identical')

    g = glyph_geometry(b if os.path.exists(b) else a)
    if g:
        w, h, diag, maxr = g
        print('glyph: width %.3f  height %.3f  bbox diagonal %.3f' % (w, h, diag))
        print('furthest W pixel: r=%.4f  against the safe circle %.2f -> %s'
              % (maxr, SAFE_R, 'clears it' if maxr <= SAFE_R else 'CLIPPED'))
        if maxr > SAFE_R:
            bad.append('a circular maskable crop would clip the W (r=%.4f)' % maxr)

    if bad:
        print('\nFAIL')
        for m in bad:
            print('  ' + m)
        sys.exit(1)
    print('\nall icon invariants hold')


if __name__ == '__main__':
    main()
