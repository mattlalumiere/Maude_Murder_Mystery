import { getMediaStore } from "@/lib/media-store";
import { getStore } from "@/lib/store";

/** Serves the spoken audio for one AI guest line. The id is random and only listed for rooms you can already see. */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await ctx.params;
  try {
    const room = await getStore().get(code.toUpperCase());
    const line = room?.botLog?.find((l) => l.id === id && l.audioKey);
    const obj = line ? await getMediaStore().get(line.audioKey!) : null;
    if (!obj) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(obj.bytes), { headers: { "Content-Type": obj.mime, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
