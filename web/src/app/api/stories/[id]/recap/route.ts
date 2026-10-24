import { handle, json } from "@/lib/http";
import { getRecap, getStoryMeta } from "@/lib/stories";
import { HttpError } from "@/lib/store";

/** The recap contains the ending. Callers show it behind a spoiler gate. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const meta = await getStoryMeta(id);
    const recap = meta?.hasRecap ? await getRecap(id) : null;
    if (!recap) throw new HttpError(404, "No recap for this story");
    return json({ recap });
  });
}
