"""Local image service: text-to-image and photo-to-image (img2img) with a diffusion model.

AI_MODE=mock   draws a deterministic stylised placeholder (no model, tiny image). The prompt, negative prompt, strength and whether
               a reference photo was used are written into the PNG text chunks so tests can prove what reached the model.
AI_MODE=models runs a diffusers pipeline (default stabilityai/sd-turbo). Container CPU is slow; on Apple Silicon run this
               service natively (see README) to use the GPU through MPS.
"""
import base64, hashlib, io, os, textwrap
from typing import Optional

from fastapi import FastAPI, HTTPException
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps
from PIL.PngImagePlugin import PngInfo
from pydantic import BaseModel, Field

MODE = os.getenv("AI_MODE", "mock")
MODEL_ID = os.getenv("IMAGE_MODEL", "stabilityai/sd-turbo")
MAX_SIDE = int(os.getenv("IMAGE_MAX_SIDE", "768"))
# Turbo models run without guidance, so a low strength just filters the photo. Redraw it instead.
MIN_STRENGTH = float(os.getenv("IMAGE_MIN_STRENGTH", "0.78"))
TOON_DEFAULT = os.getenv("IMAGE_TOON", "1") != "0"
app = FastAPI(title="maude-local-image")


class Req(BaseModel):
    prompt: str = Field(min_length=1, max_length=1500)
    negative_prompt: str = Field(default="", max_length=800)
    image_b64: Optional[str] = None  # reference photo (JPEG or PNG) for img2img
    strength: float = Field(default=0.6, ge=0.05, le=1.0)  # 1.0 ignores the photo, lower keeps more of it
    steps: int = Field(default=4, ge=1, le=30)
    width: int = Field(default=512, ge=128, le=MAX_SIDE)
    height: int = Field(default=512, ge=128, le=MAX_SIDE)
    seed: Optional[int] = None
    toon: Optional[bool] = None  # flat colors and ink outlines on top of the model output (default on in models mode)


def toonify(img: Image.Image) -> Image.Image:
    """Cartoon finish that does not depend on the model: smooth flat colors, richer saturation, dark ink outlines."""
    img = img.convert("RGB")
    flat = img.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.SMOOTH_MORE)
    flat = ImageEnhance.Color(flat).enhance(1.4)
    flat = ImageEnhance.Contrast(flat).enhance(1.12)
    flat = flat.quantize(colors=24, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    gray = img.convert("L").filter(ImageFilter.GaussianBlur(1.4))
    ink = gray.filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 18 else 0).filter(ImageFilter.MaxFilter(3))
    return Image.composite(Image.new("RGB", img.size, (28, 22, 36)), flat, ink)


def _decode(b64: str) -> Image.Image:
    try:
        raw = base64.b64decode(b64, validate=False)
        if len(raw) > 8 * 1024 * 1024:
            raise ValueError("reference image too large")
        img = Image.open(io.BytesIO(raw))
        img.load()
        return ImageOps.exif_transpose(img).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"bad reference image: {e}") from e


def _mock(r: Req) -> Image.Image:
    h = int(hashlib.sha1(r.prompt.encode()).hexdigest()[:6], 16) % 360
    base = Image.new("RGB", (r.width, r.height))
    px = base.load()
    for y in range(r.height):
        for x in range(r.width):
            t = (x / r.width + y / r.height) / 2
            px[x, y] = (int(40 + 60 * t + h % 60), int(30 + 50 * (1 - t)), int(70 + 90 * t))
    if r.image_b64:
        photo = ImageOps.fit(_decode(r.image_b64), (r.width, r.height))
        toon = ImageOps.posterize(photo.filter(ImageFilter.SMOOTH_MORE), 3)
        edges = photo.convert("L").filter(ImageFilter.FIND_EDGES).point(lambda v: 255 - min(255, v * 3))
        toon = Image.composite(toon, Image.new("RGB", toon.size, (20, 20, 30)), edges.point(lambda v: 255 if v > 120 else 80))
        base = Image.blend(base, toon, 1.0 - 0.35 * r.strength)
    d = ImageDraw.Draw(base)
    d.rectangle([0, r.height - 150, r.width, r.height], fill=(0, 0, 0))
    d.text((8, r.height - 146), f"MOCK DIFFUSION{' + PHOTO' if r.image_b64 else ''}", fill=(255, 220, 120))
    d.text((8, r.height - 128), "\n".join(textwrap.wrap(r.prompt, width=max(20, r.width // 7))[:8]), fill=(255, 255, 255))
    return base


_pipes = {}


def _real(r: Req) -> Image.Image:
    import torch  # heavy, only in models mode
    from diffusers import AutoPipelineForImage2Image, AutoPipelineForText2Image

    if "t2i" not in _pipes:
        device = "cuda" if torch.cuda.is_available() else ("mps" if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available() else "cpu")
        dtype = torch.float16 if device != "cpu" else torch.float32
        t2i = AutoPipelineForText2Image.from_pretrained(MODEL_ID, torch_dtype=dtype, variant="fp16" if dtype == torch.float16 else None).to(device)
        t2i.enable_attention_slicing()  # lower peak memory: the language model shares this machine's memory
        _pipes.update(t2i=t2i, i2i=AutoPipelineForImage2Image.from_pipe(t2i), device=device)
    gen = None
    if r.seed is not None:
        gen = torch.Generator(device="cpu").manual_seed(r.seed)
    kw = dict(prompt=r.prompt, guidance_scale=0.0, generator=gen)  # turbo models run without guidance
    if r.image_b64:
        init = ImageOps.fit(_decode(r.image_b64), (r.width, r.height))
        strength = max(r.strength, MIN_STRENGTH)
        steps = max(r.steps, int(1 / max(strength, 0.05)) + 1)  # img2img runs steps*strength denoising steps
        return _pipes["i2i"](image=init, strength=strength, num_inference_steps=steps, **kw).images[0]
    return _pipes["t2i"](width=r.width, height=r.height, num_inference_steps=r.steps, **kw).images[0]


@app.get("/healthz")
def healthz():
    return {"ok": True, "mode": MODE, "model": MODEL_ID if MODE != "mock" else "mock"}


@app.post("/generate")
def generate(r: Req):
    img = _mock(r) if MODE == "mock" else _real(r)
    if MODE != "mock" and (TOON_DEFAULT if r.toon is None else r.toon):
        img = toonify(img)
    meta = PngInfo()
    meta.add_text("prompt", r.prompt)
    meta.add_text("negative_prompt", r.negative_prompt)
    meta.add_text("strength", str(r.strength))
    meta.add_text("had_reference", "1" if r.image_b64 else "0")
    meta.add_text("generator", "mock" if MODE == "mock" else MODEL_ID)
    buf = io.BytesIO()
    img.save(buf, "PNG", pnginfo=meta)
    return {"mime": "image/png", "data_b64": base64.b64encode(buf.getvalue()).decode()}
