// TextModel adapter for any OpenAI-compatible /chat/completions endpoint
// (mlx_lm.server, Ollama, vLLM, llama.cpp server, hosted gateways). Uses fetch only.
import {
  AiBadOutputError, AiRateLimitedError, AiTimeoutError, AiUnavailableError, estimateTokens,
  type TextModel, type TextRequest, type TextResult,
} from "./ports";
import { stripThink } from "./json";

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Per call timeout covering headers and body. The gateway also enforces a total deadline. */
  timeoutMs: number;
  maxOutputTokens: number;
  /** Hard cap on the response body we are willing to buffer. */
  maxResponseBytes?: number;
  fetch?: typeof fetch;
}

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => {}); throw new AiBadOutputError(`Response larger than ${max} bytes`); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createOpenAiCompatible(o: OpenAiCompatibleOptions): TextModel {
  const doFetch = o.fetch ?? fetch;
  const url = `${o.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const maxBytes = o.maxResponseBytes ?? DEFAULT_MAX_BYTES;

  return {
    id: `openai-compatible:${o.model}`,
    async generate(req: TextRequest): Promise<TextResult> {
      const t0 = Date.now();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(new AiTimeoutError(`AI call exceeded ${o.timeoutMs}ms`)), o.timeoutMs);
      const onAbort = () => ctl.abort(req.signal!.reason);
      if (req.signal) { if (req.signal.aborted) onAbort(); else req.signal.addEventListener("abort", onAbort, { once: true }); }
      const timedOut = () => ctl.signal.aborted;
      try {
        const messages = [
          ...(req.system ? [{ role: "system", content: req.system }] : []),
          { role: "user", content: req.user },
        ];
        let res: Response;
        try {
          res = await doFetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", ...(o.apiKey ? { authorization: `Bearer ${o.apiKey}` } : {}) },
            body: JSON.stringify({
              model: o.model, messages, stream: false,
              max_tokens: Math.min(req.maxOutputTokens ?? o.maxOutputTokens, o.maxOutputTokens),
              temperature: req.temperature ?? 0.8,
            }),
            signal: ctl.signal,
          });
        } catch (e) {
          if (timedOut()) throw new AiTimeoutError(`AI call exceeded ${o.timeoutMs}ms`);
          throw new AiUnavailableError("network", `AI server unreachable: ${(e as Error).cause ? String(((e as Error).cause as Error).message ?? e) : (e as Error).message}`);
        }

        if (res.status === 429) {
          await res.body?.cancel().catch(() => {});
          const ra = Number(res.headers.get("retry-after"));
          throw new AiRateLimitedError("upstream", "AI server is rate limiting", Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
        }
        if (res.status === 408 || res.status === 504) { await res.body?.cancel().catch(() => {}); throw new AiTimeoutError(`AI server returned ${res.status}`); }
        if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new AiUnavailableError("http", `AI server returned ${res.status}`); }

        let raw: string;
        try { raw = await readCapped(res, maxBytes); } catch (e) {
          if (e instanceof AiBadOutputError) throw e;
          if (timedOut()) throw new AiTimeoutError(`AI call exceeded ${o.timeoutMs}ms`);
          throw new AiUnavailableError("network", "AI connection dropped mid-response");
        }

        let body: any;
        try { body = JSON.parse(raw); } catch { throw new AiBadOutputError("AI server returned a non-JSON body"); }
        const choice = body?.choices?.[0];
        const content = choice?.message?.content;
        if (typeof content !== "string") throw new AiBadOutputError("AI server reply had no message content");
        const text = stripThink(content).trim();
        if (!text) throw new AiBadOutputError("AI reply was empty");
        const fr = choice.finish_reason;
        return {
          text,
          usage: {
            inputTokens: Number(body.usage?.prompt_tokens) || estimateTokens(messages.map((m) => m.content).join("\n")),
            outputTokens: Number(body.usage?.completion_tokens) || estimateTokens(content),
          },
          model: String(body.model ?? o.model),
          finishReason: fr === "stop" ? "stop" : fr === "length" ? "length" : "other",
          latencyMs: Date.now() - t0,
        };
      } finally {
        clearTimeout(timer);
        req.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
