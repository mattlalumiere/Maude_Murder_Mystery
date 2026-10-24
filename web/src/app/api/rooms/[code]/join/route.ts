import { addPlayer } from "@/lib/engine";
import { handle, json } from "@/lib/http";
import { getStoryMeta } from "@/lib/stories";
import { getStore, HttpError, mutate } from "@/lib/store";
import type { AgeGroup, PlayerProfile } from "@/lib/types";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const b = (await req.json()) as { name?: string; ageGroup?: AgeGroup; wantsVictim?: boolean; profile?: Partial<PlayerProfile>; characterChoice?: string; pronouns?: string };
    // A character request only counts for choose-your-character stories, and only for a character that story really has.
    let choice: string | undefined;
    if (typeof b.characterChoice === "string" && b.characterChoice) {
      const room = await getStore().get(code.toUpperCase());
      if (room?.storyMode === "choose" && room.storyId) {
        const meta = await getStoryMeta(room.storyId);
        if (!meta?.characters?.some((c) => c.id === b.characterChoice)) throw new HttpError(400, "That character is not in this story");
        choice = b.characterChoice;
      }
    }
    const { result } = await mutate(code.toUpperCase(), (room) =>
      addPlayer(room, b.name ?? "", b.ageGroup ?? "adult", !!b.wantsVictim, true, b.profile, choice, b.pronouns),
    );
    return json({ playerId: result.id, token: result.token });
  });
}
