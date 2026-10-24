// OpenAI-compatible speech (POST {base}/audio/speech). Works with OpenAI and local servers that implement it.
import { SpeechUnavailableError, type SpeechModel } from "./speech-port";

export interface OpenAiSpeechOptions { baseUrl: string; apiKey?: string; model: string }

export function createOpenAiSpeech(o: OpenAiSpeechOptions): SpeechModel {
  return {
    id: `openai-compatible:${o.model}`,
    kind: "server",
    voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    usdPerChar: 0.000015, // estimate; local servers are free
    async synthesize(text, voice, signal) {
      let res: Response;
      try {
        res = await fetch(`${o.baseUrl.replace(/\/$/, "")}/audio/speech`, {
          method: "POST", signal,
          headers: { "Content-Type": "application/json", ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}) },
          body: JSON.stringify({ model: o.model, voice, input: text, response_format: "mp3" }),
        });
      } catch { throw new SpeechUnavailableError("Speech server is unreachable"); }
      if (!res.ok) throw new SpeechUnavailableError(`Speech server returned ${res.status}`);
      return { bytes: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type") ?? "audio/mpeg" };
    },
  };
}
