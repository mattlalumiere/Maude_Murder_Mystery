import { hostIdFromSession } from "@/auth";
import { textModelFor } from "@/lib/ai/route";
import { addBots, addPlayer, advance, authPlayer, beginGeneration, drinkAnswer, drinkControl, drinkDone, drinkLog, drinkWater, kickPlayer, override, photosCanBePurged, purgePhotos, removePhoto, saveNotes, setBotConfig, setPlan, startGame, submitBallot, type OverrideCmd } from "@/lib/engine";
import { handle, json } from "@/lib/http";
import { dropAvatar, regenAvatar } from "@/lib/media-jobs";
import { answerCall, endCall, startCall } from "@/lib/calls";
import { hostNext, setReady, voteSkip } from "@/lib/rounds";
import { deleteSelfie, regenSelfie } from "@/lib/selfie";
import { getStore, HttpError, mutate } from "@/lib/store";
import type { AgeGroup, Ballot, MediaPlan } from "@/lib/types";

type Body =
  | { type: "start" }
  | { type: "advance"; intermission?: boolean }
  | { type: "pause" | "resume" }
  | { type: "addPlayer"; name: string; ageGroup: AgeGroup }
  | { type: "kick"; playerId: string }
  | { type: "override"; code: string; cmd: OverrideCmd; confirm?: boolean }
  | { type: "setPlan"; plan?: Partial<MediaPlan>; capUsd?: number }
  | { type: "addBots"; count: number; style?: string }
  | { type: "setBotConfig"; chatter?: boolean; voice?: boolean }
  | { type: "drink"; promptId: string; answer: "drank" | "tapped" }
  | { type: "logDrink" | "water" | "doneForNight" }
  | { type: "drinkControl"; op: string }
  | { type: "purgePhotos" }
  | { type: "removePhoto" }
  | { type: "saveNotes"; notes: string }
  | { type: "ready"; ready?: boolean }
  | { type: "skipIntermission"; skip?: boolean }
  | { type: "deleteSelfie" | "regenSelfie"; id: string; style?: string }
  | { type: "regenPortrait" | "deletePortrait" }
  | { type: "startCall"; to: string; offer: string }
  | { type: "answerCall"; id: string; answer: string }
  | { type: "endCall"; id: string }
  | { type: "ballot"; ballot: Ballot };

const HOST_ACTIONS = new Set(["start", "advance", "pause", "resume", "addPlayer", "kick", "override", "setPlan", "purgePhotos", "addBots", "setBotConfig", "drinkControl"]);

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
        case "start": {
          // Serverless (ASYNC_START=true, set by sst.config.ts) splits Start so a slow AI call cannot hit the function timeout:
          // this request only claims the room and the host tab then calls /generate. Everywhere else Start stays one request.
          if (process.env.ASYNC_START === "true" && textModelFor(room) && !room.storyId) { beginGeneration(room); out = { generating: true }; }
          else { await startGame(room); out = { generating: false }; }
          break;
        }
        // The host console asks for the intermission; a bare "advance" moves on at once (kept for scripts and tests).
        case "advance": if (body.intermission) hostNext(room); else advance(room); break;
        case "pause": room.paused = true; break;
        case "resume": room.paused = false; break;
        case "addPlayer": {
          const p = addPlayer(room, body.name, body.ageGroup, false, false);
          out = { playerId: p.id, token: p.token };
          break;
        }
        case "kick": await kickPlayer(room, body.playerId); break;
        case "override":
          try { out = override(room, body.code, body.cmd, !!body.confirm); }
          catch (e) { if (e instanceof HttpError) deferredError = e as HttpError; else throw e; }
          break;
        case "setPlan": setPlan(room, body.plan, body.capUsd); break;
        case "addBots": addBots(room, body.count, body.style); break;
        case "setBotConfig": setBotConfig(room, body); break;
        case "drink": drinkAnswer(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")), body.promptId, body.answer); break;
        case "logDrink": drinkLog(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"))); break;
        case "water": drinkWater(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"))); break;
        case "doneForNight": drinkDone(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"))); break;
        case "drinkControl": drinkControl(room, body.op); break;
        case "purgePhotos": await purgePhotos(room); break;
        case "removePhoto": await removePhoto(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"))); break;
        case "saveNotes": saveNotes(authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")), body.notes); break;
        case "deleteSelfie": await deleteSelfie(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")), String(body.id)); break;
        case "regenSelfie": regenSelfie(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")), String(body.id), body.style); break;
        case "regenPortrait": await regenAvatar(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"))); break;
        case "deletePortrait": await dropAvatar(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token"))); break;
        case "startCall": out = { callId: startCall(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")), String(body.to), body.offer).id }; break;
        case "answerCall": answerCall(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")), String(body.id), body.answer); break;
        case "endCall": endCall(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")), String(body.id)); break;
        case "skipIntermission": voteSkip(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")), body.skip !== false); break;
        case "ready": setReady(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")), body.ready !== false); break;
        case "ballot": submitBallot(room, authPlayer(room, req.headers.get("x-player-id"), req.headers.get("x-player-token")), body.ballot); break;
        default: throw new HttpError(400, "Unknown action");
      }
    });
    if (deferredError) throw deferredError;
    // Retention: once the reveal is reached and no art job still needs the photos, delete them.
    if (body.type === "advance" || body.type === "override" || body.type === "start") {
      const cur = await getStore().get(code.toUpperCase());
      if (cur && photosCanBePurged(cur)) await mutate(code.toUpperCase(), async (room) => { if (photosCanBePurged(room)) await purgePhotos(room); });
    }
    return json(out);
  });
}
