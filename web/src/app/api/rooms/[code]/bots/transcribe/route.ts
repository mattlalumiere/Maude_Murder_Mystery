import { usesLocal } from "@/lib/ai/mode";
import { localTranscribe } from "@/lib/ai/local";
import { LocalAiError } from "@/lib/ai/mcp-client";
import { authPlayer } from "@/lib/engine";
import { cleanLine } from "@/lib/bots";
import { handle, json } from "@/lib/http";
import { getStore, HttpError } from "@/lib/store";

export const maxDuration = 60;
const MAX = 2 * 1024 * 1024;

/**
 * Turns a short voice recording into text with the local speech model, so the voice never leaves the host's own machine.
 * Grown-ups only, and only for games that chose local AI services.
 */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = (await ctx.params).code.toUpperCase();
    const room = await getStore().get(code);
    if (!room) throw new HttpError(404, "Room not found");
    if (!usesLocal(room)) throw new HttpError(404, "Voice input on the server is not turned on for this game");
    const p = authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"));
    if (p.isBot || p.ageGroup !== "adult") throw new HttpError(403, "Voice input is for grown-ups. Type your message instead.");
    const type = (req.headers.get("content-type") ?? "").split(";")[0];
    if (!/^audio\/(webm|ogg|wav|x-wav|mp4|mpeg)$/.test(type)) throw new HttpError(415, "Send a short audio recording");
    const audio = Buffer.from(await req.arrayBuffer());
    if (audio.length < 200 || audio.length > MAX) throw new HttpError(413, "Recording must be a few seconds long");
    try {
      const text = cleanLine(await localTranscribe(audio, type), 300);
      if (!text) throw new HttpError(422, "I could not make that out. Try again or type it.");
      return json({ text });
    } catch (e) {
      if (e instanceof LocalAiError) throw new HttpError(503, "The local speech service is not responding");
      throw e;
    }
  });
}
