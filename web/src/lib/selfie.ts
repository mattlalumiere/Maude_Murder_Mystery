// Selfie booth: a player takes a photo and the AI restyles it into something funny that everyone can see.
// The raw photo is only a reference for the picture job and is deleted as soon as that job ends. Prompts never contain names.
import { randomBytes } from "node:crypto";
import { pricesForRoom } from "./ai/route";
import { imageCost } from "./budget";
import { HttpError } from "./store";
import type { Player, Room } from "./types";

export interface SelfieStyle { id: string; label: string; caption: string; prompt: string }

export const SELFIE_STYLES: SelfieStyle[] = [
  { id: "wanted", label: "Wanted poster", caption: "wanted for questioning", prompt: "A vintage wild-west wanted poster of the person in the reference photo, comically exaggerated outlaw, sepia paper, rope border, no text or letters." },
  { id: "mugshot", label: "Silly mugshot", caption: "caught red-handed", prompt: "A comic police lineup photo of the person in the reference photo holding a rubber chicken, height chart behind them, goofy guilty grin, no text or letters." },
  { id: "noir", label: "Film noir", caption: "the detective who knew too much", prompt: "A black-and-white film noir detective portrait of the person in the reference photo, trench coat, dramatic window-blind shadows, a magnifying glass, no text or letters." },
  { id: "royal", label: "Royal portrait", caption: "of questionable nobility", prompt: "A grand oil-painting royal portrait of the person in the reference photo, powdered wig, ridiculous ruffled collar, a tiny pet frog on a cushion, no text or letters." },
  { id: "villain", label: "Cartoon villain", caption: "plotting something", prompt: "A cartoon supervillain version of the person in the reference photo, twirly moustache or dramatic cape, evil-but-adorable laugh, bright colors, no text or letters." },
  { id: "sidekick", label: "Superhero sidekick", caption: "ready for action", prompt: "A comic-book superhero sidekick version of the person in the reference photo, oversized cape, glitter mask, dramatic pose, bright colors, no text or letters." },
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
    caption: `${p.name}, ${style.caption}`, prompt: style.prompt, status: "queued", estCostUsd: est, createdAt: Date.now(),
  });
}
