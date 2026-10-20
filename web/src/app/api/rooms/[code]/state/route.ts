import { hostIdFromSession } from "@/auth";
import { authPlayer, hostView, playerView, publicView } from "@/lib/engine";
import { handle, json } from "@/lib/http";
import { getStore, HttpError } from "@/lib/store";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const url = new URL(req.url);
    const room = await getStore().get(code.toUpperCase());
    if (!room) throw new HttpError(404, "Room not found");
    const role = url.searchParams.get("role") ?? "screen";
    const since = Number(url.searchParams.get("v") ?? -1);
    if (since === room.version) return json({ unchanged: true, version: room.version });
    if (role === "host") {
      if ((await hostIdFromSession()) !== room.hostId) throw new HttpError(403, "Not the host");
      return json(hostView(room));
    }
    if (role === "player") {
      const p = authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"));
      return json(playerView(room, p));
    }
    return json(publicView(room));
  });
}
