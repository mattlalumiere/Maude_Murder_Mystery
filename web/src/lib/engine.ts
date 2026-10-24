import { scryptSync, timingSafeEqual } from "node:crypto";
import { LIMITS } from "./engine-limits";
import { allocateJoinCode, getRuntime } from "./ids";
import { fitPlan, recommend, TIERS } from "./budget";
import { usesLocal } from "./ai/mode";
import { caseOptionsFor, speechFor } from "./ai/route";
import { getSpeech } from "./ai/speech";
import { BOT_LIMITS, BOT_PERSONAS, queueBotChatter } from "./bots";
import { answerPrompt, doneForNight, DrinkError, hostControl as drinkHostControl, hostDrinkView, logDrink, logWater, playerDrinkView, publicDrinkView, queueDrinkRound } from "./drinks";
import { generateCase } from "./gm-ai";
import { beginLives, fillMissingLives } from "./life";
import { launchView } from "./launch";
import { chatView } from "./chat";
import { applySelfCast, planCast } from "./selfcast";
import { openStoryCase, recordPlay } from "./stories";
import { queueAvatars, queuePhaseMedia, reconcilePlan } from "./media-jobs";
import { getMediaStore } from "./media-store";
import { money, sanitizeConfig, sanitizePlan, sanitizeProfile } from "./sanitize";
import { getStore, HttpError } from "./store";
import {
  PHASES, PHASE_INFO,
  type AgeGroup, type Ballot, type Character, type GameConfig, type MediaPlan, type Phase, type Player, type PlayerProfile, type Result, type Room,
} from "./types";

const DAY = 24 * 3600;
/** A generation claim older than this is treated as abandoned (the request died), so the host can retry. */
export const GENERATION_LOCK_MS = 90_000; // minimum; the real window is generationLockMs()
/** The case must be ready by then or the built-in sample case is used, so a 60 s Lambda never times out. */
export const GENERATION_DEADLINE_MS = 50_000;
/** Deployments behind a 30 s proxy timeout (the CloudFront default) set GENERATION_DEADLINE_MS=25000. */
// An explicit GENERATION_DEADLINE_MS is honoured up to 15 minutes (self-hosted with a slow local model). Without it the 50 s serverless default applies.
export const generationDeadlineMs = () => {
  const asked = Number(process.env.GENERATION_DEADLINE_MS);
  return Number.isFinite(asked) && asked > 0 ? Math.min(900_000, Math.max(5_000, asked)) : GENERATION_DEADLINE_MS;
};
/** How long a "being written" claim stays valid: the deadline plus slack, never less than 90 s. */
export const generationLockMs = () => Math.max(GENERATION_LOCK_MS, generationDeadlineMs() + 30_000);

