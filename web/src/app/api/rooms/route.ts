import { hostIdFromSession } from "@/auth";
import { createRoom } from "@/lib/engine";
import { handle, json } from "@/lib/http";
import { HttpError } from "@/lib/store";
import type { GameConfig, MediaPlan } from "@/lib/types";

export async function POST(req: Request) {
  return handle(async () => {
    const hostId = await hostIdFromSession();
    if (!hostId) throw new HttpError(401, "Sign in to host a game");
    const body = (await req.json()) as { overrideCode?: string; config?: Partial<GameConfig>; capUsd?: number; plan?: Partial<MediaPlan> };
    const room = await createRoom(hostId, body.overrideCode ?? "", body.config, body.capUsd, body.plan);
    return json({ code: room.code });
  });
}
