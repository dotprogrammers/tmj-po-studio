#!/usr/bin/env zsh
# Generate narration MP3 per scene with edge-tts (neural voice).
set -e
ROOT="/Users/sayeedsmacmini/.openclaw-autoclaw/agents/cuteadmoa-56/workspace/tmj-po-studio/video"
VO="${VOICE:-en-US-AndrewMultilingualNeural}"
mkdir -p "$ROOT/audio"

/opt/homebrew/bin/python3 - << 'PYEOF'
import json, asyncio, subprocess, pathlib, sys

root = pathlib.Path("/Users/sayeedsmacmini/.openclaw-autoclaw/agents/cuteadmoa-56/workspace/tmj-po-studio/video")
screenplay = json.loads((root / "screenplay.json").read_text())
voice = sys.argv[1] if len(sys.argv) > 1 else "en-US-AndrewMultilingualNeural"

async def synth(text, out):
    proc = await asyncio.create_subprocess_exec(
        "edge-tts", "--text", text, "--voice", voice,
        "--write-media", out, "--rate=+4%",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    _, err = await proc.communicate()
    if proc.returncode != 0:
        print("FAIL", out, err.decode()[:200]); return False
    return True

async def main():
    for sc in screenplay["scenes"]:
        out = root / "audio" / f"scene{sc['id']:02d}.mp3"
        ok = await synth(sc["narration"], str(out))
        print(("OK  " if ok else "FAIL"), out.name)

asyncio.run(main())
PYEOF
