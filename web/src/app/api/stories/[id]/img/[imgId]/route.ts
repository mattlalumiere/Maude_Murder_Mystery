import { getStoryImage } from "@/lib/stories";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; imgId: string }> }) {
  const { id, imgId } = await ctx.params;
  try {
    const o = await getStoryImage(id, imgId);
    if (!o) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(o.bytes), { headers: { "Content-Type": o.mime, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
