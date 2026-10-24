import { randomBytes } from "node:crypto";
import { authPlayer } from "@/lib/engine";
import { handle, json } from "@/lib/http";
import { moderatePhoto } from "@/lib/media-gen";
import { stripJpegMetadata } from "@/lib/jpeg-strip";
import { getMediaStore } from "@/lib/media-store";
import { queueSelfie, styleById } from "@/lib/selfie";
import { getStore, HttpError, mutate } from "@/lib/store";

const MAX = 2 * 1024 * 1024;

/**
 * Selfie booth. The body is a JPEG; headers carry the style and consent. The raw photo is checked, stripped of metadata,
 * used once as a reference for the funny AI picture, and deleted. Only the generated picture is ever shown to others.
 */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = (await ctx.params).code.toUpperCase();
    const consent = req.headers.get("x-consent");
    if (consent !== "self" && consent !== "guardian") throw new HttpError(400, "Consent is required to take a selfie");
    const style = styleById(req.headers.get("x-style"));
    if (!style) throw new HttpError(400, "Pick a selfie style");
    const room = await getStore().get(code);
    if (!room) throw new HttpError(404, "Room not found");
    const p = authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"));
    if (p.ageGroup !== "adult" && consent !== "guardian") throw new HttpError(400, "A parent or guardian must consent for players under 18");
    if (p.ageGroup !== "adult" && process.env.ALLOW_MINOR_PHOTOS !== "true") throw new HttpError(403, "Selfies are turned off for players under 18 at this event.");
    const bytes = Buffer.from(await req.arrayBuffer());
    if (bytes.length < 1000 || bytes.length > MAX) throw new HttpError(413, "Photo must be under 2 MB");
    const stripped = stripJpegMetadata(bytes);
    if (!stripped) throw new HttpError(415, "Photo must be a valid JPEG");
    const clean = Buffer.from(stripped);
    let mod: { ok: boolean; reason?: string };
    try { mod = await moderatePhoto(clean); }
    catch { throw new HttpError(503, "Could not safety-check the photo right now. Please try again."); }
    if (!mod.ok) throw new HttpError(422, mod.reason ?? "Photo not accepted");
    const key = `${code}/selfies/${randomBytes(8).toString("base64url")}.jpg`;
    await getMediaStore().put(key, clean, "image/jpeg");
    try { await mutate(code, (r) => queueSelfie(r, authPlayer(r, p.id, p.token), style.id, key)); }
    catch (e) { await getMediaStore().deletePrefix(key).catch(() => {}); throw e; }
    return json({ ok: true });
  });
}
