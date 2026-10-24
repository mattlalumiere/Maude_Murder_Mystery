import { getMediaStore } from "@/lib/media-store";
import { getStore } from "@/lib/store";

/** Serves generated art/video for a room. Raw player photos are never served here. */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await ctx.params;
  const room = await getStore().get(code.toUpperCase());
  const item = room?.media.find((m) => m.id === id && m.status === "done" && m.key);
  const obj = item ? await getMediaStore().get(item.key!) : null;
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(obj.bytes), { headers: { "Content-Type": obj.mime, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } });
}
