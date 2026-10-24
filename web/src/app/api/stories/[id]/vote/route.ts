import { hostIdFromSession } from "@/auth";
import { handle, json } from "@/lib/http";
import { setVote } from "@/lib/stories";
import { getStore, HttpError } from "@/lib/store";

async function who(req: Request, id: string) {
  const hostId = await hostIdFromSession();
  if (hostId) return { account: hostId };
  // Guests who played this story can vote from their phone once the game has reached the reveal.
  const pid = req.headers.get("x-player-id"), tok = req.headers.get("x-player-token");
  const code = (req.headers.get("x-room") ?? "").toUpperCase();
  if (pid && tok && code) {
    const room = await getStore().get(code);
    const p = room?.players.find((x) => x.id === pid && x.token === tok && !x.isBot);
    if (room && p && room.storyId === id && room.phase === "reveal") return { player: { room: room.code, player: p.id } };
  }
  throw new HttpError(401, "Sign in, or vote from the phone you played on after the reveal");
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => { const { id } = await ctx.params; return json({ engagement: await setVote(id, await who(req, id), true) }); });
}
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => { const { id } = await ctx.params; return json({ engagement: await setVote(id, await who(req, id), false) }); });
}
