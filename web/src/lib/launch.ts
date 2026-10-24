// Progress of "launching" a game: writing the mystery, casting the characters, painting the portraits, ready.
// Derived from the room, so every phone, the TV and the host see the same thing.
import { getRuntime } from "./ids";
import type { Room } from "./types";

export interface LaunchStep { id: "guests" | "story" | "cast" | "lives" | "portraits" | "ready"; label: string; state: "done" | "active" | "pending"; detail?: string }
export interface LaunchView { percent: number; steps: LaunchStep[]; elapsedMs: number | null; done: boolean; paused: boolean }

const FINISHED = new Set(["done", "failed", "skipped"]);

/** Null when nothing is launching (still gathering guests, or the story is under way). */
export function launchView(room: Room): LaunchView | null {
  const writing = !!room.generating && room.phase === "lobby";
  if (!writing && room.phase !== "cards") return null;

  const avatars = room.media.filter((m) => m.kind === "avatar");
  const wanted = room.budget.plan.avatars && avatars.length > 0;
  const finished = avatars.filter((m) => FINISHED.has(m.status)).length;
  const portraitsDone = !wanted || finished >= avatars.length;
  const paused = wanted && !portraitsDone && room.budget.plan.paused;
  const lives = !writing && room.life ? { done: room.life.done.length, total: room.life.total } : null;
  const elapsed = writing ? Math.max(0, getRuntime().clock.now() - (room.generating as number)) : null;

  const steps: LaunchStep[] = [
    { id: "guests", label: "Guests gathered", state: "done" },
    { id: "story", label: "Writing the mystery", state: writing ? "active" : "done" },
    { id: "cast", label: "Casting the suspects", state: writing ? "pending" : "done" },
    ...(lives ? [{ id: "lives" as const, label: "Embellishing the life stories", state: "active" as const, detail: `${lives.done} of ${lives.total}` }] : []),
    {
      id: "portraits", label: "Painting the portraits",
      state: writing || lives ? "pending" : portraitsDone ? "done" : "active",
      detail: writing || !wanted ? undefined : portraitsDone ? undefined : paused ? "paused by the host" : `${finished} of ${avatars.length}`,
    },
    { id: "ready", label: "Ready: open your card", state: !writing && !lives && portraitsDone ? "done" : "pending" },
  ];

  // The first step takes an unknown time, so its bar creeps toward 40 percent instead of pretending to know.
  const percent = writing
    ? Math.round(5 + 35 * (1 - Math.exp(-(elapsed ?? 0) / 60_000)))
    : lives ? Math.round(50 + 20 * (lives.total ? lives.done / lives.total : 1))
    : portraitsDone ? 100 : Math.round(room.life === undefined && wanted ? 50 + 45 * (avatars.length ? finished / avatars.length : 1) : 50);
  return { percent, steps, elapsedMs: elapsed, done: !writing && !lives && portraitsDone, paused };
}
