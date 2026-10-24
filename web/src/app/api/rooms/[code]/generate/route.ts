import { hostIdFromSession } from "@/auth";
import { finishGeneration, generationDeadlineMs, generationRoster } from "@/lib/engine";
import { caseOptionsFor } from "@/lib/ai/route";
import { generateCase } from "@/lib/gm-ai";
import { handle, json } from "@/lib/http";
import { getStore, HttpError, mutate } from "@/lib/store";

export const maxDuration = 60;

/**
 * Second half of "Start": writes the mystery. Host only. If the AI is slower than the deadline (or fails),
 * the built-in sample case is used so the request always finishes inside a 60 s function limit.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = (await ctx.params).code.toUpperCase();
    const room = await getStore().get(code);
    if (!room) throw new HttpError(404, "Room not found");
    if ((await hostIdFromSession()) !== room.hostId) throw new HttpError(403, "Not the host");
    if (room.phase !== "lobby" || !room.generating) return json({ ok: true, alreadyDone: room.phase !== "lobby" });

    const deadline = generationDeadlineMs();
    const roster = generationRoster(room);
    const sample = () => generateCase(roster, room.config, { model: null });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const gen = await Promise.race([
      generateCase(roster, room.config, { gameId: code, ...caseOptionsFor(room), timeoutMs: Math.max(3_000, deadline - 5_000) }).catch(() => sample()),
      new Promise<Awaited<ReturnType<typeof generateCase>>>((resolve) => { timer = setTimeout(() => sample().then(resolve), deadline); }),
    ]);
    if (timer) clearTimeout(timer);

    const { result } = await mutate(code, (r) => finishGeneration(r, gen));
    return json({ ok: true, applied: result, source: gen.source });
  });
}
