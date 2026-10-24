"""Warm up and verify the REAL models through MCP (downloads voices and models on first use).
Run with the services started in real mode: AI_MODE=models ./dev.sh start ; .venv/bin/python tests/warm.py
Writes samples to OUT (default /tmp/mm-real) so you can look and listen."""
import asyncio, base64, io, json, os, time
from datetime import timedelta

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from PIL import Image, ImageDraw

URL = os.getenv("LOCAL_AI_MCP_URL", "http://127.0.0.1:8765/mcp")
OUT = os.getenv("OUT", "/tmp/mm-real")
os.makedirs(OUT, exist_ok=True)


def payload(res):
    assert not res.isError, res.content[0].text if res.content else res
    return json.loads(res.content[0].text)


def timed(label, t0):
    print(f"  {label}: {time.time() - t0:.1f}s", flush=True)


def face_jpeg() -> str:
    img = Image.new("RGB", (512, 512), (120, 160, 190))
    d = ImageDraw.Draw(img)
    d.ellipse((150, 90, 360, 340), fill=(235, 190, 160))          # face
    d.ellipse((130, 60, 380, 210), fill=(70, 45, 30))             # hair
    d.ellipse((150, 120, 360, 340), fill=(235, 190, 160))
    d.ellipse((200, 190, 235, 215), fill=(255, 255, 255)); d.ellipse((275, 190, 310, 215), fill=(255, 255, 255))
    d.ellipse((212, 197, 226, 211), fill=(40, 30, 20)); d.ellipse((287, 197, 301, 211), fill=(40, 30, 20))
    d.arc((205, 235, 305, 300), 20, 160, fill=(150, 60, 60), width=5)
    d.rectangle((200, 330, 310, 512), fill=(60, 110, 70))          # green apron / shirt
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=90)
    open(f"{OUT}/input-photo.jpg", "wb").write(buf.getvalue())
    return base64.b64encode(buf.getvalue()).decode()


async def main():
    async with streamablehttp_client(URL, timeout=900, sse_read_timeout=900) as (r, w, _):
        async with ClientSession(r, w, read_timeout_seconds=timedelta(seconds=900)) as s:
            await s.initialize()
            h = payload(await s.call_tool("health", {}))
            print("health:", json.dumps(h["backends"]), "chat:", h["chat"], flush=True)
            assert h["ok"]

            voices = payload(await s.call_tool("list_voices", {}))["voices"]
            print("voices:", len(voices), flush=True)
            first_audio = None
            for v in voices:
                t0 = time.time()
                sp = payload(await s.call_tool("speak", {"text": "Good evening, everyone. I was in the garden all night.", "voice": v}))
                raw = base64.b64decode(sp["data_b64"])
                assert raw[:4] == b"RIFF" and len(raw) > 20000, (v, len(raw))
                open(f"{OUT}/voice-{v}.wav", "wb").write(raw)
                timed(f"speak {v} ({len(raw) // 1024} KB)", t0)
                first_audio = first_audio or sp["data_b64"]

            t0 = time.time()
            tr = payload(await s.call_tool("transcribe", {"audio_b64": first_audio, "mime": "audio/wav"}))
            timed(f"transcribe -> {tr['text']!r}", t0)
            assert "garden" in tr["text"].lower(), tr

            t0 = time.time()
            ch = payload(await s.call_tool("chat", {"system": "You are Carol Greenthumb, a garden club president at a family murder mystery party. One short, family-friendly sentence.", "user": "Where were you when it happened?", "max_tokens": 60}))
            timed(f"chat -> {ch['text']!r}", t0)

            t0 = time.time()
            gi = payload(await s.call_tool("generate_image", {"prompt": "cartoon storybook illustration of a grand birthday party in a stormy manor, warm lamplight, no text", "width": 512, "height": 512, "steps": 2}))
            open(f"{OUT}/text2img.png", "wb").write(base64.b64decode(gi["data_b64"]))
            timed("generate_image (includes model load on first call)", t0)

            t0 = time.time()
            st = payload(await s.call_tool("stylize_photo", {
                "image_b64": face_jpeg(),
                "prompt": "Cartoon storybook portrait of Carol Greenthumb, president of the garden club, wearing a green apron and gardening gloves, in a stormy manor at night, warm lamplight, friendly expression. Keep the hair and face shape of the reference photo. Family-friendly illustration.",
                "negative_prompt": "text, watermark, gore, blood, scary, deformed hands", "strength": 0.6, "steps": 4, "width": 512, "height": 512, "seed": 7}))
            open(f"{OUT}/photo2char.png", "wb").write(base64.b64decode(st["data_b64"]))
            timed("stylize_photo", t0)

            t0 = time.time()
            vd = payload(await s.call_tool("generate_video", {"frames_b64": [gi["data_b64"], st["data_b64"], gi["data_b64"]], "seconds": 6, "narration_b64": first_audio}))
            open(f"{OUT}/clip.mp4", "wb").write(base64.b64decode(vd["data_b64"]))
            timed("generate_video", t0)
    print(f"OK: real models verified. Samples in {OUT}")


asyncio.run(main())
