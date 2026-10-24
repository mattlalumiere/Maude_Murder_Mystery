# Local AI services

Chat, voices, pictures and video for Murder Mystery Night that run on your own computer, in containers, and are driven over **MCP** (Model Context Protocol). Cloud accounts are optional: pick **Local services** when you set up a game.

```
 web app (Next.js)                      services/local-ai (containers)
 ┌──────────────┐   MCP over HTTP   ┌───────────┐   ┌────────────┐
 │ MCP client   │ ───────────────▶ │  ai-mcp   │──▶│ ai-tts     │ Piper voices
 │ (one file:   │  /mcp, bearer     │ (FastMCP) │──▶│ ai-stt     │ faster-whisper
 │  mcp-client) │  token optional   │           │──▶│ ai-image   │ diffusion (txt2img, img2img)
 └──────────────┘                   │           │──▶│ ai-video   │ ffmpeg slideshow
                                    │           │──▶  chat → any OpenAI-compatible server (mlx_lm on the Mac)
                                    └───────────┘
```

## Quick start

| Goal | Command |
|---|---|
| Try it in seconds, no models (test voices, test images, real MP4) | `make local-ai-up` (containers) or `make local-ai-dev` (no Docker) |
| Run the checks | `make local-ai-test` |
| Real models in containers | `LOCAL_AI_MODE=models make local-ai-up` (large downloads; first call fetches voices and the diffusion model) |
| Stop | `make local-ai-down` or `services/local-ai/dev.sh stop` |

Then point the web app at it and choose **Local services on my own computer** in the setup wizard (step 3):

```bash
# web/.env.local
LOCAL_AI_MCP_URL=http://127.0.0.1:8765/mcp
# LOCAL_AI_TOKEN=...   # set the same value in the containers' environment when the port is reachable by others
```

If the web app itself runs in a container, use `http://host.docker.internal:8765/mcp`, start the AI containers with `AI_BIND=0.0.0.0`, and set `LOCAL_AI_TOKEN`.

## MCP tools

| Tool | Does | Backend |
|---|---|---|
| `health` | which backends answer | all |
| `list_voices`, `speak(text, voice)` | text to speech (WAV) | `ai-tts` (Piper) |
| `transcribe(audio_b64, mime)` | speech to text | `ai-stt` (faster-whisper) |
| `chat(user, system, max_tokens, temperature)` | one conversation turn | OpenAI-compatible server (`LLM_BASE_URL`) |
| `stylize_photo(image_b64, prompt, negative_prompt, strength, ...)` | **redraw an uploaded photo** to match a prompt (diffusion img2img) | `ai-image` |
| `generate_image(prompt, ...)` | text to image | `ai-image` |
| `generate_video(frames_b64, seconds, narration_b64)` | MP4 from stills, slow zoom, fades, optional narration | `ai-video` (ffmpeg) |

## How a photo becomes character art

1. A player uploads a photo (consent, metadata stripped, never shown to others).
2. The **prompt director** (`web/src/lib/prompt-director.ts`) writes a diffusion prompt for *that character in that story*: the character's name, tease and house, the story setting, and the scene's moment. A local text model refines it when available; otherwise a template is used. It only reads **public** facts, never a character's secret, alibi, clues or the solution.
3. `stylize_photo` sends the photo plus the prompt (and a safety negative prompt and a strength, about 0.6 for portraits) to the diffusion model, which repaints the person in the character's look.
4. For clips, three keyframes are drawn the same way, stitched with a slow zoom, and the scene narration is read over them.

## Models and hardware

- **Voices**: Piper, CPU, fast. **Speech to text**: faster-whisper `base.en`, CPU, a few seconds per clip.
- **Chat**: not bundled. Set `LLM_BASE_URL` (default `http://host.docker.internal:8080/v1`, the mlx_lm server this project already uses). `CHAT_MODE=mock` gives canned replies.
- **Images**: `stabilityai/sd-turbo` through `diffusers`. Containers on Apple Silicon have **no GPU access**, so this runs on CPU there (slow, tens of seconds per image). For speed, run the image service natively so it can use the GPU (MPS):

  ```bash
  cd services/local-ai && ./dev.sh models      # installs the real model requirements into .venv
  AI_MODE=models .venv/bin/uvicorn --app-dir image app:app --port 8768   # then set IMAGE_URL=http://host.docker.internal:8768 for ai-mcp
  ```
- **Video**: a slideshow, not a generative model. A GPU host can replace the `ai-video` backend (for example AnimateDiff or Stable Video Diffusion) behind the same `/slideshow` endpoint.
- Real model builds were not run in the tests (they need large downloads). Mock mode and the full MCP path are tested.

## Security and privacy

- The MCP port is for the host machine or a private network. By default compose publishes it on `127.0.0.1` only; backends are not published at all.
- `LOCAL_AI_TOKEN` adds a bearer token check on `/mcp`.
- Containers run read-only, non-root, with all capabilities dropped and memory limits.
- Photos, voice recordings and chat stay on your machine when a game uses local services.

## Layout

`mcp/` MCP server (FastMCP), `tts/`, `stt/`, `image/`, `video/` backends (each: `app.py`, `Dockerfile`, requirements, `MODE=mock|models` build arg), `compose.yml`, `dev.sh` (native runner), `tests/smoke.py`.
