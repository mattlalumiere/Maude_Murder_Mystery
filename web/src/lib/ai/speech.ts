// Chooses the speech adapter from the environment. Defaults follow the selected cloud provider:
//   CLOUD_PROVIDER=aws   -> Amazon Polly
//   CLOUD_PROVIDER=azure -> Azure AI Speech
//   neither              -> infer from the text AI adapter, else the free browser voices.
// SPEECH_ADAPTER (browser | mock | polly | azure | openai-compatible) overrides everything.
import { createAzureSpeech } from "./speech-azure";
import { createBrowserSpeech, createMockSpeech } from "./speech-browser";
import { createOpenAiSpeech } from "./speech-openai";
import { createPollySpeech } from "./speech-polly";
import type { SpeechModel } from "./speech-port";

type Env = Record<string, string | undefined>;
export type SpeechAdapterName = "browser" | "mock" | "polly" | "azure" | "openai-compatible";

export function speechAdapterName(env: Env): SpeechAdapterName {
  const asked = env.SPEECH_ADAPTER;
  if (asked === "browser" || asked === "mock" || asked === "polly" || asked === "azure" || asked === "openai-compatible") return asked;
  const cloud = (env.CLOUD_PROVIDER ?? "").toLowerCase();
  if (cloud === "aws") return "polly";
  if (cloud === "azure" && env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION) return "azure";
  if (env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION) return "azure";
  if (env.AI_TEXT_ADAPTER === "bedrock" || (!env.AI_TEXT_ADAPTER && env.BEDROCK_MODEL_ID)) return "polly";
  if (env.AI_TEXT_ADAPTER === "openai-compatible" && env.AI_BASE_URL && env.SPEECH_MODEL) return "openai-compatible";
  return "browser";
}

export function createSpeech(env: Env): SpeechModel {
  switch (speechAdapterName(env)) {
    case "polly": return createPollySpeech({ region: env.AWS_REGION, engine: (env.POLLY_ENGINE as "neural" | "generative" | "standard") || "neural" });
    case "azure": return createAzureSpeech({ key: env.AZURE_SPEECH_KEY ?? "", region: env.AZURE_SPEECH_REGION ?? "" });
    case "openai-compatible": return createOpenAiSpeech({ baseUrl: env.AI_BASE_URL ?? "", apiKey: env.AI_API_KEY, model: env.SPEECH_MODEL ?? "tts-1" });
    case "mock": return createMockSpeech();
    default: return createBrowserSpeech();
  }
}

const g = globalThis as unknown as { __mmSpeech?: { key: string; model: SpeechModel } };
export function getSpeech(): SpeechModel {
  const key = JSON.stringify([process.env.SPEECH_ADAPTER, process.env.CLOUD_PROVIDER, process.env.AI_TEXT_ADAPTER, process.env.BEDROCK_MODEL_ID, process.env.AZURE_SPEECH_KEY ? "k" : "", process.env.SPEECH_MODEL]);
  if (!g.__mmSpeech || g.__mmSpeech.key !== key) g.__mmSpeech = { key, model: createSpeech(process.env) };
  return g.__mmSpeech.model;
}
