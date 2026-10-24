"""MCP server for the local AI services. The web app is the MCP client; each tool forwards to one backend container.

Tools: health, list_voices, speak, transcribe, chat, stylize_photo, generate_image, generate_video.
Transport: streamable HTTP at /mcp (stateless, JSON responses). Optional bearer token via LOCAL_AI_TOKEN.
Keep this port off the public internet: it is meant for the host machine or a private network.
"""
import base64, hmac, os
from typing import Optional

import httpx
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse
from starlette.middleware.base import BaseHTTPMiddleware

TTS = os.getenv("TTS_URL", "http://127.0.0.1:8766")
STT = os.getenv("STT_URL", "http://127.0.0.1:8767")
IMAGE = os.getenv("IMAGE_URL", "http://127.0.0.1:8768")
VIDEO = os.getenv("VIDEO_URL", "http://127.0.0.1:8769")
LLM_BASE = os.getenv("LLM_BASE_URL", "").rstrip("/")  # any OpenAI-compatible server, e.g. mlx_lm on the host
LLM_MODEL = os.getenv("LLM_MODEL", "")
LLM_KEY = os.getenv("LLM_API_KEY", "")
CHAT_MODE = os.getenv("CHAT_MODE", "mock" if not LLM_BASE else "llm")
TOKEN = os.getenv("LOCAL_AI_TOKEN", "")
MAX_B64 = 24 * 1024 * 1024

mcp = FastMCP(
    "maude-local-ai",
    instructions="Local voice, conversation, image and video generation for Murder Mystery Night.",
    host="0.0.0.0", port=int(os.getenv("PORT", "8765")), stateless_http=True, json_response=True,
    max_request_body_size=MAX_B64 + 1_000_000,
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),  # private network; the token guards access
)


def _client(timeout: float) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout)


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode()


def _check_b64(s: str, what: str) -> None:
    if len(s) > MAX_B64:
        raise ValueError(f"{what} too large")


@mcp.custom_route("/healthz", methods=["GET"])
async def healthz(_: Request):
    return PlainTextResponse("ok")


@mcp.tool()
async def health() -> dict:
    """Reports which backends answer. Never raises."""
    out: dict = {"chat": CHAT_MODE, "backends": {}}
    async with _client(4) as c:
        for name, url in (("tts", TTS), ("stt", STT), ("image", IMAGE), ("video", VIDEO)):
            try:
                r = await c.get(f"{url}/healthz")
                out["backends"][name] = {"ok": r.status_code == 200, **(r.json() if r.status_code == 200 else {})}
            except Exception as e:  # noqa: BLE001
                out["backends"][name] = {"ok": False, "error": type(e).__name__}
    out["ok"] = all(v.get("ok") for v in out["backends"].values())
    return out


@mcp.tool()
async def list_voices() -> dict:
    """Voice ids the speech service can use."""
    async with _client(10) as c:
        r = await c.get(f"{TTS}/voices")
        r.raise_for_status()
        return r.json()


@mcp.tool()
async def speak(text: str, voice: str = "") -> dict:
    """Turn text into speech. Returns {mime, data_b64}."""
    if not text.strip() or len(text) > 600:
        raise ValueError("text must be 1 to 600 characters")
    async with _client(60) as c:
        r = await c.post(f"{TTS}/speak", json={"text": text, "voice": voice})
        r.raise_for_status()
        return {"mime": r.headers.get("content-type", "audio/wav"), "data_b64": _b64(r.content)}


@mcp.tool()
async def transcribe(audio_b64: str, mime: str = "audio/webm") -> dict:
    """Turn recorded speech into text. Returns {text}."""
    _check_b64(audio_b64, "audio")
    async with _client(120) as c:
        r = await c.post(f"{STT}/transcribe", content=base64.b64decode(audio_b64), headers={"content-type": mime})
        r.raise_for_status()
        return r.json()


@mcp.tool()
async def chat(user: str, system: str = "", max_tokens: int = 200, temperature: float = 0.8) -> dict:
    """One chat completion from the local language model. Returns {text, model}."""
    if len(user) > 12000 or len(system) > 12000:
        raise ValueError("prompt too long")
    max_tokens = max(16, min(int(max_tokens), 4096))
    if CHAT_MODE == "mock":
        return {"text": f"(local mock) {user.strip().splitlines()[-1][:160]}", "model": "mock"}
    headers = {"Authorization": f"Bearer {LLM_KEY}"} if LLM_KEY else {}
    msgs = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": user}]
    async with _client(120) as c:
        r = await c.post(f"{LLM_BASE}/chat/completions", headers=headers,
                         json={"model": LLM_MODEL, "messages": msgs, "max_tokens": max_tokens, "temperature": temperature})
        r.raise_for_status()
        j = r.json()
        return {"text": j["choices"][0]["message"]["content"], "model": j.get("model", LLM_MODEL)}


@mcp.tool()
async def stylize_photo(image_b64: str, prompt: str, negative_prompt: str = "", strength: float = 0.6,
                        steps: int = 4, width: int = 512, height: int = 512, seed: Optional[int] = None) -> dict:
    """Redraw a reference photo in the style and scene described by the prompt (diffusion img2img). Returns {mime, data_b64}."""
    _check_b64(image_b64, "image")
    return await _image({"prompt": prompt, "negative_prompt": negative_prompt, "image_b64": image_b64, "strength": strength,
                         "steps": steps, "width": width, "height": height, "seed": seed})


@mcp.tool()
async def generate_image(prompt: str, negative_prompt: str = "", steps: int = 4, width: int = 512, height: int = 512,
                         seed: Optional[int] = None) -> dict:
    """Draw an image from text. Returns {mime, data_b64}."""
    return await _image({"prompt": prompt, "negative_prompt": negative_prompt, "steps": steps, "width": width, "height": height, "seed": seed})


async def _image(body: dict) -> dict:
    body = {k: v for k, v in body.items() if v is not None}
    async with _client(600) as c:
        r = await c.post(f"{IMAGE}/generate", json=body)
        r.raise_for_status()
        return r.json()


@mcp.tool()
async def generate_video(frames_b64: list[str], seconds: float = 6.0, narration_b64: Optional[str] = None) -> dict:
    """Make a short MP4 from still frames (slow zoom and fades), with optional narration audio. Returns {mime, data_b64}."""
    if not 1 <= len(frames_b64) <= 8:
        raise ValueError("1 to 8 frames")
    for f in frames_b64:
        _check_b64(f, "frame")
    body: dict = {"frames_b64": frames_b64, "seconds": seconds}
    if narration_b64:
        body["audio_b64"] = narration_b64
    async with _client(180) as c:
        r = await c.post(f"{VIDEO}/slideshow", json=body)
        r.raise_for_status()
        return {"mime": "video/mp4", "data_b64": _b64(r.content)}


class TokenMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if TOKEN and request.url.path != "/healthz":
            sent = request.headers.get("authorization", "")
            if not hmac.compare_digest(sent, f"Bearer {TOKEN}"):
                return JSONResponse({"error": "unauthorized"}, status_code=401)
        return await call_next(request)


app = mcp.streamable_http_app()
app.add_middleware(TokenMiddleware)
