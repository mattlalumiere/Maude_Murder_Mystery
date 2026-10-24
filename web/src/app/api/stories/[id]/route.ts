import { hostIdFromSession } from "@/auth";
import { handle, json } from "@/lib/http";
import { deleteStory, engagementOf, getStoryMeta, ownerKeyOf, STORY_LIMITS } from "@/lib/stories";
import { HttpError } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const meta = await getStoryMeta(id);
    if (!meta) throw new HttpError(404, "Story not found");
    const hostId = await hostIdFromSession();
    const eng = await engagementOf(id);
    const mine = !!hostId && ownerKeyOf(hostId) === meta.ownerKey;
    if (!mine && eng.reports >= STORY_LIMITS.reportHideThreshold) throw new HttpError(404, "Story not found");
    const { ownerKey: _o, ...pub } = meta;
    return json({ story: pub, engagement: eng, mine, signedIn: !!hostId });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const hostId = await hostIdFromSession();
    if (!hostId) throw new HttpError(401, "Sign in first");
    await deleteStory(hostId, id);
    return json({ ok: true });
  });
}
