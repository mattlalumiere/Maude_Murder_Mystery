import { handle, json } from "@/lib/http";
import { getStoryMeta } from "@/lib/stories";
import { getStore, HttpError } from "@/lib/store";

/** Characters a joining player can pick from, when this game replays a choose-your-character story. No secrets here. */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = (await ctx.params).code.toUpperCase();
    const room = await getStore().get(code);
    if (!room || room.storyMode !== "choose" || !room.storyId) throw new HttpError(404, "No character choice in this game");
    const meta = await getStoryMeta(room.storyId);
    if (!meta?.characters) throw new HttpError(404, "No character choice in this game");
    const claimed = new Set(room.players.map((p) => p.wantsCharacter).filter(Boolean));
    return json({ title: meta.title, characters: meta.characters.map((c) => ({ ...c, taken: claimed.has(c.id) })) });
  });
}
