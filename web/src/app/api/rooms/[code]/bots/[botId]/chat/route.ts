import { authPlayer } from "@/lib/engine";
import { handle, json } from "@/lib/http";
import { runBotChat } from "@/lib/bots";
import { getStore, HttpError } from "@/lib/store";

export const maxDuration = 60;

/** A joined player says something to an AI guest and gets an in-character reply (text, plus audio when the voice service is on). */
export async function POST(req: Request, ctx: { params: Promise<{ code: string; botId: string }> }) {
  return handle(async () => {
    const { code: raw, botId } = await ctx.params;
    const code = raw.toUpperCase();
    const room = await getStore().get(code);
    if (!room) throw new HttpError(404, "Room not found");
    const asker = authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"));
    if (asker.isBot) throw new HttpError(403, "Not allowed");
    const body = (await req.json().catch(() => ({}))) as { message?: unknown };
    if (typeof body.message !== "string") throw new HttpError(400, "A message is required");
    const line = await runBotChat(code, botId, { id: asker.id, name: asker.name }, body.message);
    return json({ line: { id: line.id, botId: line.botId, speaker: line.speaker, text: line.text, kind: line.kind, to: line.to, phase: line.phase, audio: !!line.audioKey, ts: line.ts } });
  });
}
