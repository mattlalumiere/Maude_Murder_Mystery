"""Local speech-to-text service (faster-whisper). AI_MODE=mock returns a fixed transcript so the pipeline runs without models."""
import os, tempfile

from fastapi import FastAPI, HTTPException, Request

MODE = os.getenv("AI_MODE", "mock")
MODEL = os.getenv("WHISPER_MODEL", "base.en")
MAX_BYTES = int(os.getenv("STT_MAX_BYTES", str(4 * 1024 * 1024)))
app = FastAPI(title="maude-local-stt")
_model = {}


@app.get("/healthz")
def healthz():
    return {"ok": True, "mode": MODE, "model": MODEL if MODE != "mock" else "mock"}


@app.post("/transcribe")
async def transcribe(request: Request):
    audio = await request.body()
    if not audio:
        raise HTTPException(status_code=400, detail="no audio")
    if len(audio) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="audio too large")
    if MODE == "mock":
        return {"text": os.getenv("STT_MOCK_TEXT", "where were you when it happened"), "language": "en", "bytes": len(audio)}
    from faster_whisper import WhisperModel  # only in models mode

    if "m" not in _model:
        _model["m"] = WhisperModel(MODEL, device="cpu", compute_type="int8")
    with tempfile.NamedTemporaryFile(suffix=".audio") as f:
        f.write(audio); f.flush()
        segments, info = _model["m"].transcribe(f.name, beam_size=1, vad_filter=True)
        text = " ".join(s.text.strip() for s in segments).strip()
    return {"text": text, "language": info.language}
