import { authPlayer } from "@/lib/engine";
import { addressedBot, postBotChat, postChat } from "@/lib/chat";
import { runBotChat } from "@/lib/bots";
import { handle, json } from "@/lib/http";
import { getStore, HttpError, mutate } from "@/lib/store";

export const maxDuration = 60;

/** Posts to the table chat. An AI guest who is addressed by name answers in the chat too (and by voice if the player has voices on). */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = (await ctx.params).code.toUpperCase();
    const room = await getStore().get(code);
    if (!room) throw new HttpError(404, "Room not found");
    const me = authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"));
    if (me.isBot) throw new HttpError(403, "Not allowed");
    const body = (await req.json().catch(() => ({}))) as { text?: unknown };
    if (typeof body.text !== "string") throw new HttpError(400, "A message is required");
    const { result: posted } = await mutate(code, (r) => {
      const msg = postChat(r, authPlayer(r, me.id, me.token), body.text as string);
      return { msg, bot: r.phase !== "lobby" && r.phase !== "cards" ? addressedBot(r, msg.text) : null };
    });
    let line: Awaited<ReturnType<typeof runBotChat>> | undefined;
    if (posted.bot) {
      try {
        line = await runBotChat(code, posted.bot.id, { id: me.id, name: me.name }, posted.msg.text);
        await mutate(code, (r) => { const bot = r.players.find((x) => x.id === posted.bot!.id); if (bot) postBotChat(r, bot, line!.text); });
      } catch { /* the guest stays quiet; the player's message is already on the table */ }
    }
    return json({ ok: true, reply: line ? { id: line.id, botId: line.botId, speaker: line.speaker, text: line.text, kind: line.kind, to: line.to, phase: line.phase, audio: !!line.audioKey, ts: line.ts } : undefined });
  });
}
