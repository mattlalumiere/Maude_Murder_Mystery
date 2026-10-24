// Azure default speech: Azure AI Speech over its REST API (no SDK needed).
import { SpeechUnavailableError, xmlEscape, type SpeechModel } from "./speech-port";

export interface AzureSpeechOptions { key: string; region: string }

export function createAzureSpeech(o: AzureSpeechOptions): SpeechModel {
  return {
    id: `azure:${o.region}`,
    kind: "server",
    voices: ["en-US-JennyNeural", "en-US-GuyNeural", "en-GB-SoniaNeural", "en-GB-RyanNeural", "en-US-AriaNeural", "en-US-DavisNeural", "en-AU-NatashaNeural", "en-AU-WilliamNeural"],
    usdPerChar: 0.000016, // estimate: about 16 USD per million characters for neural voices
    async synthesize(text, voice, signal) {
      const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${xmlEscape(voice)}">${xmlEscape(text)}</voice></speak>`;
      let res: Response;
      try {
        res = await fetch(`https://${o.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
          method: "POST", signal,
          headers: {
            "Ocp-Apim-Subscription-Key": o.key, "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "murder-mystery-night",
          },
          body: ssml,
        });
      } catch { throw new SpeechUnavailableError("Azure Speech is unreachable"); }
      if (!res.ok) throw new SpeechUnavailableError(`Azure Speech returned ${res.status}`);
      return { bytes: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" };
    },
  };
}
