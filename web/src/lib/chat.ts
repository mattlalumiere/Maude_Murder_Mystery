// Table talk: a short group chat for players and AI guests. Everyone in the room can read it, so it follows the AI guests' G-rated filter.
import { randomBytes } from "node:crypto";
import { cleanLine } from "./bots";
import { HttpError } from "./store";
import type { ChatMsg, Player, Room } from "./types";

const MAX_CHARS = 240;
const KEEP = 100;
const MIN_GAP_MS = 1500;

export const CHAT_VIEW_COUNT = 40;

function add(room: Room, m: Omit<ChatMsg, "id" | "ts">): ChatMsg {
  const msg: ChatMsg = { ...m, id: randomBytes(6).toString("base64url"), ts: Date.now() };
  room.chat = [...(room.chat ?? []), msg].slice(-KEEP);
  return msg;
}

export function postChat(room: Room, p: Player, text: string): ChatMsg {
  if (room.paused) throw new HttpError(409, "The game is paused. Take a breath.");
  const t = cleanLine(text, MAX_CHARS);
  if (!t) throw new HttpError(400, "Say something friendly and short");
  const last = [...(room.chat ?? [])].reverse().find((m) => m.from === p.id);
  if (last && Date.now() - last.ts < MIN_GAP_MS) throw new HttpError(429, "Easy there, one message at a time");
  return add(room, { from: p.id, name: p.name, text: t });
}

export function postBotChat(room: Room, bot: Player, text: string): ChatMsg {
  return add(room, { from: bot.id, name: bot.name, text, bot: true });
}

/** The AI guest a message is aimed at: named first, or the character's first name. Null if nobody is addressed. */
export function addressedBot(room: Room, text: string): Player | null {
  if (!room.case) return null;
  const lower = text.toLowerCase();
  for (const b of room.players.filter((p) => p.isBot)) {
    const c = room.case.characters.find((x) => x.id === b.characterId);
    const names = [b.name, c?.name].filter(Boolean).flatMap((n) => [n!.toLowerCase(), n!.toLowerCase().split(" ")[0]]).filter((n) => n.length > 2);
    if (names.some((n) => new RegExp(`\\b${n.replace(/[^a-z0-9 ]/g, "")}\\b`).test(lower))) return b;
  }
  return null;
}

export const chatView = (room: Room) => (room.chat ?? []).slice(-CHAT_VIEW_COUNT).map((m) => ({ id: m.id, from: m.from, name: m.name, text: m.text, bot: !!m.bot, ts: m.ts }));
