import { authPlayer, setPhoto } from "@/lib/engine";
import { handle, json } from "@/lib/http";
import { moderatePhoto } from "@/lib/media-gen";
import { getMediaStore } from "@/lib/media-store";
import { getStore, HttpError, mutate } from "@/lib/store";

const MAX = 2 * 1024 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = (await ctx.params).code.toUpperCase();
    const consent = req.headers.get("x-consent");
    if (consent !== "self" && consent !== "guardian") throw new HttpError(400, "Consent is required to upload a photo");
    const room = await getStore().get(code);
    if (!room) throw new HttpError(404, "Room not found");
    const p = authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"));
    if (!["lobby", "cards"].includes(room.phase)) throw new HttpError(409, "Photos can only be added before the party starts");
    const bytes = Buffer.from(await req.arrayBuffer());
    if (bytes.length < 1000 || bytes.length > MAX) throw new HttpError(413, "Photo must be under 2 MB");
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new HttpError(415, "Photo must be a JPEG");
    const mod = await moderatePhoto(bytes);
    if (!mod.ok) throw new HttpError(422, mod.reason ?? "Photo not accepted");
    const key = `${code}/photos/${p.id}.jpg`;
    await getMediaStore().put(key, bytes, "image/jpeg");
    await mutate(code, (r) => setPhoto(r, authPlayer(r, p.id, p.token), key, consent));
    return json({ ok: true });
  });
}

/** Lets a player preview their own uploaded photo. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const code = (await ctx.params).code.toUpperCase();
  try {
    const room = await getStore().get(code);
    if (!room) throw new HttpError(404, "Room not found");
    const p = authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"));
    const m = p.profile.photoKey ? await getMediaStore().get(p.profile.photoKey) : null;
    if (!m) throw new HttpError(404, "No photo");
    return new Response(new Uint8Array(m.bytes), { headers: { "Content-Type": m.mime, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return new Response((e as Error).message, { status: e instanceof HttpError ? e.status : 500 });
  }
}
