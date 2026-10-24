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
/** The break between rounds lasts this long unless every player votes to skip it. */
export const INTERMISSION_MS = () => num(process.env.INTERMISSION_MS, 300_000);
/** How long the Game Master's message holds the screen before the break. */
export const GM_MESSAGE_MS = () => num(process.env.GM_MESSAGE_MS, 30_000);
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
  room.transition = { to, startedAt: t, gmUntil: t + GM_MESSAGE_MS(), until: t + GM_MESSAGE_MS() + INTERMISSION_MS(), skip: [], stage: "gm" };
  room.readyDeadline = undefined;
  queuePhaseMedia(room, to); // the next round's art starts rendering now
}

/** True when a tick would change something (cheap check for the read path). */
export function dueNow(room: Room): boolean {
  if (room.paused) return false;
  const t = now();
  const tr = room.transition;
  return (!!tr && t >= (tr.stage === "gm" ? tr.gmUntil : tr.until)) || (!!room.readyDeadline && t >= room.readyDeadline);
}

/** Driven by every poll: lets countdowns and intermissions finish without the host. */
export function tick(room: Room): boolean {
  if (room.paused) return false;
  const t = now();
  if (room.transition) {
    if (room.transition.stage === "gm") { if (t >= room.transition.gmUntil) { startBreak(room); return true; } return false; }
    if (t >= room.transition.until) { advance(room); return true; }
    return false;
  }
  if (room.readyDeadline && t >= room.readyDeadline && READY_PHASES.includes(room.phase)) { beginTransition(room); return true; }
  return false;
}

/** The Game Master's message is over: the break starts and its full time runs from now. */
function startBreak(room: Room) {
  const tr = room.transition!;
  tr.stage = "break";
  tr.until = now() + INTERMISSION_MS();
}

const GM_FALLBACK: Partial<Record<Phase, string>> = {
  act1: "The doors swing open and the guests sweep in. Glasses clink, secrets simmer, and nobody here is quite who they say they are.",
  death: "A hush falls over the room. Something terrible is about to happen, and every one of you will be asked where you were.",
  act2: "The body is cold and the questions are hot. Look closely at who is looking away. Every alibi in this room has a crack.",
  intermission: "Take a breath, refill your glass, and keep your eyes open. The killer is among you, and they are enjoying the snacks.",
  act3: "Just when you thought you had it figured out, the plot thickens. Something you were sure of is about to turn out to be wrong.",
  act4: "The time for whispering is over. It is time to point fingers, and to be very sure of whose.",
  reveal: "The lights dim, the drums roll, and the truth steps into the room at last.",
};

/** The Game Master's lone message before the break: it moves the story to the next round. */
export function gmMessage(room: Room, to: Phase) {
  const text = room.case?.narration[to] || GM_FALLBACK[to] || "The story moves on.";
  return { title: PHASE_INFO[to].title, text, clock: PHASE_INFO[to].clock };
}

/** A player votes to skip the break (and may take the vote back). When every player has voted, the story moves on. */
export function voteSkip(room: Room, p: Player, on: boolean) {
  const tr = room.transition;
  if (!tr) throw new HttpError(409, "There is no intermission right now");
  if (tr.stage === "gm") throw new HttpError(409, "The Game Master is speaking. You can skip the break after.");
  if (!p.hasDevice || p.isBot) throw new HttpError(403, "Not allowed");
  const votes = new Set(tr.skip ?? []);
  if (on) votes.add(p.id); else votes.delete(p.id);
  tr.skip = [...votes];
  const e = eligible(room);
  if (e.length > 0 && e.every((x) => votes.has(x.id))) advance(room);
}

/** Host "Next": starts the intermission first, or skips it if it is already running. */
export function hostNext(room: Room) {
  if (room.paused) throw new HttpError(409, "Game is paused");
  if (room.transition) { if (room.transition.stage === "gm") startBreak(room); else advance(room); return; }
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
      stage: tr.stage, gm: tr.stage === "gm" ? gmMessage(room, tr.to) : null,
      remainingMs: Math.max(0, (tr.stage === "gm" ? tr.gmUntil : tr.until) - t),
      skipVotes: eligible(room).filter((p) => (tr.skip ?? []).includes(p.id)).length, skipNeeded: eligible(room).length,
      artLeft: pendingArt(room), artTotal: room.media.filter((m) => m.kind !== "selfie" && m.phase === tr.to).length,
    } : null,
  };
}

export const rosterReady = (p: Player) => (p.isBot ? true : p.ready);
