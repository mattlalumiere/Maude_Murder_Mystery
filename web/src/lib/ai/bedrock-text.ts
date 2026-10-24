// Bedrock TextModel adapter. Deprecated: kept working behind the TextModel port, not extended. Prefer openai-compatible.
import {
  AiBadOutputError, AiRateLimitedError, AiTimeoutError, AiUnavailableError, estimateTokens,
  type TextModel, type TextRequest, type TextResult,
} from "./ports";

export interface BedrockTextOptions { modelId: string; region?: string }

/** @deprecated Legacy AWS adapter, see file header. */
export function createBedrockText(o: BedrockTextOptions): TextModel {
  return {
    id: `bedrock:${o.modelId}`,
    async generate(req: TextRequest): Promise<TextResult> {
      const t0 = Date.now();
      try {
        const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
        const client = new BedrockRuntimeClient({ region: o.region });
        const out = await client.send(new ConverseCommand({
          modelId: o.modelId,
          ...(req.system ? { system: [{ text: req.system }] } : {}),
          messages: [{ role: "user", content: [{ text: req.user }] }],
          inferenceConfig: { maxTokens: req.maxOutputTokens ?? 4096, temperature: req.temperature ?? 0.9 },
        }), { abortSignal: req.signal });
        const text = out.output?.message?.content?.map((b) => ("text" in b ? b.text : "")).join("") ?? "";
        if (!text.trim()) throw new AiBadOutputError("Bedrock returned no text");
        return {
          text,
          usage: {
            inputTokens: out.usage?.inputTokens ?? estimateTokens((req.system ?? "") + req.user),
            outputTokens: out.usage?.outputTokens ?? estimateTokens(text),
          },
          model: o.modelId,
          finishReason: out.stopReason === "end_turn" ? "stop" : out.stopReason === "max_tokens" ? "length" : "other",
          latencyMs: Date.now() - t0,
        };
      } catch (e) {
        if (e instanceof AiBadOutputError) throw e;
        const name = (e as { name?: string }).name ?? "";
        if (name === "ThrottlingException") throw new AiRateLimitedError("upstream", "Bedrock is throttling");
        if (name === "AbortError" || name === "TimeoutError") throw new AiTimeoutError("Bedrock call aborted");
        throw new AiUnavailableError("http", `Bedrock failed: ${(e as Error).message}`);
      }
    },
  };
}
