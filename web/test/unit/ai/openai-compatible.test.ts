import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiBadOutputError, AiRateLimitedError, AiTimeoutError, AiUnavailableError } from "@/lib/ai/ports";
import { createOpenAiCompatible } from "@/lib/ai/openai-compatible";
import { startFakeServer, type FakeServer } from "./fake-server";

let fake: FakeServer;
beforeAll(async () => { fake = await startFakeServer(); });
afterAll(async () => { await fake.close(); });
beforeEach(() => fake.reset());

const make = (over: Partial<Parameters<typeof createOpenAiCompatible>[0]> = {}) =>
  createOpenAiCompatible({ baseUrl: fake.baseUrl, model: "m", timeoutMs: 400, maxOutputTokens: 123, maxResponseBytes: 10_000, ...over });

describe("openai-compatible TextModel", () => {
  it("posts a chat completion and returns text and usage", async () => {
    fake.fallback = { kind: "ok", content: "hello", usage: { prompt_tokens: 7, completion_tokens: 3 } };
    const r = await make({ apiKey: "sekret" }).generate({ system: "sys", user: "hi" });
    expect(r.text).toBe("hello");
    expect(r.usage).toEqual({ inputTokens: 7, outputTokens: 3 });
    expect(r.finishReason).toBe("stop");
    const req = fake.requests[0];
    expect(req.body.model).toBe("m");
    expect(req.body.max_tokens).toBe(123);
    expect(req.body.stream).toBe(false);
    expect(req.body.messages).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "hi" }]);
    expect(req.headers.authorization).toBe("Bearer sekret");
  });

  it("sends no Authorization header without a key", async () => {
    await make().generate({ user: "hi" });
    expect(fake.requests[0].headers.authorization).toBeUndefined();
  });

  it("clamps the per-request max tokens to the adapter ceiling", async () => {
    await make().generate({ user: "hi", maxOutputTokens: 999_999 });
    expect(fake.requests[0].body.max_tokens).toBe(123);
  });

  it("maps finish_reason length", async () => {
    fake.fallback = { kind: "ok", content: "{\"a\":", finish: "length" };
    expect((await make().generate({ user: "x" })).finishReason).toBe("length");
  });

  it("times out on a slow response", async () => {
    fake.fallback = { kind: "ok", content: "late", delayMs: 1500 };
    await expect(make().generate({ user: "x" })).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it("times out when the server sends headers then hangs", async () => {
    fake.fallback = { kind: "hang" };
    const t = Date.now();
    await expect(make().generate({ user: "x" })).rejects.toBeInstanceOf(AiTimeoutError);
    expect(Date.now() - t).toBeLessThan(1500);
  });

  it("maps 500 to Unavailable, 429 to RateLimited with retry-after", async () => {
    fake.queue.push({ kind: "status", status: 500 }, { kind: "status", status: 429, retryAfter: "2" });
    await expect(make().generate({ user: "x" })).rejects.toBeInstanceOf(AiUnavailableError);
    const err = await make().generate({ user: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiRateLimitedError);
    expect(err.retryAfterMs).toBe(2000);
  });

  it("maps a dropped connection to Unavailable", async () => {
    fake.fallback = { kind: "drop" };
    await expect(make().generate({ user: "x" })).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("maps connection refused to Unavailable", async () => {
    await expect(make({ baseUrl: "http://127.0.0.1:1/v1" }).generate({ user: "x" })).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("maps a non-JSON body and a body without choices to BadOutput", async () => {
    fake.queue.push({ kind: "garbage" }, { kind: "status", status: 200, body: "{\"choices\":[]}" });
    await expect(make().generate({ user: "x" })).rejects.toBeInstanceOf(AiBadOutputError);
    await expect(make().generate({ user: "x" })).rejects.toBeInstanceOf(AiBadOutputError);
  });

  it("refuses an oversized response body instead of buffering it", async () => {
    fake.fallback = { kind: "huge", bytes: 200_000 };
    await expect(make().generate({ user: "x" })).rejects.toBeInstanceOf(AiBadOutputError);
  });

  it("strips <think> blocks from the text", async () => {
    fake.fallback = { kind: "ok", content: "<think>pondering</think>{\"a\":1}" };
    expect((await make().generate({ user: "x" })).text).toBe("{\"a\":1}");
  });
});
