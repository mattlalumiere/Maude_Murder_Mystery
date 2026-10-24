import { getMediaStore } from "@/lib/media-store";
import { getStore } from "@/lib/store";

// Readiness: 200 only when the state store and the blob store answer. Never reports secrets.
export const dynamic = "force-dynamic";

// Must satisfy the strict join-code and blob-key formats, or every adapter rejects the probe and readiness never turns green.
const PROBE_CODE = "ZZZZ";
const TIMEOUT_MS = 2000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`${label} timed out`)), TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

async function check(label: string, fn: () => Promise<unknown>): Promise<"ok" | "fail"> {
  try {
    await withTimeout(fn(), label);
    return "ok";
  } catch {
    return "fail";
  }
}

export async function GET() {
  const env = process.env;
  const [store, media] = await Promise.all([
    check("store", async () => getStore().get(PROBE_CODE)),
    check("media", async () => getMediaStore().get(`${PROBE_CODE}/gen/readyz-probe`)),
  ]);
  const ready = store === "ok" && media === "ok";
  const storeAdapter = env.STORE_ADAPTER || (env.ROOMS_TABLE ? "dynamo" : "memory");
  const mediaAdapter = env.MEDIA_ADAPTER || (env.MEDIA_BUCKET ? "s3" : "file");
  return Response.json(
    {
      status: ready ? "ready" : "unavailable",
      checks: { store, media },
      adapters: { store: storeAdapter, media: mediaAdapter, aiText: env.AI_TEXT_ADAPTER || "sample" },
      cell: env.CELL_ID || "local-0",
      region: env.REGION_ID || "local",
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
