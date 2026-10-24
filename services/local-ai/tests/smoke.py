"""End-to-end check of the local AI services through the MCP server. Run: .venv/bin/python tests/smoke.py
Expects ./dev.sh start (mock mode) to be running on the default ports."""
import asyncio, base64, io, json, os, struct, subprocess, sys, time

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from PIL import Image

URL = os.getenv("LOCAL_AI_MCP_URL", "http://127.0.0.1:8765/mcp")


def payload(res):
    assert not res.isError, res.content
    return json.loads(res.content[0].text)


def png_text(b: bytes) -> dict:
    img = Image.open(io.BytesIO(b)); img.load()
    return dict(img.text)


def photo_jpeg() -> str:
    img = Image.new("RGB", (320, 240), (200, 120, 90))
    for x in range(100, 220):
        for y in range(60, 180):
            img.putpixel((x, y), (240, 200, 170))
    buf = io.BytesIO(); img.save(buf, "JPEG"); return base64.b64encode(buf.getvalue()).decode()


async def main():
    async with streamablehttp_client(URL) as (r, w, _):
        async with ClientSession(r, w) as s:
            await s.initialize()
            tools = {t.name for t in (await s.list_tools()).tools}
            assert {"health", "list_voices", "speak", "transcribe", "chat", "stylize_photo", "generate_image", "generate_video"} <= tools, tools

            h = payload(await s.call_tool("health", {}))
            assert h["ok"] and set(h["backends"]) == {"tts", "stt", "image", "video"}, h

            voices = payload(await s.call_tool("list_voices", {}))["voices"]
            assert len(voices) >= 4, voices

            sp = payload(await s.call_tool("speak", {"text": "Good evening, everyone.", "voice": voices[1]}))
            assert sp["mime"].startswith("audio/") and base64.b64decode(sp["data_b64"])[:4] == b"RIFF", sp["mime"]

            tr = payload(await s.call_tool("transcribe", {"audio_b64": sp["data_b64"], "mime": "audio/wav"}))
            assert tr["text"], tr

            ch = payload(await s.call_tool("chat", {"user": "Say hello", "system": "You are a guest"}))
            assert ch["text"], ch

            gi = payload(await s.call_tool("generate_image", {"prompt": "a haunted ski lodge at night", "width": 384, "height": 256}))
            meta = png_text(base64.b64decode(gi["data_b64"]))
            assert meta["prompt"] == "a haunted ski lodge at night" and meta["had_reference"] == "0", meta

            st = payload(await s.call_tool("stylize_photo", {
                "image_b64": photo_jpeg(), "prompt": "cartoon portrait of Carol Greenthumb, garden club president, 1980s lodge",
                "negative_prompt": "gore", "strength": 0.55, "width": 384, "height": 384}))
            m2 = png_text(base64.b64decode(st["data_b64"]))
            assert m2["had_reference"] == "1" and "Carol Greenthumb" in m2["prompt"] and m2["strength"] == "0.55", m2

            frames = [gi["data_b64"], st["data_b64"], gi["data_b64"]]
            vd = payload(await s.call_tool("generate_video", {"frames_b64": frames, "seconds": 3, "narration_b64": sp["data_b64"]}))
            raw = base64.b64decode(vd["data_b64"])
            assert vd["mime"] == "video/mp4" and raw[4:8] == b"ftyp" and len(raw) > 2000, (vd["mime"], len(raw))

            bad = await s.call_tool("speak", {"text": ""})
            assert bad.isError, "empty text must be rejected"

    # bearer token: a second MCP server with a token must refuse anonymous callers and accept the right one
    env = {**os.environ, "LOCAL_AI_TOKEN": "s3cret", "PORT": "8791"}
    p = subprocess.Popen([sys.executable, "-m", "uvicorn", "--app-dir", "mcp", "server:app", "--host", "127.0.0.1", "--port", "8791"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try:
                if httpx.get("http://127.0.0.1:8791/healthz", timeout=1).status_code == 200: break
            except Exception: time.sleep(0.25)
        init = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}}}
        hdr = {"accept": "application/json, text/event-stream", "content-type": "application/json"}
        assert httpx.post("http://127.0.0.1:8791/mcp", json=init, headers=hdr).status_code == 401, "token required"
        assert httpx.post("http://127.0.0.1:8791/mcp", json=init, headers={**hdr, "authorization": "Bearer wrong"}).status_code == 401
        assert httpx.post("http://127.0.0.1:8791/mcp", json=init, headers={**hdr, "authorization": "Bearer s3cret"}).status_code == 200
    finally:
        p.terminate()
    print("OK: local AI services via MCP (health, voices, speak, transcribe, chat, text-to-image, photo-to-image, video, auth)")


asyncio.run(main())