const hashCode = (code: string, salt: string) => scryptSync(code.trim().toLowerCase().slice(0, LIMITS.overrideCodeMax), salt, 32).toString("hex");
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const now = () => getRuntime().clock.now();
const rid = (n = 12) => Buffer.from(getRuntime().random.bytes(n)).toString("base64url");
const shuffle = <T,>(a: T[]) => {
  const r = [...a];
  const rnd = getRuntime().random;
  for (let i = r.length - 1; i > 0; i--) { const j = rnd.int(i + 1); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
};

// ---------- creation / joining ----------
export interface CreateRoomOptions {
  /** Directory lookup (code to gameId). Return true if the join code is already taken. */
  codeExists?: (code: string) => Promise<boolean>;
  /** Replay a saved story. The route has already checked that it exists. */
  story?: { id: string; mode: "random" | "choose" };
}

export async function createRoom(
  hostId: string, overrideCode: string, configIn?: Partial<GameConfig>, capIn?: number, planIn?: Partial<MediaPlan>,
  opts: CreateRoomOptions = {},
): Promise<Room> {
  const trimmed = String(overrideCode ?? "").trim();
  if (trimmed.length < LIMITS.overrideCodeMin) throw new HttpError(400, `Override code must be at least ${LIMITS.overrideCodeMin} characters`);
  if (trimmed.length > LIMITS.overrideCodeMax) throw new HttpError(400, `Override code must be at most ${LIMITS.overrideCodeMax} characters`);
  const config = sanitizeConfig(configIn);
  if (config.drinking === "heavy" && !config.drinkingAttested) {
    throw new HttpError(400, "Heavy drinking mode needs you to confirm that everyone who drinks is of legal drinking age and chose to take part.");
  }
  if (config.adultsOnly && !config.adultsAttested) {
    throw new HttpError(400, "Adults-only mode needs you to confirm that everyone playing is 18 or older and chose this kind of game.");
  }
  const cap = money(capIn);
  const expected = config.expected.adults + config.expected.kids + config.expected.toddlers;
  // Local services have no per-picture price, so the budget does not trim their plan.
  const local = config.aiMode === "local";
  const wanted = sanitizePlan(planIn ?? (local ? TIERS[4].plan : (recommend(cap, expected).best ?? TIERS[0]).plan));
  const plan = local ? wanted : fitPlan(wanted, cap, expected);
  const store = getStore();
  const { random, ids } = getRuntime();
  const exists = opts.codeExists ?? (async (c: string) => (await store.get(c)) !== null);
  for (let i = 0; i < 5; i++) {
    let code: string;
    try { code = await allocateJoinCode(random, exists); } catch { throw new HttpError(500, "Could not allocate a room code"); }
    const salt = rid(8);
    const nowS = Math.floor(now() / 1000);
    const room: Room = {
      code, gameId: ids.gameId(), cellId: process.env.CELL_ID || "local-0", regionId: process.env.REGION_ID || "local",
      version: 1, createdAt: nowS, ttl: nowS + DAY, hostId, config, media: [],
      budget: { capUsd: cap, spentUsd: 0, reservedUsd: 0, plan },
      overrideSalt: salt, overrideHash: hashCode(overrideCode, salt),
      failedOverrides: 0, lockedUntil: 0, overrideUsed: false,
      phase: "lobby", phaseStartedAt: now(), paused: false,
      players: [], releasedClueIds: [], ballotsOpen: false,
      ...(opts.story ? { storyId: opts.story.id, storyMode: opts.story.mode } : {}),
    };
    if (await store.put(room, null)) return room;
  }
  throw new HttpError(500, "Could not allocate a room code");
}

export function addPlayer(room: Room, name: string, ageGroup: AgeGroup, wantsVictim: boolean, hasDevice = true, profile?: Partial<PlayerProfile>, characterChoice?: string, pronouns?: string): Player {
  if (room.phase !== "lobby") throw new HttpError(409, "The game has already started");
  if (room.generating && now() - room.generating < generationLockMs()) throw new HttpError(409, "The host is starting the game. Please wait a moment.");
  // Braces are removed so a name can never look like a story token.
  const clean = String(name ?? "").replace(/[{}]/g, "").trim().slice(0, LIMITS.playerName);
  if (!clean) throw new HttpError(400, "Name required");
  if (!["little", "kid", "teen", "adult"].includes(ageGroup)) throw new HttpError(400, "Bad age group");
  if (room.config.adultsOnly && ageGroup !== "adult") throw new HttpError(403, "This is an adults-only game. Everyone must be 18 or older.");
  if (room.players.length >= LIMITS.maxPlayers) throw new HttpError(409, "Room is full");
  if (room.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) throw new HttpError(409, "That name is taken");
  const p: Player = {
    id: rid(6), name: clean, ageGroup, wantsVictim, token: rid(18), ready: false, hasDevice,
    profile: sanitizeProfile(profile, room.config.allowPlayerBackstory),
    ...(pronouns === "he" || pronouns === "she" ? { pronouns } : { pronouns: "they" as const }),
  };
  // Heavy night: only grown-ups with a device can opt in. Everyone else, and anyone who did not choose, has no drink profile (no prompts).
  if (!(room.config.drinking === "heavy" && ageGroup === "adult" && hasDevice)) delete p.profile.drink;
  if (room.storyMode === "choose" && typeof characterChoice === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(characterChoice)) p.wantsCharacter = characterChoice;
  room.players.push(p);
  return p;
}

// ---------- casting ----------
const pref = (c: Character, g: AgeGroup) => {
  const order: Record<AgeGroup, Character["role"][]> = {
    little: ["mascot", "witness", "informant", "suspect"],
    kid: ["witness", "informant", "suspect", "mascot"],
    teen: ["informant", "witness", "suspect", "mascot"],
    adult: ["suspect", "witness", "informant", "mascot"],
  };
  const i = order[g].indexOf(c.role);
  return i < 0 ? 9 : i;
};

function generic(n: number, kid: boolean): Character {
  return {
    id: `guest-${kid ? "k" : "a"}${n}`, slot: `G${kid ? "k" : "a"}${n}`, name: `{{G${kid ? "k" : "a"}${n}}}`, title: kid ? "Little guest" : "Party guest",
    house: "Wandering Guests", kid, role: "witness", tease: "A guest who sees more than they say.",
    card: {
      story: "You are an invited guest with a good view of the party.",
      secret: "You sneaked an extra slice of cake and hid the plate.",
      alibi: "Mingling near the snack table.",
      knows: ["You noticed that the drinks table was left unattended for a few minutes around 7:45."],
      goal: "Help the detectives and keep your cake secret.",
      special: "Once, ask the GM one yes/no question.",
    },
  };
}

function castPlayers(room: Room) {
  const k = room.case!;
  const chars = [...k.characters];
  const taken = new Set<string>();
  const assign = (p: Player, c: Character) => { p.characterId = c.id; taken.add(c.id); };

  // A story written for this exact cast names a character for every player (forHandle). Use it as is.
  if (!room.storyId && room.players.every((p, i) => chars.some((c) => c.forHandle === `P${i + 1}`))) {
    room.players.forEach((p, i) => assign(p, chars.find((c) => c.forHandle === `P${i + 1}`)!));
    k.characters = chars.map((c) => ({ ...c, slot: c.slot ?? c.forHandle }));
    for (const p of room.players) {
      const c = k.characters.find((x) => x.id === p.characterId);
      if (c && p.profile.backstory) c.card.extra = p.profile.backstoryMode === "own" ? `Your own backstory (from you): ${p.profile.backstory}` : `Your idea for the GM: ${p.profile.backstory}`;
    }
    return;
  }

  room.castPlan = undefined; // not a story written for this cast: roles come from the story itself

  // Choose-your-character stories: honour requests first (first come, first served, only a fitting character).
  if (room.storyMode === "choose") {
    for (const p of room.players) {
      if (p.isBot || !p.wantsCharacter || p.characterId) continue;
      const c = chars.find((x) => x.id === p.wantsCharacter);
      if (!c || taken.has(c.id)) continue;
      const young = p.ageGroup !== "adult";
      if (c.kid !== young) continue; // grown-up characters go to grown-ups, young characters to young players
      if (c.id === k.victimId && !(young || p.wantsVictim)) continue;
      assign(p, c);
    }
  }

  // Victim: volunteer kid/teen > any kid/teen > volunteer adult > random adult.
  const young = room.players.filter((p) => (p.ageGroup === "kid" || p.ageGroup === "teen") && !p.characterId);
  const victimPlayer =
    young.find((p) => p.wantsVictim) ?? young.find((p) => p.ageGroup === "kid") ?? young[0] ??
    room.players.find((p) => p.wantsVictim && p.ageGroup === "adult" && !p.isBot && !p.characterId) ?? shuffle(room.players.filter((p) => p.ageGroup === "adult" && !p.isBot && !p.characterId))[0];
  const victim = chars.find((c) => c.id === k.victimId)!;
  if (!taken.has(victim.id)) {
    // If every eligible player already asked for another character, one of them gives theirs up for the victim role.
    const who = victimPlayer ?? shuffle(room.players.filter((p) => !p.isBot))[0];
    if (who.characterId) taken.delete(who.characterId);
    assign(who, victim);
  }

  // Killer goes to a random adult.
  const adults = shuffle(room.players.filter((p) => p.ageGroup === "adult" && !p.characterId));
  const killer = chars.find((c) => c.id === k.killerId)!;
  if (!taken.has(killer.id)) {
    // A requested character is released if that is the only way to give the killer role to a grown-up.
    const who = adults.shift() ?? shuffle(room.players.filter((p) => p.ageGroup === "adult" && p.characterId !== victim.id))[0];
    if (who.characterId) taken.delete(who.characterId);
    assign(who, killer);
  }

  // Remaining adults (characters written for a player's note go to that player first).
  const handle = (p: Player) => `P${room.players.indexOf(p) + 1}`;
  const adultChars = chars.filter((c) => !c.kid && !taken.has(c.id));
  let g = 1;
  for (const p of adults) {
    const i = adultChars.findIndex((c) => c.forHandle === handle(p));
    const mine = i >= 0 ? adultChars.splice(i, 1)[0] : undefined;
    assign(p, mine ?? adultChars.shift() ?? (chars.push(generic(g++, false)), chars[chars.length - 1]));
  }

  // Remaining young players, picking the best-fitting remaining character.
  const rest = shuffle(room.players.filter((p) => !p.characterId));
  let gk = 1;
  for (const p of rest) {
    const pool = chars.filter((c) => c.kid && !taken.has(c.id))
      .sort((a, b) => Number(b.forHandle === handle(p)) - Number(a.forHandle === handle(p)) || pref(a, p.ageGroup) - pref(b, p.ageGroup));
    const pick = pool[0] ?? (chars.push(generic(gk++, true)), chars[chars.length - 1]);
    assign(p, pick);
  }
  k.characters = chars;

  // Player-supplied material goes on the card (their own words are never rewritten).
  for (const p of room.players) {
    const c = chars.find((x) => x.id === p.characterId);
    if (!c || !p.profile.backstory) continue;
    c.card.extra = p.profile.backstoryMode === "own"
      ? `Your own backstory (from you): ${p.profile.backstory}`
      : `Your idea for the GM: ${p.profile.backstory}`;
  }
}

export async function startGame(room: Room) {
  if (room.phase !== "lobby") throw new HttpError(409, "Already started");
  if (room.players.length < LIMITS.minPlayers) throw new HttpError(400, `Need at least ${LIMITS.minPlayers} players`);
  if (room.players.filter((p) => p.ageGroup === "adult").length < LIMITS.minAdults) throw new HttpError(400, `Need at least ${LIMITS.minAdults} adults`);
  const adults = room.players.filter((p) => p.ageGroup === "adult").length;
  room.castPlan = planCast(room);
  const gen = room.storyId
    ? { case: await openStoryCase(room.storyId), source: "story" as const }
    : await generateCase(
    {
      adults, kids: room.players.length - adults, littles: room.players.filter((p) => p.ageGroup === "little").length,
      players: room.players.map((p, i) => ({ handle: `P${i + 1}`, ageGroup: p.ageGroup, mode: p.profile.backstoryMode, text: p.profile.backstory })),
      cast: planCast(room, room.castPlan).entries,
    },
    room.config,
    { gameId: room.code, ...caseOptionsFor(room) },
  );
  room.case = gen.case;
  room.caseSource = gen.source;
  castPlayers(room);
  applySelfCast(room);
  beginLives(room);
  setPhase(room, "cards");
  if (room.storyId) void recordPlay(room.storyId, room.code).catch(() => {});
}

/** Fast first half of Start: validates and claims the room. The slow AI call happens in /generate, outside this write. */
export function beginGeneration(room: Room) {
  if (room.phase !== "lobby") throw new HttpError(409, "Already started");
  if (room.players.length < LIMITS.minPlayers) throw new HttpError(400, `Need at least ${LIMITS.minPlayers} players`);
  if (room.players.filter((p) => p.ageGroup === "adult").length < LIMITS.minAdults) throw new HttpError(400, `Need at least ${LIMITS.minAdults} adults`);
  if (room.generating && now() - room.generating < generationLockMs()) throw new HttpError(409, "Your mystery is already being written");
  room.generating = now();
  room.castPlan = planCast(room);
}

export function generationRoster(room: Room) {
  const adults = room.players.filter((p) => p.ageGroup === "adult").length;
  return {
    adults, kids: room.players.length - adults, littles: room.players.filter((p) => p.ageGroup === "little").length,
    players: room.players.map((p, i) => ({ handle: `P${i + 1}`, ageGroup: p.ageGroup, mode: p.profile.backstoryMode, text: p.profile.backstory })),
    cast: planCast(room, room.castPlan).entries,
  };
}

/** Second half of Start: applies a finished case. Safe to call only once; later calls are ignored. */
export function finishGeneration(room: Room, gen: Awaited<ReturnType<typeof generateCase>>) {
  if (room.phase !== "lobby" || !room.generating) return false;
  room.case = gen.case;
  room.caseSource = gen.source;
  castPlayers(room);
  applySelfCast(room);
  beginLives(room);
  room.generating = undefined;
  setPhase(room, "cards");
  return true;
}

// ---------- phases ----------
function setPhase(room: Room, phase: Phase) {
  room.phase = phase;
  room.phaseStartedAt = now();
  const k = room.case!;
  const release = (ids: string[]) => ids.forEach((id) => {
    if (!room.releasedClueIds.includes(id) && room.releasedClueIds.length < LIMITS.maxCluesReleased) room.releasedClueIds.push(id);
  });
  if (phase === "act2") release(k.clues.filter((c) => c.round === 1).map((c) => c.id));
  if (phase === "act3") release([...k.clues.filter((c) => c.round === 2).map((c) => c.id), "twist"]);
  room.ballotsOpen = phase === "act4";
  if (phase === "reveal") { fillBotBallots(room); room.result = computeResult(room); }
  queuePhaseMedia(room, phase);
  queueBotChatter(room, phase);
  queueDrinkRound(room, phase);
}

export function advance(room: Room) {
  if (room.paused) throw new HttpError(409, "Game is paused");
  if (room.phase === "cards") fillMissingLives(room); // nobody enters the story without a briefing
  const i = PHASES.indexOf(room.phase);
  if (room.phase === "lobby") throw new HttpError(409, "Start the game first");
  if (i >= PHASES.length - 1) throw new HttpError(409, "The mystery is over");
  setPhase(room, PHASES[i + 1]);
}

// ---------- ballots / scoring ----------
export function submitBallot(room: Room, player: Player, b: Ballot) {
  const k = room.case!;
  if (!room.ballotsOpen) throw new HttpError(409, "Ballots are not open");
  const ok =
    suspectList(room).some((s) => s.id === b.killerId) &&
    k.methods.some((m) => m.id === b.methodId) && k.motives.some((m) => m.id === b.motiveId);
  if (!ok) throw new HttpError(400, "Invalid ballot");
  player.ballot = { killerId: b.killerId, methodId: b.methodId, motiveId: b.motiveId };
}

function suspectList(room: Room) {
  const assigned = new Set(room.players.map((p) => p.characterId));
  return room.case!.characters.filter((c) => assigned.has(c.id) && c.id !== room.case!.victimId && !c.kid);
}

function computeResult(room: Room): Result {
  const k = room.case!;
  const voters = room.players.filter((p) => p.ballot);
  const correct = voters.filter((p) => p.ballot!.killerId === k.killerId).length;
  const scores = room.players.map((p) => {
    const b = p.ballot;
    let pts = 0; const d: string[] = [];
    if (b?.killerId === k.killerId) { pts += 3; d.push("killer +3"); }
    if (b?.methodId === k.truth.methodId) { pts += 1; d.push("method +1"); }
    if (b?.motiveId === k.truth.motiveId) { pts += 1; d.push("motive +1"); }
    if (p.characterId === k.killerId && voters.length > 0 && correct < voters.length / 2) { pts += 5; d.push("got away with it +5"); }
    if (!b) d.push("no ballot");
    return { playerId: p.id, name: p.name, points: pts, detail: d.join(", ") };
  }).sort((a, b) => b.points - a.points);

  const isBotId = (id: string) => !!room.players.find((p) => p.id === id)?.isBot;
  const nameOf = (pred: (p: Player) => boolean) => room.players.find((p) => !p.isBot && pred(p))?.name;
  const killerP = nameOf((p) => p.characterId === k.killerId);
  const victimP = nameOf((p) => p.characterId === k.victimId);
  const mascotP = room.players.find((p) => k.characters.find((c) => c.id === p.characterId)?.role === "mascot")?.name;
  const awards: Result["awards"] = [];
  const topHuman = scores.find((x) => !isBotId(x.playerId));
  if (topHuman) awards.push({ award: "Detective of the Night", to: topHuman.name });
  if (killerP) awards.push({ award: "Best Liar", to: killerP });
  if (victimP) { awards.push({ award: "Most Dramatic Death", to: victimP }); awards.push({ award: "Ghost MVP", to: victimP }); }
  if (mascotP) awards.push({ award: "Mascot of Honor", to: mascotP });
  const rest = shuffle(room.players.filter((p) => !p.isBot).map((p) => p.name));
  if (rest[0]) awards.push({ award: "Best Entrance", to: rest[0] });
  return { killerId: k.killerId, methodId: k.truth.methodId, motiveId: k.truth.motiveId, story: k.truth.story, scores, awards };
}

// ---------- Host Override Code ----------
export type OverrideCmd = "NUDGE" | "ADVANCED" | "ACCELERATE" | "FINAL" | "FINAL_REVEAL";

export function override(room: Room, code: string, cmd: OverrideCmd, confirm: boolean): { message: string; needsConfirm?: boolean } {
  if (now() < room.lockedUntil) throw new HttpError(429, "Security guard Gerald is guarding the vault. Try again later.");
  if (!room.case) throw new HttpError(409, "No case yet");
  const a = Buffer.from(hashCode(typeof code === "string" ? code : "", room.overrideSalt));
  const b = Buffer.from(room.overrideHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    room.failedOverrides += 1;
    if (room.failedOverrides >= LIMITS.overrideMaxFailures) {
      room.failedOverrides = 0;
      room.lockedUntil = now() + LIMITS.overrideLockMs;
      throw new HttpError(429, `Alarm! Security guard Gerald approaches. Overrides locked for ${Math.round(LIMITS.overrideLockMs / 60000)} minutes.`);
    }
    throw new HttpError(403, "The vault door does not budge.");
  }
  room.failedOverrides = 0;
  const k = room.case;
  const name = (id: string) => k.characters.find((c) => c.id === id)?.name ?? id;
  const optionText = (list: { id: string; text: string }[], id: string) => list.find((o) => o.id === id)?.text ?? id;
  const detective = " Your detective license has been revoked: no Detective of the Night award for the host.";
  switch (cmd) {
    case "NUDGE":
      room.overrideUsed = true;
      return { message: (k.nudges[room.phase] ?? "Re-read the clues. The timeline is the key.") };
    case "ADVANCED":
      room.overrideUsed = true;
      return { message: (k.advanced[room.phase] ?? "Focus on who lied about where they were.") + detective };
    case "ACCELERATE":
      room.overrideUsed = true;
      room.paused = false;
      advance(room);
      return { message: `Fast-forwarded to ${PHASE_INFO[room.phase].title}.` };
    case "FINAL":
    case "FINAL_REVEAL": {
      if (!confirm) return { needsConfirm: true, message: "Are you sure? This ends the mystery. Confirm to continue." };
      room.overrideUsed = true;
      if (cmd === "FINAL_REVEAL") {
        room.paused = false;
        setPhase(room, "reveal");
        return { message: "Jumping straight to the Reveal!" };
      }
      return {
        message: `Killer: ${name(k.killerId)}. Method: ${optionText(k.methods, k.truth.methodId)}. Motive: ${optionText(k.motives, k.truth.motiveId)}.\n\n${k.truth.story}${detective}`,
      };
    }
  }
}

// ---------- views (the only things clients ever see) ----------
export function publicView(room: Room) {
  const k = room.case;
  const info = PHASE_INFO[room.phase];
  const roster = k
    ? room.players.map((p) => {
        const c = k.characters.find((x) => x.id === p.characterId);
        return { playerName: p.name, characterName: c?.name ?? "", house: c?.house ?? "", tease: c?.tease ?? "", title: c?.title ?? "", kid: c?.kid ?? false, avatarId: p.profile.avatarId };
      })
    : [];
  const clues = k
    ? [...k.clues, { id: "twist", round: 2 as const, text: k.twist }].filter((c) => room.releasedClueIds.includes(c.id)).map((c) => ({ id: c.id, round: c.round, text: c.text }))
    : [];
  return {
    code: room.code, version: room.version, phase: room.phase, phaseTitle: info.title, clock: info.clock, paused: room.paused,
    title: k?.title, setting: k?.setting, partyName: room.config.name || k?.title || "Murder Mystery Night",
    media: room.media.filter((m) => m.status === "done" && m.kind !== "selfie").map((m) => ({ id: m.id, kind: m.kind, phase: m.phase, caption: m.caption, mime: m.mime })),
    selfies: room.media.filter((m) => m.status === "done" && m.kind === "selfie").slice(-12).map((m) => ({ id: m.id, caption: m.caption })),
    narration: k?.narration[room.phase],
    lobbyNames: room.players.map((p) => p.name),
    starting: !!room.generating,
    adultsOnly: room.config.adultsOnly === true,
    drink: publicDrinkView(room),
    launch: launchView(room),
    storyId: room.storyId ?? null,
    bots: room.case
      ? room.players.filter((p) => p.isBot).map((p) => ({ id: p.id, name: p.name, characterName: room.case!.characters.find((c) => c.id === p.characterId)?.name ?? p.name, avatarId: p.profile.avatarId }))
      : room.players.filter((p) => p.isBot).map((p) => ({ id: p.id, name: p.name, characterName: p.name, avatarId: undefined })),
    botLog: (room.botLog ?? []).slice(-25).map((l) => ({ id: l.id, botId: l.botId, speaker: l.speaker, text: l.text, kind: l.kind, to: l.to, phase: l.phase, audio: !!l.audioKey, ts: l.ts })),
    botConfig: { chatter: room.botConfig?.chatter !== false, voice: room.botConfig?.voice !== false },
    speech: speechFor(room).kind,
    stt: usesLocal(room) ? "server" : "browser",
    drinking: room.config.drinking,
    roster, clues,
    ballotsOpen: room.ballotsOpen,
    ballotOptions: room.ballotsOpen && k
      ? { suspects: suspectList(room).map((c) => ({ id: c.id, name: c.name })), methods: k.methods, motives: k.motives }
      : undefined,
    ballotsIn: room.players.filter((p) => p.ballot).length,
    totalPlayers: room.players.length,
    reveal: room.phase === "reveal" && room.result && k
      ? {
          killer: k.characters.find((c) => c.id === room.result!.killerId)?.name,
          method: k.methods.find((m) => m.id === room.result!.methodId)?.text,
          motive: k.motives.find((m) => m.id === room.result!.motiveId)?.text,
          story: room.result.story, scores: room.result.scores, awards: room.result.awards,
        }
      : undefined,
  };
}

export function playerView(room: Room, p: Player) {
  const c = room.case?.characters.find((x) => x.id === p.characterId);
  return {
    ...publicView(room),
    chat: chatView(room),
    me: {
      id: p.id, name: p.name, ageGroup: p.ageGroup, ready: p.ready, ballot: p.ballot, avatarId: p.profile.avatarId, drink: playerDrinkView(room, p),
      notes: p.notes ?? "", pronouns: p.pronouns, selfieOk: p.ageGroup === "adult" || process.env.ALLOW_MINOR_PHOTOS === "true",
      selfies: room.media.filter((m) => m.kind === "selfie" && m.playerIds[0] === p.id).map((m) => ({ id: m.id, status: m.status, note: m.note })),
      profile: { backstoryMode: p.profile.backstoryMode, backstory: p.profile.backstory, consent: p.profile.consent, hasPhoto: !!p.profile.photoKey },
      character: c ? { id: c.id, name: c.name, house: c.house, tease: c.tease, kid: c.kid, role: c.role, title: c.title, trait: c.trait, card: c.card } : undefined,
    },
  };
}

export function hostView(room: Room) {
  const k = room.case;
  return {
    ...publicView(room),
    overrideUsed: room.overrideUsed,
    lockedUntil: room.lockedUntil,
    config: room.config,
    drinks: hostDrinkView(room),
    generating: room.generating ?? null,
    generationWindowMs: generationLockMs() - 10_000,
    botQueued: (room.botQueue ?? []).length,
    lifeLeft: room.life ? room.life.total - room.life.done.length : 0,
    caseSource: room.caseSource,
    aiMode: room.config.aiMode ?? "auto",
    localAi: usesLocal(room),
    budget: room.budget,
    jobs: room.media.slice(-60).map((m) => ({ id: m.id, kind: m.kind, phase: m.phase, status: m.status, note: m.note, est: m.estCostUsd, caption: m.caption })),
    runSheet: PHASES.map((ph) => ({ phase: ph, ...PHASE_INFO[ph] })),
    players: room.players.map((p) => ({
      id: p.id, name: p.name, ageGroup: p.ageGroup, ready: p.ready, hasDevice: p.hasDevice, ballot: !!p.ballot,
      hasPhoto: !!p.profile.photoKey, backstory: p.profile.backstoryMode, isBot: !!p.isBot,
      characterName: k?.characters.find((c) => c.id === p.characterId)?.name,
    })),
  };
}

export function authPlayer(room: Room, id: string | null, token: string | null): Player {
  const p = room.players.find((x) => x.id === id);
  if (!p || !token || !safeEqual(p.token, token)) throw new HttpError(401, "Unknown player");
  return p;
}

// ---------- media plan, photos ----------
export function setPlan(room: Room, planIn: Partial<MediaPlan> | undefined, capIn?: number) {
  const b = room.budget;
  if (capIn !== undefined) {
    const cap = money(capIn);
    if (cap < b.spentUsd + b.reservedUsd) throw new HttpError(400, `Budget cannot go below what is already spent or reserved ($${(b.spentUsd + b.reservedUsd).toFixed(2)})`);
    b.capUsd = cap;
  }
  b.plan = sanitizePlan(planIn, b.plan);
  reconcilePlan(room);
}

export function setPhoto(room: Room, p: Player, key: string, consent: "self" | "guardian") {
  if (p.ageGroup !== "adult" && consent !== "guardian") throw new HttpError(400, "A parent or guardian must consent for players under 18");
  p.profile.photoKey = key;
  p.profile.consent = consent;
}

export async function removePhoto(room: Room, p: Player) {
  if (p.profile.photoKey) await getMediaStore().deletePrefix(p.profile.photoKey);
  p.profile.photoKey = undefined;
  p.profile.consent = "none";
}

/** The detective notebook is private to its owner and never shown to anyone else. */
export function saveNotes(p: Player, notes: unknown) {
  if (typeof notes !== "string") throw new HttpError(400, "Notes must be text");
  p.notes = notes.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 4000);
}

