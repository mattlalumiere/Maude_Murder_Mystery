// Fast population of started games through the real routes (used by micro benchmarks and failure tests).
import { api } from "./api";
import { ROSTER16 } from "./roster";

export interface SeededGame {
  i: number; host: string; code: string;
  players: { pid: string; token: string; name: string }[];
}

export async function seedGame(i: number, opts: { start?: boolean; advanceTo?: number; players?: number } = {}): Promise<SeededGame> {
  const host = `host-${i}`;
  const c = await api.create(host, { overrideCode: `vault-${i}-secret`, config: { name: `Party-g${i}` } });
  if (c.status !== 200) throw new Error(`create failed ${c.status} ${c.text}`);
  const code = c.json<{ code: string }>().code;
  const players: SeededGame["players"] = [];
  for (const r of ROSTER16.slice(0, opts.players ?? 16)) {
    const name = `${r.name}-g${i}`;
    const j = await api.join(code, { name, ageGroup: r.ageGroup });
    if (j.status !== 200) throw new Error(`join failed ${j.status} ${j.text}`);
    const b = j.json<{ playerId: string; token: string }>();
    players.push({ pid: b.playerId, token: b.token, name });
  }
  if (opts.start !== false) {
    const s = await api.action(code, { type: "start" }, { host });
    if (s.status !== 200) throw new Error(`start failed ${s.status} ${s.text}`);
    for (let k = 0; k < (opts.advanceTo ?? 0); k++) {
      const a = await api.action(code, { type: "advance" }, { host });
      if (a.status !== 200) throw new Error(`advance failed ${a.status} ${a.text}`);
    }
  }
  return { i, host, code, players };
}

/** Phases after start: cards(0) act1(1) death(2) act2(3) intermission(4) act3(5) act4(6) reveal(7). */
export const TO_ACT4 = 6;
