import { hostIdFromSession } from "@/auth";
import { handle, json } from "@/lib/http";
import { runBotTick } from "@/lib/bots";
import { getStore, HttpError } from "@/lib/store";

export const maxDuration = 60;

/** One tick of the AI guests' story-beat chatter. Called by the host console (or a joined player). Spend is capped server-side. */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = (await ctx.params).code.toUpperCase();
    const room = await getStore().get(code);
    if (!room) throw new HttpError(404, "Room not found");
    const isHost = (await hostIdFromSession()) === room.hostId;
    const pid = req.headers.get("x-player-id"), tok = req.headers.get("x-player-token");
    const isPlayer = room.players.some((p) => !p.isBot && p.id === pid && p.token === tok);
    if (!isHost && !isPlayer) throw new HttpError(403, "Not allowed");
    const r = await runBotTick(code);
    return json({ ran: r.ran });
  });
}
