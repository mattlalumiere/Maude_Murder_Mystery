// Selfie booth: a player takes a photo and the AI restyles it into something funny that everyone can see.
// The raw photo is only a reference for the picture job and is deleted as soon as that job ends. Prompts never contain names.
import { randomBytes } from "node:crypto";
import { pricesForRoom } from "./ai/route";
import { imageCost } from "./budget";
import { CARTOON_SHORT } from "./prompt-director";
import { HttpError } from "./store";
import type { Player, Room } from "./types";

export interface SelfieStyle { id: string; label: string; caption: string; prompt: string }

export const SELFIE_STYLES: SelfieStyle[] = [
  { id: "wanted", label: "Wanted poster", caption: "wanted for questioning", prompt: "old west WANTED poster outlaw, cowboy hat, bandana, sepia parchment, rope border" },
  { id: "mugshot", label: "Silly mugshot", caption: "caught red-handed", prompt: "prisoner in black and white striped jumpsuit, jail cell bars, holding a number board, orange background, goofy grin" },
  { id: "noir", label: "Film noir", caption: "the detective who knew too much", prompt: "film noir detective, trench coat, fedora hat, magnifying glass, black and white, window blind shadows" },
  { id: "royal", label: "Royal portrait", caption: "of questionable nobility", prompt: "royal oil portrait, powdered white wig, giant ruffled collar, golden crown, velvet curtain, pet frog" },
  { id: "villain", label: "Cartoon villain", caption: "plotting something", prompt: "evil supervillain, dramatic black cape, twirly moustache, villain lair, glowing green lights, evil grin" },
  { id: "sidekick", label: "Superhero sidekick", caption: "ready for action", prompt: "superhero sidekick, glitter mask, red cape, spandex costume, city skyline, heroic pose" },
];

export const MAX_SELFIES_PER_PLAYER = 3;
export const MAX_SELFIES_PER_ROOM = 60;

export const styleById = (id: unknown) => SELFIE_STYLES.find((s) => s.id === id);

export function queueSelfie(room: Room, p: Player, styleId: unknown, refKey: string) {
  const style = styleById(styleId);
  if (!style) throw new HttpError(400, "Pick a selfie style");
  if (p.isBot) throw new HttpError(403, "Not allowed");
  if (room.budget.plan.paused) throw new HttpError(409, "Pictures are paused by the host");
  const mine = room.media.filter((m) => m.kind === "selfie" && m.playerIds[0] === p.id && m.status !== "failed" && m.status !== "skipped").length;
  if (mine >= MAX_SELFIES_PER_PLAYER) throw new HttpError(409, `That is ${MAX_SELFIES_PER_PLAYER} selfies. Save some film for the others!`);
  if (room.media.filter((m) => m.kind === "selfie").length >= MAX_SELFIES_PER_ROOM) throw new HttpError(409, "The selfie booth is closed for tonight");
  const est = imageCost(room.budget.plan.quality, pricesForRoom(room));
  const b = room.budget;
  if (b.spentUsd + b.reservedUsd + est > b.capUsd + 1e-9) throw new HttpError(409, "The picture budget is used up");
  room.media.push({
    id: randomBytes(8).toString("base64url"), kind: "selfie", phase: room.phase, playerIds: [p.id], refKey,
    caption: `${p.name}, ${style.caption}`, prompt: `${style.prompt}, ${CARTOON_SHORT}`, status: "queued", estCostUsd: est, createdAt: Date.now(),
  });
}
