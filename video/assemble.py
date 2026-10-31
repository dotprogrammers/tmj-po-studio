#!/usr/bin/env python3
"""Assemble the TMJ PO Studio walkthrough video:
slides (PNG) + neural narration (MP3) -> per-scene MP4 -> concat -> subtitles burned in."""
import json, pathlib, subprocess, os

ROOT = pathlib.Path('/Users/sayeedsmacmini/.openclaw-autoclaw/agents/cuteadmoa-56/workspace/tmj-po-studio')
V = ROOT / 'video'
PNG = V / 'slides_png'
AUD = V / 'audio'
SEGS = V / 'segments'
OUT = ROOT / 'docs'
SEGS.mkdir(exist_ok=True)
OUT.mkdir(exist_ok=True)

sp = json.loads((V / 'screenplay.json').read_text())
FPS = 30

def dur(p):
    r = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration',
                        '-of','default=noprint_wrappers=1:nokey=1', str(p)],
                       capture_output=True, text=True)
    return float(r.stdout.strip())

def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        print('FFMPEG FAIL:', ' '.join(map(str,args))[:220])
        print(r.stderr[-600:])
        raise SystemExit(1)

def srt_time(t):
    h = int(t//3600); m = int(t%3600//60); s = int(t%60); ms = int(round((t-int(t))*1000))
    return f'{h:02}:{m:02}:{s:02},{ms:03}'

scenes = sp['scenes']
timeline = []   # (start, end, scene)
t = 0.0
segments = []
for sc in scenes:
    a = AUD / f"scene{sc['id']:02d}.mp3"
    d = dur(a) + 1.1   # 1.1s breathing room
    seg = SEGS / f"scene{sc['id']:02d}.mp4"
    run(['ffmpeg','-y','-loop','1','-i', str(PNG / f"slide{sc['id']:02d}.png"),
         '-i', str(a),
         '-c:v','libx264','-tune','stillimage','-preset','medium','-crf','20',
         '-pix_fmt','yuv420p','-r',str(FPS),
         '-c:a','aac','-b:a','192k','-ar','48000',
         '-shortest','-vf','format=yuv420p',
         str(seg)])
    segments.append(seg)
    timeline.append((t, t + d, sc))
    t += d
    print(f"scene {sc['id']:02d}: {d:.1f}s  cumulative {t:.1f}s")

# concat
concat_list = V / 'concat.txt'
concat_list.write_text(''.join(f"file '{s}'\n" for s in segments))
merged = V / 'merged.mp4'
run(['ffmpeg','-y','-f','concat','-safe','0','-i', str(concat_list), '-c','copy', str(merged)])

# SRT subtitles
srt_lines = []
for i,(a,b,sc) in enumerate(timeline, 1):
    srt_lines.append(f"{i}\n{srt_time(a+0.35)} --> {srt_time(b-0.45)}\n{sc['subtitle']}\n")
srt = OUT / 'TMJ-PO-Studio-walkthrough.srt'
srt.write_text('\n'.join(srt_lines))
print('subtitles:', srt)

# final: burn subtitles, premium styling
final = OUT / 'TMJ-PO-Studio-Walkthrough.mp4'
run(['ffmpeg','-y','-i', str(merged),
     '-vf', ("subtitles=" + str(srt) +
             ":force_style='FontName=Helvetica Neue,FontSize=13,PrimaryColour=&H00FFFFFF,"
             "OutlineColour=&HAA000000,BorderStyle=3,Outline=2,Shadow=1,MarginV=42'"),
     '-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p',
     '-c:a','copy', str(final)])

print('\nFINAL:', final, f'{final.stat().st_size/1024/1024:.1f} MB, {t:.0f}s')
