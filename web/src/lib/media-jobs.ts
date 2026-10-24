import { randomBytes } from "node:crypto";
import { pricesForRoom } from "./ai/route";
import { portraitLook } from "./backstory";
import { imageCost, SCENE_PHASES, VIDEO_PHASES, videoCost } from "./budget";
import type { MediaItem, Phase, Player, Room } from "./types";
import { PHASE_INFO } from "./types";

const STYLE = "Colorful storybook cartoon illustration for a family-friendly murder mystery comedy, warm lighting, expressive faces, no gore, no text or letters.";

function push(room: Room, m: Omit<MediaItem, "id" | "status" | "createdAt">) {
  room.media.push({ ...m, id: randomBytes(8).toString("base64url"), status: "queued", createdAt: Date.now() });
}

const charOf = (room: Room, p: Player) => room.case!.characters.find((c) => c.id === p.characterId);
const hasRef = (p: Player) => !!p.profile.photoKey && p.profile.consent !== "none";

export function queueAvatars(room: Room, only?: Player[]) {
  const plan = room.budget.plan;
  if (!plan.avatars) return;
  for (const p of only ?? room.players) {
    const c = charOf(room, p);
    if (!c) continue;
    if (room.media.some((m) => m.kind === "avatar" && m.playerIds[0] === p.id)) continue; // one portrait per player
    // No names go to image models: the occupation and the public look are enough.
    push(room, {
      kind: "avatar", phase: "cards", playerIds: [p.id], caption: c.name,
      prompt: `${STYLE} Friendly head-and-shoulders portrait of a ${c.title ?? "party guest"}: ${portraitLook(c)}. ${c.kid ? "A child character, G-rated." : "An adult character."}`,
      estCostUsd: imageCost(plan.quality, pricesForRoom(room)),
    });
  }
}

function pickPlayers(room: Room, phase: Phase, n: number): Player[] {
  const k = room.case!;
  const byChar = (id: string) => room.players.find((p) => p.characterId === id);
  const first: Player[] = [];
  if (phase === "death" || phase === "reveal") { const v = byChar(k.victimId); if (v) first.push(v); }
  if (phase === "reveal") { const kl = byChar(k.killerId); if (kl) first.push(kl); }
  const rest = room.players
    .filter((p) => !first.includes(p))
    .sort((a, b) => Number(hasRef(b)) - Number(hasRef(a)) || ((a.id + phase).localeCompare(b.id + phase)));
  return [...first, ...rest].slice(0, n);
}

export function queuePhaseMedia(room: Room, phase: Phase) {
  const plan = room.budget.plan;
  const k = room.case!;
  const setting = k.setting.split(/(?<=[.!?])\s/)[0] ?? "";
  const scene = (extra: string, who: Player[]) => {
    const cast = who.map((p) => { const c = charOf(room, p); return c ? `a ${c.title ?? "guest"} (${portraitLook(c)})` : ""; }).filter(Boolean).join("; ");
    return `${STYLE} ${setting} ${extra} Featuring: ${cast}.`.slice(0, 1000);
  };
  const beat: Partial<Record<Phase, string>> = {
    act1: k.narration.act1 ?? "", death: k.narration.death ?? "A birthday toast goes comically wrong with a banana peel.",
    act2: "Guests whisper and point at clues in a grand parlor.", act3: k.twist,
    act4: "Everyone gathers dramatically in a circle to accuse each other.",
    reveal: `The guilty party, ${k.characters.find((c) => c.id === k.killerId)?.name}, is revealed with a comical gasp from the whole room.`,
  };

  if ((SCENE_PHASES as readonly string[]).includes(phase)) {
    for (let i = 0; i < plan.scenesPerAct; i++) {
      const who = pickPlayers(room, phase, 3 + (i % 2));
      push(room, {
        kind: "scene", phase, playerIds: who.map((p) => p.id), caption: `${PHASE_INFO[phase].title}`,
        prompt: scene(beat[phase] ?? "", who), estCostUsd: imageCost(plan.quality, pricesForRoom(room)),
      });
    }
  }
  const vi = (VIDEO_PHASES as readonly string[]).indexOf(phase);
  if (vi >= 0 && vi < plan.videoClips) {
    const who = pickPlayers(room, phase, 2);
    push(room, {
      kind: "video", phase, playerIds: who.map((p) => p.id), caption: `${PHASE_INFO[phase].title} (clip)`,
      prompt: scene(beat[phase] ?? "", who).replace(STYLE, "Short animated cartoon clip, family-friendly, gentle camera move,"),
      estCostUsd: videoCost(pricesForRoom(room)),
    });
  }
}

/** After a plan change: skip queued items that no longer fit and reprice the rest. */
export function reconcilePlan(room: Room) {
  const plan = room.budget.plan;
  const skip = (m: MediaItem, why: string) => { m.status = "skipped"; m.note = why; };
  const perPhase: Record<string, number> = {};
  for (const m of room.media) {
    if (m.status !== "queued") { if (m.kind === "scene" && m.status !== "skipped") perPhase[m.phase] = (perPhase[m.phase] ?? 0) + 1; continue; }
    if (m.kind === "avatar") { if (!plan.avatars) skip(m, "Removed from plan"); else m.estCostUsd = imageCost(plan.quality, pricesForRoom(room)); }
    if (m.kind === "scene") {
      perPhase[m.phase] = (perPhase[m.phase] ?? 0) + 1;
      if (perPhase[m.phase] > plan.scenesPerAct) skip(m, "Removed from plan"); else m.estCostUsd = imageCost(plan.quality, pricesForRoom(room));
    }
    if (m.kind === "video") {
      const vi = (VIDEO_PHASES as readonly string[]).indexOf(m.phase);
      if (vi < 0 || vi >= plan.videoClips) skip(m, "Removed from plan");
    }
  }
}
