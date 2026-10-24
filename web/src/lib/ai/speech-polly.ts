// AWS default speech: Amazon Polly. The only file that imports the Polly SDK.
import { SpeechUnavailableError, type SpeechModel } from "./speech-port";

export interface PollyOptions { region?: string; engine?: "neural" | "generative" | "standard" }

export function createPollySpeech(o: PollyOptions = {}): SpeechModel {
  const engine = o.engine ?? "neural";
  return {
    id: `polly:${engine}`,
    kind: "server",
    voices: ["Joanna", "Matthew", "Amy", "Brian", "Emma", "Ruth", "Stephen", "Kendra"],
    usdPerChar: engine === "generative" ? 0.00003 : 0.000016, // estimates: about 30 or 16 USD per million characters
    async synthesize(text, voice, signal) {
      try {
        const { PollyClient, SynthesizeSpeechCommand } = await import("@aws-sdk/client-polly");
        const client = new PollyClient({ region: o.region });
        const out = await client.send(
          new SynthesizeSpeechCommand({ OutputFormat: "mp3", Text: text, VoiceId: voice as never, Engine: engine, TextType: "text", LanguageCode: "en-US" }),
          { abortSignal: signal },
        );
        if (!out.AudioStream) throw new SpeechUnavailableError("Polly returned no audio");
        return { bytes: Buffer.from(await out.AudioStream.transformToByteArray()), mime: "audio/mpeg" };
      } catch (e) {
        if (e instanceof SpeechUnavailableError) throw e;
        throw new SpeechUnavailableError(`Polly failed: ${(e as Error).name}`);
      }
    },
  };
}
