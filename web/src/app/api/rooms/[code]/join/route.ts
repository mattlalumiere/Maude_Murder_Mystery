import { addPlayer } from "@/lib/engine";
import { handle, json } from "@/lib/http";
import { mutate } from "@/lib/store";
import type { AgeGroup } from "@/lib/types";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const b = (await req.json()) as { name?: string; ageGroup?: AgeGroup; wantsVictim?: boolean };
    const { result } = await mutate(code.toUpperCase(), (room) =>
      addPlayer(room, b.name ?? "", b.ageGroup ?? "adult", !!b.wantsVictim),
    );
    return json({ playerId: result.id, token: result.token });
  });
}