export async function purgePhotos(room: Room) {
  await getMediaStore().deletePrefix(`${room.code}/photos`);
  await getMediaStore().deletePrefix(`${room.code}/selfies`);
  for (const p of room.players) { p.profile.photoKey = undefined; p.profile.consent = "none"; }
}

/** Removes a player and deletes their uploaded photo so it cannot outlive their place in the game. */
export async function kickPlayer(room: Room, playerId: string) {
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return;
  if (p.profile.photoKey) await getMediaStore().deletePrefix(p.profile.photoKey);
  room.players = room.players.filter((x) => x.id !== playerId);
}

const MEDIA_ACTIVE = new Set(["queued", "running", "polling"]);

/**
 * True when no media job still needs player photos as references: nothing is queued or running, and either the
 * reveal is reached or no later scene/video will use them. Avatar-only plans purge as soon as the portraits are done.
 */
export function photosCanBePurged(room: Room) {
  if (room.phase === "lobby" || !room.players.some((p) => p.profile.photoKey)) return false;
  if (room.media.some((m) => MEDIA_ACTIVE.has(m.status))) return false;
  const laterArt = room.budget.plan.scenesPerAct > 0 || room.budget.plan.videoClips > 0;
  return room.phase === "reveal" || !laterArt;
}

// ---------- AI guests (bots) ----------
/** Adds AI guests to the lobby. They count toward the player minimums and are cast like grown-up players. */
export function addBots(room: Room, count: number, styleHint?: string): Player[] {
  if (room.phase !== "lobby") throw new HttpError(409, "The game has already started");
  const have = room.players.filter((p) => p.isBot).length;
  const n = Math.max(1, Math.min(Math.round(Number(count) || 1), BOT_LIMITS.maxBots - have));
  if (have >= BOT_LIMITS.maxBots) throw new HttpError(409, `At most ${BOT_LIMITS.maxBots} AI guests`);
  if (room.players.length + n > LIMITS.maxPlayers) throw new HttpError(409, "Room is full");
  const voices = speechFor(room).voices;
  const added: Player[] = [];
  for (let i = 0; i < n; i++) {
    const idx = (have + i) % BOT_PERSONAS.length;
    let name = `${BOT_PERSONAS[idx].name} (AI)`;
    for (let k = 2; room.players.some((p) => p.name.toLowerCase() === name.toLowerCase()); k++) name = `${BOT_PERSONAS[idx].name} ${k} (AI)`;
    const p: Player = {
      id: rid(6), name, ageGroup: "adult", wantsVictim: false, token: rid(18), ready: true, hasDevice: false,
      isBot: true, bot: { style: styleHint?.trim().slice(0, 120) || BOT_PERSONAS[idx].style, voice: voices[(have + i) % voices.length] },
      profile: sanitizeProfile(undefined, false),
    };
    room.players.push(p);
    added.push(p);
  }
  return added;
}

