import { SpeechUnavailableError, type SpeechModel } from "./speech-port";

/** Free default: no server audio. Browsers speak bot lines with their built-in speech synthesis. */
export function createBrowserSpeech(): SpeechModel {
  return {
    id: "browser",
    kind: "browser",
    voices: ["b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7"],
    usdPerChar: 0,
    async synthesize() { throw new SpeechUnavailableError("The browser speaks this line"); },
  };
}

/** Test and demo adapter: returns a short, quiet, valid WAV so the server audio path can run without any cloud. */
export function createMockSpeech(): SpeechModel {
  return {
    id: "mock",
    kind: "server",
    voices: ["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7"],
    usdPerChar: 0,
    async synthesize(text: string, voice: string) {
      const rate = 8000, ms = Math.min(1200, 200 + text.length * 8), n = Math.floor((rate * ms) / 1000);
      const freq = 220 + (voice.charCodeAt(1) % 8) * 40;
      const pcm = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 1200 * Math.min(1, i / 400, (n - i) / 400)), i * 2);
      const h = Buffer.alloc(44);
      h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
      h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
      h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
      return { bytes: Buffer.concat([h, pcm]), mime: "audio/wav" };
    },
  };
}
