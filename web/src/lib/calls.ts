// Voice calls between players, in any room or place. The audio goes directly between their devices (WebRTC); the server only
// carries the call setup (the offer and the answer) so players can find each other through the game. Grown-ups only.
import { randomBytes } from "node:crypto";
import { HttpError } from "./store";
import type { Call, Player, Room } from "./types";

const MAX_SDP = 14_000;
const RING_MS = 60_000;
const KEEP_MS = 90_000;

const clampSdp = (v: unknown, what: string) => {
  if (typeof v !== "string" || v.length < 20 || v.length > MAX_SDP) throw new HttpError(400, `Bad call ${what}`);
  try { const j = JSON.parse(v) as { type?: string; sdp?: string }; if (typeof j.sdp !== "string" || !["offer", "answer"].includes(j.type ?? "")) throw new Error("shape"); }
  catch { throw new HttpError(400, `Bad call ${what}`); }
  return v;
};

const live = (c: Call) => c.state !== "ended";
const involves = (c: Call, id: string) => c.from === id || c.to === id;

/** Drops finished and unanswered calls after a while. */
function tidy(room: Room) {
  const now = Date.now();
  room.calls = (room.calls ?? []).filter((c) => (c.state === "ringing" ? now - c.ts < RING_MS + KEEP_MS : c.state === "ended" ? now - c.ts < KEEP_MS : true));
  for (const c of room.calls) if (c.state === "ringing" && now - c.ts >= RING_MS) { c.state = "ended"; c.ts = now; }
}

const canCall = (p: Player) => p.ageGroup === "adult" && !p.isBot && p.hasDevice;

export function startCall(room: Room, from: Player, toId: string, offer: unknown): Call {
  if (room.paused) throw new HttpError(409, "The game is paused. Take a breath.");
  if (room.phase === "lobby") throw new HttpError(409, "Calls open once the game has started");
  const to = room.players.find((p) => p.id === toId);
  if (!to || to.id === from.id) throw new HttpError(400, "Pick someone else to call");
  if (!canCall(from)) throw new HttpError(403, "Voice calls are for grown-ups. You can still send messages.");
  if (!canCall(to)) throw new HttpError(409, `${to.name} cannot take voice calls. Send them a message instead.`);
  tidy(room);
  if ((room.calls ?? []).some((c) => live(c) && (involves(c, from.id) || involves(c, to.id)))) throw new HttpError(409, "Someone is already on a call. Try again in a moment.");
  const call: Call = { id: randomBytes(6).toString("base64url"), from: from.id, to: to.id, state: "ringing", offer: clampSdp(offer, "offer"), ts: Date.now() };
  room.calls = [...(room.calls ?? []), call].slice(-40);
  return call;
}

export function answerCall(room: Room, p: Player, id: string, answer: unknown) {
  tidy(room);
  const c = (room.calls ?? []).find((x) => x.id === id);
  if (!c || c.to !== p.id) throw new HttpError(404, "That call is not for you");
  if (c.state !== "ringing") throw new HttpError(409, "That call is over");
  c.answer = clampSdp(answer, "answer");
  c.state = "active";
  c.ts = Date.now();
}

/** Either side can end or decline. */
export function endCall(room: Room, p: Player, id: string) {
  const c = (room.calls ?? []).find((x) => x.id === id);
  if (!c || !involves(c, p.id)) throw new HttpError(404, "Call not found");
  if (c.state !== "ended") { c.state = "ended"; c.ts = Date.now(); }
}

/** Only the two people on a call ever see its setup details. */
export function callsView(room: Room, p: Player) {
  return (room.calls ?? []).filter((c) => involves(c, p.id)).map((c) => {
    const otherId = c.from === p.id ? c.to : c.from;
    return {
      id: c.id, withId: otherId, withName: room.players.find((x) => x.id === otherId)?.name ?? "A guest",
      role: c.from === p.id ? ("caller" as const) : ("callee" as const), state: c.state,
      offer: c.to === p.id && c.state === "ringing" ? c.offer : undefined,
      answer: c.from === p.id && c.state === "active" ? c.answer : undefined,
    };
  });
}
