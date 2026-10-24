import { hostIdFromSession } from "@/auth";
import { handle, json } from "@/lib/http";
import { saveStory, type SaveOptions } from "@/lib/stories";
import { getStore, HttpError } from "@/lib/store";

export const maxDuration = 60;

/** Host only: saves this game's story (and optionally a recap) to the library, optionally to the public gallery. */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = (await ctx.params).code.toUpperCase();
    const hostId = await hostIdFromSession();
    const room = await getStore().get(code);
    if (!room) throw new HttpError(404, "Room not found");
    if (!hostId || hostId !== room.hostId) throw new HttpError(403, "Not the host");
    const b = (await req.json().catch(() => ({}))) as Partial<SaveOptions>;
    const { id, meta } = await saveStory(room, hostId, {
      kind: b.kind === "cast" ? "cast" : "story",
      visibility: b.visibility === "public" ? "public" : "link",
      title: typeof b.title === "string" ? b.title : undefined,
      blurb: typeof b.blurb === "string" ? b.blurb : undefined,
      includeRecap: !!b.includeRecap, recapNames: !!b.recapNames, recapPictures: !!b.recapPictures,
    });
    return json({ id, title: meta.title, visibility: meta.visibility, kind: meta.kind, hasRecap: meta.hasRecap });
  });
}
