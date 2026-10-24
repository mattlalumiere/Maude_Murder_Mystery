import { hostIdFromSession } from "@/auth";
import { createRoom } from "@/lib/engine";
import { handle, json } from "@/lib/http";
import { engagementOf, getStoryMeta, ownerKeyOf, STORY_LIMITS } from "@/lib/stories";
import { HttpError } from "@/lib/store";
import type { GameConfig, MediaPlan } from "@/lib/types";

export async function POST(req: Request) {
  return handle(async () => {
    const hostId = await hostIdFromSession();
    if (!hostId) throw new HttpError(401, "Sign in to host a game");
    const body = (await req.json()) as { overrideCode?: string; config?: Partial<GameConfig>; capUsd?: number; plan?: Partial<MediaPlan>; storyId?: string; storyMode?: string };
    let story: { id: string; mode: "random" | "choose" } | undefined;
    if (body.storyId) {
      const meta = await getStoryMeta(String(body.storyId));
      if (!meta) throw new HttpError(404, "That saved story was not found");
      if (meta.ownerKey !== ownerKeyOf(hostId) && (await engagementOf(meta.id)).reports >= STORY_LIMITS.reportHideThreshold) throw new HttpError(404, "That saved story was not found");
      if (meta.adultsOnly && !(body.config?.adultsOnly === true && body.config?.adultsAttested === true)) throw new HttpError(400, "That story is adults only. Turn on adults-only mode (and confirm everyone is 18 or older) to play it.");
      story = { id: meta.id, mode: meta.kind === "cast" && body.storyMode === "choose" ? "choose" : "random" };
    }
    const room = await createRoom(hostId, body.overrideCode ?? "", body.config, body.capUsd, body.plan, { story });
    return json({ code: room.code });
  });
}
