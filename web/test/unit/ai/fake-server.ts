// Fake OpenAI-compatible server for tests. Behaviours are queued per request; the default applies when the queue is empty.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type Behaviour =
  | { kind: "ok"; content: string; finish?: string; delayMs?: number; usage?: { prompt_tokens: number; completion_tokens: number } }
  | { kind: "status"; status: number; retryAfter?: string; body?: string }
  | { kind: "hang" }
  | { kind: "drop" }
  | { kind: "garbage" }
  | { kind: "huge"; bytes: number };

export interface FakeServer {
  baseUrl: string;
  requests: { body: any; headers: IncomingMessage["headers"] }[];
  maxInFlight: number;
  queue: Behaviour[];
  fallback: Behaviour;
  close(): Promise<void>;
  reset(): void;
}

export async function startFakeServer(): Promise<FakeServer> {
  const sockets = new Set<import("node:net").Socket>();
  let inFlight = 0;
  const fake: FakeServer = {
    baseUrl: "", requests: [], maxInFlight: 0, queue: [], fallback: { kind: "ok", content: "{}" },
    async close() { for (const s of sockets) s.destroy(); await new Promise<void>((r) => server.close(() => r())); },
    reset() { fake.requests = []; fake.maxInFlight = 0; fake.queue = []; fake.fallback = { kind: "ok", content: "{}" }; },
  };
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    inFlight++; fake.maxInFlight = Math.max(fake.maxInFlight, inFlight);
    const done = () => { inFlight--; };
    res.on("close", done);
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body: any = null;
      try { body = JSON.parse(raw); } catch { /* keep null */ }
      fake.requests.push({ body, headers: req.headers });
      const b = fake.queue.shift() ?? fake.fallback;
      const send = (status: number, text: string, headers: Record<string, string> = {}) => {
        res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(text);
      };
      switch (b.kind) {
        case "ok": {
          const payload = JSON.stringify({
            id: "x", model: "fake",
            choices: [{ index: 0, message: { role: "assistant", content: b.content }, finish_reason: b.finish ?? "stop" }],
            usage: b.usage ?? { prompt_tokens: 100, completion_tokens: 200 },
          });
          if (b.delayMs) setTimeout(() => send(200, payload), b.delayMs); else send(200, payload);
          break;
        }
        case "status": send(b.status, b.body ?? JSON.stringify({ error: { message: "nope" } }), b.retryAfter ? { "retry-after": b.retryAfter } : {}); break;
        case "hang": res.writeHead(200, { "content-type": "application/json" }); res.write("{\"choices\":["); break;
        case "drop": req.socket.destroy(); break;
        case "garbage": send(200, "<html>not json at all</html>"); break;
        case "huge": send(200, "x".repeat(b.bytes)); break;
      }
    });
  });
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  fake.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  return fake;
}
