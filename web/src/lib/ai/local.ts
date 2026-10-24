// Adapters over the local services (MCP tools). They implement the same ports as the cloud adapters.
import { callTool, LocalAiError } from "./mcp-client";
import { estimateTokens, type ImageModel, type TextModel, type TextRequest, type TextResult } from "./ports";
import type { SpeechModel } from "./speech-port";
import { SpeechUnavailableError } from "./speech-port";

type B64 = { mime: string; data_b64: string };
const bytes = (r: B64) => ({ bytes: Buffer.from(r.data_b64, "base64"), mime: r.mime });

export const localTextModel: TextModel = {
  id: "mcp:local-chat",
  async generate(req: TextRequest): Promise<TextResult> {
    const t0 = Date.now();
    const r = await callTool<{ text: string; model: string }>("chat", {
      user: req.user, system: req.system ?? "", max_tokens: req.maxOutputTokens ?? 400, temperature: req.temperature ?? 0.8,
    }, req.timeoutMs ?? 60_000);
    return {
      text: r.text, model: r.model, finishReason: "stop", latencyMs: Date.now() - t0,
      usage: { inputTokens: estimateTokens((req.system ?? "") + req.user), outputTokens: estimateTokens(r.text) },
    };
  },
};

const FALLBACK_VOICES = ["en_US-lessac-medium", "en_US-amy-medium", "en_GB-alan-medium", "en_US-ryan-medium", "en_GB-jenny_dioco-medium", "en_US-joe-medium", "en_US-kristin-medium", "en_GB-northern_english_male-medium"];
let voiceCache: string[] | null = null;
export async function loadLocalVoices(): Promise<string[]> {
  if (voiceCache) return voiceCache;
  try { const v = (await callTool<{ voices: string[] }>("list_voices", {}, 8_000)).voices; if (v?.length) return (voiceCache = v); } catch { /* use the defaults */ }
  return FALLBACK_VOICES;
}

export const localSpeech: SpeechModel = {
  id: "mcp:local-tts",
  kind: "server",
  get voices() { return voiceCache ?? FALLBACK_VOICES; },
  usdPerChar: 0,
  async synthesize(text, voice) {
    try { return bytes(await callTool<B64>("speak", { text, voice }, 60_000)); }
    catch (e) { throw new SpeechUnavailableError(e instanceof LocalAiError ? e.message : "Local speech failed"); }
  },
};

export const localImageModel: ImageModel = {
  id: "mcp:local-image",
  async generate(r) {
    const [w, h] = r.shape === "square" ? [512, 512] : [768, 432];
    const common = { prompt: r.prompt.slice(0, 1500), negative_prompt: r.negative ?? "", width: w, height: h };
    if (r.refs.length) {
      // Photo in, character art out: the diffusion model repaints the first reference photo to match the prompt.
      return bytes(await callTool<B64>("stylize_photo", { ...common, image_b64: r.refs[0].toString("base64"), strength: r.strength ?? 0.8 }, 600_000));
    }
    return bytes(await callTool<B64>("generate_image", common, 600_000));
  },
};

/** A short clip: a few keyframes of the scene, a slow zoom between them, and optional narration. */
export async function localVideo(frames: Buffer[], seconds: number, narration?: Buffer): Promise<{ bytes: Buffer; mime: string }> {
  return bytes(await callTool<B64>("generate_video", {
    frames_b64: frames.map((f) => f.toString("base64")), seconds, ...(narration ? { narration_b64: narration.toString("base64") } : {}),
  }, 290_000));
}

export async function localTranscribe(audio: Buffer, mime: string): Promise<string> {
  const r = await callTool<{ text: string }>("transcribe", { audio_b64: audio.toString("base64"), mime }, 120_000);
  return String(r.text ?? "");
}
