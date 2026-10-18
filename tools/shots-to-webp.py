#!/usr/bin/env python3
"""Convert the PNG screenshots made by tools/make-screenshots.js to WebP.

Usage: python3 tools/shots-to-webp.py <png-dir> [out-dir]
Writes docs/images/*.webp (default) and copies them to site/assets/screens/.
"""
import sys, shutil
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1])
root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[2]) if len(sys.argv) > 2 else root / 'docs' / 'images'
site = root / 'site' / 'assets' / 'screens'
out.mkdir(parents=True, exist_ok=True)
site.mkdir(parents=True, exist_ok=True)
for p in sorted(src.glob('*.png')):
    if p.stem.startswith('m') and p.stem[1:].isdigit():
        continue  # montage helpers
    im = Image.open(p).convert('RGB')
    if im.width > 1600:
        im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    dest = out / (p.stem + '.webp')
    im.save(dest, 'WEBP', quality=82, method=6)
    shutil.copy(dest, site / dest.name)
    print(dest.name, im.size, dest.stat().st_size // 1024, 'KB')
