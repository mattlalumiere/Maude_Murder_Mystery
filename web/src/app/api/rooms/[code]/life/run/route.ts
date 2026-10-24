import { hostIdFromSession } from "@/auth";
import { handle, json } from "@/lib/http";
import { runLifeTick } from "@/lib/life";
import { getStore, HttpError } from "@/lib/store";

export const maxDuration = 120;

/** One tick of the life-story writer. Called by the host console (or any joined player). */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = (await ctx.params).code.toUpperCase();
    const room = await getStore().get(code);
    if (!room) throw new HttpError(404, "Room not found");
    const isHost = (await hostIdFromSession()) === room.hostId;
    const pid = req.headers.get("x-player-id"), tok = req.headers.get("x-player-token");
    if (!isHost && !room.players.some((p) => !p.isBot && p.id === pid && p.token === tok)) throw new HttpError(403, "Not allowed");
    return json(await runLifeTick(code));
  });
}
