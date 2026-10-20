import { hostIdFromSession } from "@/auth";
import { addPlayer, advance, authPlayer, override, purgePhotos, removePhoto, setPlan, startGame, submitBallot, type OverrideCmd } from "@/lib/engine";
import { handle, json } from "@/lib/http";
import { HttpError, mutate } from "@/lib/store";
import type { AgeGroup, Ballot, MediaPlan } from "@/lib/types";

type Body =
  | { type: "start" }
  | { type: "advance" }
  | { type: "pause" | "resume" }
  | { type: "addPlayer"; name: string; ageGroup: AgeGroup }
  | { type: "kick"; playerId: string }
  | { type: "override"; code: string; cmd: OverrideCmd; confirm?: boolean }
  | { type: "setPlan"; plan?: Partial<MediaPlan>; capUsd?: number }
  | { type: "purgePhotos" }
  | { type: "removePhoto" }
  | { type: "ready" }
  | { type: "ballot"; ballot: Ballot };

const HOST_ACTIONS = new Set(["start", "advance", "pause", "resume", "addPlayer", "kick", "override", "setPlan", "purgePhotos"]);

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const body = (await req.json()) as Body;
    const isHost = HOST_ACTIONS.has(body.type);
    const hostId = isHost ? await hostIdFromSession() : null;
    let out: unknown = { ok: true };

    // Override failures must persist the failure counter, so they are captured instead of thrown through mutate().
    let deferredError = null as HttpError | null;
    await mutate(code.toUpperCase(), async (room) => {
      if (isHost && hostId !== room.hostId) throw new HttpError(403, "Not the host");
      switch (body.type) {
        case "start": await startGame(room); break;
        case "advance": advance(room); break;
        case "pause": room.paused = true; break;
        case "resume": room.paused = false; break;
        case "addPlayer": {
          const p = addPlayer(room, body.name, body.ageGroup, false, false);
          out = { playerId: p.id, token: p.token };
          break;
        }
        case "kick": room.players = room.players.filter((p) => p.id !== body.playerId); break;
        case "override":
          try { out = override(room, body.code, body.cmd, !!body.confirm); }
          catch (e) { if (e instanceof HttpError) deferredError = e as HttpError; else throw e; }
          break;
        case "setPlan": setPlan(room, body.plan, body.capUsd); break;
        case "purgePhotos": await purgePhotos(room); break;
        case "removePhoto": await removePhoto(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"))); break;
        case "ready": authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")).ready = true; break;
        case "ballot": submitBallot(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")), body.ballot); break;
        default: throw new HttpError(400, "Unknown action");
      }
    });
    if (deferredError) throw deferredError;
    return json(out);
  });
}
