// MCP client for the local AI services. One shared connection per process, rebuilt after a failure.
// The only file that imports the MCP SDK.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { localUrl } from "./mode";

export class LocalAiError extends Error {
  constructor(message: string, public readonly kind: "unavailable" | "tool" | "timeout" = "unavailable") { super(message); this.name = "LocalAiError"; }
}

const g = globalThis as unknown as { __mmMcp?: { key: string; client: Promise<Client> } };

function connect(): Promise<Client> {
  const url = localUrl();
  if (!url) return Promise.reject(new LocalAiError("Local AI services are not configured (LOCAL_AI_MCP_URL)"));
  const token = process.env.LOCAL_AI_TOKEN ?? "";
  const key = `${url}|${token}`;
  if (g.__mmMcp?.key === key) return g.__mmMcp.client;
  const client = (async () => {
    const transport = new StreamableHTTPClientTransport(new URL(url), token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : undefined);
    const c = new Client({ name: "maude-web", version: "1.0.0" });
    await c.connect(transport);
    return c;
  })();
  g.__mmMcp = { key, client };
  client.catch(() => { if (g.__mmMcp?.client === client) g.__mmMcp = undefined; });
  return client;
}

export function resetLocalAi() { g.__mmMcp = undefined; }

/** Closes the shared connection (tests and clean shutdown). */
export async function closeLocalAi() {
  const cur = g.__mmMcp;
  g.__mmMcp = undefined;
  try { await (await cur?.client)?.close(); } catch { /* already closed */ }
}

/** Calls one tool and returns its JSON result. Throws LocalAiError. */
export async function callTool<T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let client: Client;
    try { client = await connect(); }
    catch (e) { resetLocalAi(); throw e instanceof LocalAiError ? e : new LocalAiError(`Local AI services are unreachable: ${(e as Error).message}`); }
    try {
      const res = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
      const content = (res.content ?? []) as { type: string; text?: string }[];
      const text = content.find((c) => c.type === "text")?.text ?? "";
      if (res.isError) throw new LocalAiError(text.slice(0, 200) || `Tool ${name} failed`, "tool");
      if (res.structuredContent && typeof res.structuredContent === "object") return res.structuredContent as T;
      return JSON.parse(text) as T;
    } catch (e) {
      if (e instanceof LocalAiError) throw e;
      const msg = (e as Error).message ?? "";
      if (/timed? ?out/i.test(msg)) throw new LocalAiError(`Local AI tool ${name} timed out`, "timeout");
      resetLocalAi(); // a stale connection: rebuild once and retry
      if (attempt === 1) throw new LocalAiError(`Local AI services are unreachable: ${msg}`);
    }
  }
  throw new LocalAiError("Local AI services are unreachable");
}

export interface LocalHealth { configured: boolean; reachable: boolean; ok?: boolean; backends?: Record<string, { ok: boolean; mode?: string }>; chat?: string }

export async function localHealth(): Promise<LocalHealth> {
  if (!localUrl()) return { configured: false, reachable: false };
  try {
    const h = await callTool<{ ok: boolean; backends: Record<string, { ok: boolean; mode?: string }>; chat: string }>("health", {}, 8_000);
    return { configured: true, reachable: true, ok: h.ok, backends: h.backends, chat: h.chat };
  } catch { return { configured: true, reachable: false }; }
}