export function setBotConfig(room: Room, patch: { chatter?: boolean; voice?: boolean }) {
  room.botConfig = { chatter: room.botConfig?.chatter !== false, voice: room.botConfig?.voice !== false };
  if (typeof patch.chatter === "boolean") room.botConfig.chatter = patch.chatter;
  if (typeof patch.voice === "boolean") room.botConfig.voice = patch.voice;
  if (!room.botConfig.chatter) room.botQueue = [];
}

/**
 * Bots vote at the reveal. Innocent bots reason from PUBLIC clues only (name and word overlap), never the solution.
 * A killer bot knows the truth and avoids naming itself or the true method and motive.
 */
function fillBotBallots(room: Room) {
  const k = room.case;
  if (!k) return;
  const suspects = suspectList(room);
  if (!suspects.length) return;
  const clues = [...k.clues, { id: "twist", round: 2 as const, text: k.twist }].filter((c) => room.releasedClueIds.includes(c.id)).map((c) => c.text.toLowerCase()).join(" ");
  const jitter = () => getRuntime().random.int(100) / 100;
  const overlap = (text: string) => text.toLowerCase().split(/\W+/).filter((w) => w.length > 4).reduce((n, w) => n + (clues.includes(w) ? 1 : 0), 0);
  const best = <T,>(items: T[], score: (t: T) => number) => items.map((t) => ({ t, s: score(t) + jitter() })).sort((a, b) => b.s - a.s)[0]?.t;
  for (const bot of room.players.filter((p) => p.isBot && !p.ballot)) {
    const isKiller = bot.characterId === k.killerId;
    const others = suspects.filter((c) => c.id !== bot.characterId);
    const target = isKiller
      ? shuffle(others)[0]
      : best(others, (c) => clues.split(c.name.toLowerCase().split(" ")[0]).length - 1 + c.name.toLowerCase().split(" ").reduce((n, w) => n + (w.length > 3 && clues.includes(w) ? 1 : 0), 0));
    const method = isKiller ? shuffle(k.methods.filter((m) => m.id !== k.truth.methodId))[0] : best(k.methods, (m) => overlap(m.text));
    const motive = isKiller ? shuffle(k.motives.filter((m) => m.id !== k.truth.motiveId))[0] : best(k.motives, (m) => overlap(m.text));
    if (target && method && motive) bot.ballot = { killerId: target.id, methodId: method.id, motiveId: motive.id };
  }
}

// ---------- heavy drinking night: player and host actions ----------
function drinkAction<T>(fn: () => T): T {
  try { return fn(); } catch (e) { if (e instanceof DrinkError) throw new HttpError(e.status, e.message); throw e; }
}
export const drinkAnswer = (room: Room, p: Player, promptId: string, answer: "drank" | "tapped") => drinkAction(() => answerPrompt(room, p, String(promptId), answer === "drank" ? "drank" : "tapped"));
export const drinkLog = (room: Room, p: Player) => drinkAction(() => logDrink(room, p));
export const drinkWater = (room: Room, p: Player) => drinkAction(() => logWater(room, p));
export const drinkDone = (room: Room, p: Player) => drinkAction(() => doneForNight(room, p));
export const drinkControl = (room: Room, op: string) => drinkAction(() => {
  if (!["pause", "resume", "water", "stop"].includes(op)) throw new HttpError(400, "Unknown control");
  drinkHostControl(room, op as "pause" | "resume" | "water" | "stop");
});
