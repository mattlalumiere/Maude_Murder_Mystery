import { hostIdFromSession } from "@/auth";
import { handle, json } from "@/lib/http";
import { reportStory } from "@/lib/stories";
import { HttpError } from "@/lib/store";

/** Signed-in report. Three reports hide a story from the gallery until the owner or an admin reviews it. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const hostId = await hostIdFromSession();
    if (!hostId) throw new HttpError(401, "Sign in to report a story");
    await reportStory(id, hostId);
    return json({ ok: true });
  });
}
