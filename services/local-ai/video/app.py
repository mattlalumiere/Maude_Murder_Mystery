"""Local video service: turns a few still frames (and optional narration audio) into a short MP4 with slow zoom and fades.

This is real video, not a generative model: it needs only ffmpeg. A GPU host can swap in a generative model
(for example AnimateDiff or Stable Video Diffusion) behind the same /slideshow endpoint.
"""
import base64, os, subprocess, tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

app = FastAPI(title="maude-local-video")
FFMPEG = os.getenv("FFMPEG", "ffmpeg")


class Req(BaseModel):
    frames_b64: List[str] = Field(min_length=1, max_length=10)
    seconds: float = Field(default=6.0, ge=2.0, le=30.0)
    fps: int = Field(default=24, ge=8, le=30)
    width: int = Field(default=1024, ge=256, le=1920)
    height: int = Field(default=576, ge=144, le=1080)
    audio_b64: Optional[str] = None


@app.get("/healthz")
def healthz():
    try:
        subprocess.run([FFMPEG, "-version"], capture_output=True, check=True, timeout=10)
        return {"ok": True, "ffmpeg": True}
    except Exception:  # noqa: BLE001
        return {"ok": False, "ffmpeg": False}


@app.post("/slideshow")
def slideshow(r: Req):
    per = r.seconds / len(r.frames_b64)
    with tempfile.TemporaryDirectory() as d:
        dp = Path(d)
        for i, b in enumerate(r.frames_b64):
            try:
                (dp / f"f{i:03d}.png").write_bytes(base64.b64decode(b))
            except Exception as e:  # noqa: BLE001
                raise HTTPException(status_code=400, detail=f"bad frame {i}: {e}") from e
        out = dp / "out.mp4"
        frames_per = max(1, int(per * r.fps))
        vf = (f"scale={r.width * 2}:{r.height * 2}:force_original_aspect_ratio=increase,crop={r.width * 2}:{r.height * 2},"
              f"zoompan=z='min(zoom+0.0012,1.25)':d={frames_per}:s={r.width}x{r.height}:fps={r.fps},"
              f"fade=t=in:st=0:d=0.3,fade=t=out:st={max(0.1, r.seconds - 0.3)}:d=0.3,format=yuv420p")
        cmd = [FFMPEG, "-y", "-loglevel", "error", "-framerate", f"1/{per}", "-i", str(dp / "f%03d.png")]
        if r.audio_b64:
            (dp / "a.wav").write_bytes(base64.b64decode(r.audio_b64))
            cmd += ["-i", str(dp / "a.wav")]
        cmd += ["-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-movflags", "+faststart", "-t", str(r.seconds)]
        if r.audio_b64:
            cmd += ["-c:a", "aac", "-shortest"]
        cmd += [str(out)]
        p = subprocess.run(cmd, capture_output=True, timeout=120)
        if p.returncode != 0 or not out.exists():
            raise HTTPException(status_code=500, detail=p.stderr.decode()[-300:])
        return Response(content=out.read_bytes(), media_type="video/mp4")
