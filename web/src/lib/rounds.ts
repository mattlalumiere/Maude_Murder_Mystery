// Moving between rounds: each player taps ready (and may take it back once per round). When everyone is ready, or two thirds
// are ready and a countdown runs out, the table gets a short intermission while the next round's pictures render, then the
// story moves on. Bots and players without a phone never block the table.
import { advance } from "./engine";
import { queuePhaseMedia } from "./media-jobs";
import { HttpError } from "./store";
import { PHASES, PHASE_INFO } from "./types";
import type { Phase, Player, Room } from "./types";

const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
export const READY_COUNTDOWN_MS = () => num(process.env.READY_COUNTDOWN_MS, 120_000);
export const INTERMISSION_MIN_MS = () => num(process.env.INTERMISSION_MIN_MS, 20_000);
export const INTERMISSION_MAX_MS = () => num(process.env.INTERMISSION_MAX_MS, 90_000);
export const READY_FRACTION = 2 / 3;

/** Rounds where "ready" means something: from the cards to the accusations. */
export const READY_PHASES: Phase[] = ["cards", "act1", "death", "act2", "intermission", "act3", "act4"];

export const eligible = (room: Room): Player[] => room.players.filter((p) => !p.isBot && p.hasDevice);
const needed = (n: number) => Math.ceil(n * READY_FRACTION);
const now = () => Date.now();

export function readyCounts(room: Room) {
  const e = eligible(room);
  return { ready: e.filter((p) => p.ready).length, total: e.length, needed: needed(e.length) };
}

/** Media that the intermission waits for (pictures and clips for the next round, portraits). Selfies never hold the table. */
export function pendingArt(room: Room): number {
  if (room.budget.plan.paused) return 0;
  return room.media.filter((m) => m.kind !== "selfie" && (m.status === "queued" || m.status === "running" || m.status === "polling")).length;
}

/** Called whenever a round starts. */
export function resetRound(room: Room) {
  for (const p of room.players) if (!p.isBot) p.ready = false;
  room.readyUndo = undefined;
  room.readyDeadline = undefined;
  room.transition = undefined;
}

export function setReady(room: Room, p: Player, on: boolean) {
  if (!READY_PHASES.includes(room.phase)) throw new HttpError(409, "Nothing to get ready for right now");
  if (room.transition) throw new HttpError(409, "Intermission is under way. You can get ready for the next round soon.");
  if (!p.hasDevice || p.isBot) throw new HttpError(403, "Not allowed");
  if (on) {
    p.ready = true;
  } else {
    if (!p.ready) return;
    if ((room.readyUndo ?? []).includes(p.id)) throw new HttpError(409, "You already took your ready back once this round.");
    room.readyUndo = [...(room.readyUndo ?? []), p.id];
    p.ready = false;
  }
  evaluate(room);
}

/** Sets or clears the countdown, and starts the intermission when everyone is ready. */
export function evaluate(room: Room) {
  if (room.transition || !READY_PHASES.includes(room.phase)) return;
  const { ready, total, needed: need } = readyCounts(room);
  if (total === 0) return;
  if (ready >= total) { beginTransition(room); return; }
  if (ready >= need) room.readyDeadline ??= now() + READY_COUNTDOWN_MS();
  else room.readyDeadline = undefined;
}

export function beginTransition(room: Room) {
  if (room.transition) return;
  const i = PHASES.indexOf(room.phase);
  const to = PHASES[i + 1];
  if (room.phase === "lobby" || !to) throw new HttpError(409, "The mystery is over");
  const t = now();
  room.transition = { to, startedAt: t, minUntil: t + INTERMISSION_MIN_MS(), until: t + INTERMISSION_MAX_MS() };
  room.readyDeadline = undefined;
  queuePhaseMedia(room, to); // the next round's art starts rendering now
}

/** True when a tick would change something (cheap check for the read path). */
export function dueNow(room: Room): boolean {
  if (room.paused) return false;
  const t = now();
  return (!!room.transition && t >= room.transition.minUntil) || (!!room.readyDeadline && t >= room.readyDeadline);
}

/** Driven by every poll: lets countdowns and intermissions finish without the host. */
export function tick(room: Room): boolean {
  if (room.paused) return false;
  const t = now();
  if (room.transition) {
    if (t >= room.transition.minUntil && (pendingArt(room) === 0 || t >= room.transition.until)) { advance(room); return true; }
    return false;
  }
  if (room.readyDeadline && t >= room.readyDeadline && READY_PHASES.includes(room.phase)) { beginTransition(room); return true; }
  return false;
}

/** Host "Next": starts the intermission first, or skips it if it is already running. */
export function hostNext(room: Room) {
  if (room.paused) throw new HttpError(409, "Game is paused");
  if (room.transition) { advance(room); return; }
  if (!READY_PHASES.includes(room.phase)) { advance(room); return; }
  beginTransition(room);
}

export function roundView(room: Room) {
  const c = readyCounts(room);
  const t = now();
  const tr = room.transition;
  return {
    canReady: READY_PHASES.includes(room.phase) && !tr,
    ready: c.ready, total: c.total, needed: c.needed,
    countdownMs: room.readyDeadline && !tr ? Math.max(0, room.readyDeadline - t) : null,
    intermission: tr ? {
      toTitle: PHASE_INFO[tr.to].title,
      minMs: Math.max(0, tr.minUntil - t), maxMs: Math.max(0, tr.until - t),
      artLeft: pendingArt(room), artTotal: room.media.filter((m) => m.kind !== "selfie" && m.phase === tr.to).length,
    } : null,
  };
}

export const rosterReady = (p: Player) => (p.isBot ? true : p.ready);
