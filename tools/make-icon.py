#!/usr/bin/env python3
"""Generate the TMJ PO Studio logo + full icon set.
Design: gold 'TM' monogram on deep-navy rounded square with a diamond facet
(jewellery) accent — matches the app's dark+gold design language."""
import subprocess, os, pathlib

ROOT = pathlib.Path('/Users/sayeedsmacmini/.openclaw-autoclaw/agents/cuteadmoa-56/workspace/tmj-po-studio')
BUILD = ROOT / 'build'
ICONSET = BUILD / 'tmj.iconset'
BUILD.mkdir(exist_ok=True)
ICONSET.mkdir(exist_ok=True)

SVG = '''<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#16283f"/>
      <stop offset="1" stop-color="#0a1524"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eed671"/>
      <stop offset="0.55" stop-color="#d4af37"/>
      <stop offset="1" stop-color="#a8871e"/>
    </linearGradient>
    <linearGradient id="gold2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f3e08a"/>
      <stop offset="1" stop-color="#c9a227"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.36" r="0.75">
      <stop offset="0" stop-color="#2a4a73" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#16283f" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- rounded square background (macOS style margin handled by iconset padding) -->
  <rect x="64" y="64" width="896" height="896" rx="206" fill="url(#bg)"/>
  <rect x="64" y="64" width="896" height="896" rx="206" fill="url(#glow)"/>
  <rect x="70" y="70" width="884" height="884" rx="200" fill="none" stroke="#3d5corn" stroke-width="0"/>

  <!-- diamond facet top accent -->
  <g transform="translate(512 236)">
    <path d="M -110 0 L -55 -52 L 55 -52 L 110 0 L 0 96 Z" fill="url(#gold2)" opacity="0.95"/>
    <path d="M -110 0 L 110 0" stroke="#0a1524" stroke-opacity="0.35" stroke-width="5"/>
    <path d="M -55 -52 L -36 0 M 55 -52 L 36 0 M 0 96 L -36 0 M 0 96 L 36 0" stroke="#0a1524" stroke-opacity="0.3" stroke-width="4" fill="none"/>
  </g>

  <!-- TM monogram -->
  <g fill="url(#gold)">
    <!-- T -->
    <path d="M 236 420 h 260 v 96 h -82 v 300 h -96 v -300 h -82 z"/>
    <!-- M -->
    <path d="M 548 420 h 100 l 68 168 68 -168 h 100 v 396 h -94 v -232 l -74 172 -74 -172 v 232 h -94 z"/>
  </g>

  <!-- PO ribbon -->
  <g transform="translate(512 872)">
    <rect x="-228" y="-44" width="456" height="88" rx="44" fill="url(#gold2)"/>
    <text x="0" y="24" font-family="Helvetica, Arial, sans-serif" font-size="64" font-weight="700"
          fill="#0a1524" text-anchor="middle" letter-spacing="14">PO</text>
  </g>

  <!-- inner hairline -->
  <rect x="88" y="88" width="848" height="848" rx="188" fill="none" stroke="#c9a227" stroke-opacity="0.35" stroke-width="3"/>
</svg>'''

(ROOT / 'build' / 'icon.svg').write_text(SVG)

# Render master 1024 PNG
subprocess.run(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',
    '--screenshot=' + str(BUILD / 'icon_1024.png'),
    '--window-size=1024,1024', '--default-background-color=00000000',
    'file://' + str(BUILD / 'icon.svg')], check=True, capture_output=True)

# macOS iconset sizes
sizes = [(16,'icon_16x16'),(32,'icon_16x16@2x'),(32,'icon_32x32'),(64,'icon_32x32@2x'),
         (128,'icon_128x128'),(256,'icon_128x128@2x'),(256,'icon_256x256'),
         (512,'icon_256x256@2x'),(512,'icon_512x512'),(1024,'icon_512x512@2x')]
for px, name in sizes:
    subprocess.run(['sips','-z',str(px),str(px), str(BUILD/'icon_1024.png'),
                    '--out', str(ICONSET/f'{name}.png')], check=True, capture_output=True)
subprocess.run(['iconutil','-c','icns', str(ICONSET), '-o', str(BUILD/'icon.icns')], check=True)

# Windows ico (256 multi-size via ffmpeg)
subprocess.run(['ffmpeg','-y','-i', str(BUILD/'icon_1024.png'),
    '-vf','scale=256:256', str(BUILD/'icon.ico')], check=True, capture_output=True)

# generic PNGs for README/store
for px in (32, 128, 256, 512):
    subprocess.run(['sips','-z',str(px),str(px), str(BUILD/'icon_1024.png'),
                    '--out', str(BUILD/f'icon_{px}.png')], check=True, capture_output=True)

print('icon files:')
for f in sorted(BUILD.iterdir()):
    print(' ', f.name, f'{f.stat().st_size//1024}KB')
