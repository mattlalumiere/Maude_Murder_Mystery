// Fills every player's life story, portrait look and briefing. Template when there is no AI; otherwise one player at a
// time through the text model (driven by the host tab, like the picture worker), with a template fallback per player.
import { textModelFor } from "./ai/route";
import { writeLife, templateLife, type LifeResult } from "./backstory";
import { queueAvatars } from "./media-jobs";
import { mutate } from "./store";
import type { Character, Player, Room } from "./types";

const CLAIM_MS = 120_000;

const charOf = (room: Room, p: Player): Character | undefined => room.case?.characters.find((c) => c.id === p.characterId);

export function applyLife(room: Room, p: Player, r: LifeResult) {
  const c = charOf(room, p);
  if (!c) return;
  c.card.life = r.life; c.card.visual = r.visual; c.card.opening = r.opening;
}

const has = (room: Room, p: Player) => !!charOf(room, p)?.card.life;

/** Called once the cast is set. Without an AI model everything is filled at once and portraits are queued. */
export function beginLives(room: Room) {
  const players = room.players.filter((p) => p.characterId);
  if (!textModelFor(room)) {
    for (const p of players) applyLife(room, p, templateLife(room, p, charOf(room, p)!));
    queueAvatars(room);
    room.life = undefined;
    return;
  }
  room.life = { queue: players.map((p) => p.id), done: [], total: players.length, startedAt: Date.now() };
}

/** Anyone still waiting gets a template, so nobody enters the story without a briefing. */
export function fillMissingLives(room: Room) {
  const missing = room.players.filter((p) => p.characterId && !has(room, p));
  for (const p of missing) applyLife(room, p, templateLife(room, p, charOf(room, p)!));
  if (missing.length) queueAvatars(room, missing);
  room.life = undefined;
}

interface Claimed { player: Player; room: Room }

/** One tick: writes the next player's life story. Safe to call from several tabs at once. */
export async function runLifeTick(code: string): Promise<{ ran: boolean; left: number }> {
  const { result: claimed, room: after } = await mutate(code, (room): Claimed | null => {
    const l = room.life;
    if (!l) return null;
    const now = Date.now();
    const busy = new Set((l.claims ?? []).filter((c) => c.until > now).map((c) => c.id));
    const next = l.queue.find((id) => !l.done.includes(id) && !busy.has(id));
    if (!next) return null;
    l.claims = [...(l.claims ?? []).filter((c) => c.until > now), { id: next, until: now + CLAIM_MS }];
    return { player: room.players.find((p) => p.id === next)!, room: structuredClone(room) };
  });
  if (!claimed) return { ran: false, left: after.life ? after.life.total - after.life.done.length : 0 };

  const c = charOf(claimed.room, claimed.player)!;
  const { result } = await writeLife(claimed.room, claimed.player, c, textModelFor(claimed.room), code);
  const { room: done } = await mutate(code, (room) => {
    const l = room.life;
    const p = room.players.find((x) => x.id === claimed.player.id);
    if (!l || !p) return;
    applyLife(room, p, result);
    l.done = [...new Set([...l.done, p.id])];
    l.claims = (l.claims ?? []).filter((x) => x.id !== p.id);
    queueAvatars(room, [p]);
    if (l.done.length >= l.total) room.life = undefined;
  });
  return { ran: true, left: done.life ? done.life.total - done.life.done.length : 0 };
}
