"""Local text-to-speech service (Piper). AI_MODE=mock returns short tones so the pipeline runs without voice models."""
import io, math, os, struct, subprocess, tempfile, wave
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

MODE = os.getenv("AI_MODE", "mock")
VOICES = [v.strip() for v in os.getenv(
    "PIPER_VOICES",
    "en_US-lessac-medium,en_US-amy-medium,en_GB-alan-medium,en_US-ryan-medium,en_GB-jenny_dioco-medium,en_US-joe-medium,en_US-kristin-medium,en_GB-northern_english_male-medium",
).split(",") if v.strip()]
DATA = Path(os.getenv("PIPER_DATA", "/models/piper"))
app = FastAPI(title="maude-local-tts")


class Req(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    voice: str = ""


def _mock_wav(text: str, voice: str) -> bytes:
    rate = 16000
    n = int(rate * min(2.0, 0.25 + 0.045 * len(text)))
    freq = 180 + (VOICES.index(voice) if voice in VOICES else 0) * 35
    frames = bytearray()
    for i in range(n):
        env = min(1.0, i / 800, (n - i) / 800)
        frames += struct.pack("<h", int(math.sin(2 * math.pi * freq * i / rate) * 3000 * env))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(bytes(frames))
    return buf.getvalue()


_loaded = {}


def _real_wav(text: str, voice: str) -> bytes:
    from piper import PiperVoice  # only in models mode

    DATA.mkdir(parents=True, exist_ok=True)
    onnx = DATA / f"{voice}.onnx"
    if not onnx.exists():  # first use: fetch the voice (needs network once)
        subprocess.run(["python", "-m", "piper.download_voices", voice, "--data-dir", str(DATA)], check=True, timeout=300)
    if voice not in _loaded:
        _loaded[voice] = PiperVoice.load(str(onnx))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        v = _loaded[voice]
        (v.synthesize_wav if hasattr(v, "synthesize_wav") else v.synthesize)(text, w)
    return buf.getvalue()


@app.get("/healthz")
def healthz():
    return {"ok": True, "mode": MODE}


@app.get("/voices")
def voices():
    return {"voices": VOICES}


@app.post("/speak")
def speak(r: Req):
    voice = r.voice or VOICES[0]
    if voice not in VOICES:
        raise HTTPException(status_code=400, detail="unknown voice")
    data = _mock_wav(r.text, voice) if MODE == "mock" else _real_wav(r.text, voice)
    return Response(content=data, media_type="audio/wav")
