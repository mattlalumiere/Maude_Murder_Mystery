import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { fitPlan, recommend, TIERS } from "./budget";
import { generateCase } from "./gm-ai";
import { queueAvatars, queuePhaseMedia, reconcilePlan } from "./media-jobs";
import { getMediaStore } from "./media-store";
import { money, sanitizeConfig, sanitizePlan, sanitizeProfile } from "./sanitize";
import { getStore, HttpError } from "./store";
import {
  PHASES, PHASE_INFO,
  type AgeGroup, type Ballot, type Character, type GameConfig, type MediaPlan, type Phase, type Player, type PlayerProfile, type Result, type Room,
} from "./types";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DAY = 24 * 3600;

const hashCode = (code: string, salt: string) => scryptSync(code.trim().toLowerCase(), salt, 32).toString("hex");
const rid = (n = 12) => randomBytes(n).toString("base64url");
const shuffle = <T,>(a: T[]) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
};

// ---------- creation / joining ----------
export async function createRoom(
  hostId: string, overrideCode: string, configIn?: Partial<GameConfig>, capIn?: number, planIn?: Partial<MediaPlan>,
): Promise<Room> {
  if (overrideCode.trim().length < 4) throw new HttpError(400, "Override code must be at least 4 characters");
  const config = sanitizeConfig(configIn);
  const cap = money(capIn);
  const expected = config.expected.adults + config.expected.kids + config.expected.toddlers;
  const plan = fitPlan(sanitizePlan(planIn ?? (recommend(cap, expected).best ?? TIERS[0]).plan), cap, expected);
  const store = getStore();
  for (let i = 0; i < 20; i++) {
    const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
    const salt = rid(8);
    const now = Math.floor(Date.now() / 1000);
    const room: Room = {
      code, version: 1, createdAt: now, ttl: now + DAY, hostId, config, media: [],
      budget: { capUsd: cap, spentUsd: 0, reservedUsd: 0, plan },
      overrideSalt: salt, overrideHash: hashCode(overrideCode, salt),
      failedOverrides: 0, lockedUntil: 0, overrideUsed: false,
      phase: "lobby", phaseStartedAt: Date.now(), paused: false,
      players: [], releasedClueIds: [], ballotsOpen: false,
    };
    if (await store.put(room, null)) return room;
  }
  throw new HttpError(500, "Could not allocate a room code");
}

export function addPlayer(room: Room, name: string, ageGroup: AgeGroup, wantsVictim: boolean, hasDevice = true, profile?: Partial<PlayerProfile>): Player {
  if (room.phase !== "lobby") throw new HttpError(409, "The game has already started");
  const clean = name.trim().slice(0, 24);
  if (!clean) throw new HttpError(400, "Name required");
  if (!["little", "kid", "teen", "adult"].includes(ageGroup)) throw new HttpError(400, "Bad age group");
  if (room.players.length >= 40) throw new HttpError(409, "Room is full");
  if (room.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) throw new HttpError(409, "That name is taken");
  const p: Player = {
    id: rid(6), name: clean, ageGroup, wantsVictim, token: rid(18), ready: false, hasDevice,
    profile: sanitizeProfile(profile, room.config.allowPlayerBackstory),
  };
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
    id: `guest-${kid ? "k" : "a"}${n}`, name: kid ? `Little Guest ${n}` : `Party Guest ${n}`,
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

  // Victim: volunteer kid/teen > any kid/teen > volunteer adult > random adult.
  const young = room.players.filter((p) => p.ageGroup === "kid" || p.ageGroup === "teen");
  const victimPlayer =
    young.find((p) => p.wantsVictim) ?? young.find((p) => p.ageGroup === "kid") ?? young[0] ??
    room.players.find((p) => p.wantsVictim && p.ageGroup === "adult") ?? shuffle(room.players.filter((p) => p.ageGroup === "adult"))[0];
  const victim = chars.find((c) => c.id === k.victimId)!;
  assign(victimPlayer, victim);

  // Killer goes to a random adult.
  const adults = shuffle(room.players.filter((p) => p.ageGroup === "adult" && !p.characterId));
  const killer = chars.find((c) => c.id === k.killerId)!;
  assign(adults.shift()!, killer);

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
  if (room.players.length < 4) throw new HttpError(400, "Need at least 4 players");
  if (room.players.filter((p) => p.ageGroup === "adult").length < 2) throw new HttpError(400, "Need at least 2 adults");
  const adults = room.players.filter((p) => p.ageGroup === "adult").length;
  const gen = await generateCase(
    {
      adults, kids: room.players.length - adults, littles: room.players.filter((p) => p.ageGroup === "little").length,
      players: room.players.map((p, i) => ({ handle: `P${i + 1}`, ageGroup: p.ageGroup, mode: p.profile.backstoryMode, text: p.profile.backstory })),
    },
    room.config,
  );
  room.case = gen.case;
  room.caseSource = gen.source;
  castPlayers(room);
  queueAvatars(room);
  setPhase(room, "cards");
}

// ---------- phases ----------
function setPhase(room: Room, phase: Phase) {
  room.phase = phase;
  room.phaseStartedAt = Date.now();
  const k = room.case!;
  const release = (ids: string[]) => ids.forEach((id) => !room.releasedClueIds.includes(id) && room.releasedClueIds.push(id));
  if (phase === "act2") release(k.clues.filter((c) => c.round === 1).map((c) => c.id));
  if (phase === "act3") release([...k.clues.filter((c) => c.round === 2).map((c) => c.id), "twist"]);
  room.ballotsOpen = phase === "act4";
  if (phase === "reveal") room.result = computeResult(room);
  queuePhaseMedia(room, phase);
}

export function advance(room: Room) {
  if (room.paused) throw new HttpError(409, "Game is paused");
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

  const nameOf = (pred: (p: Player) => boolean) => room.players.find(pred)?.name;
  const killerP = nameOf((p) => p.characterId === k.killerId);
  const victimP = nameOf((p) => p.characterId === k.victimId);
  const mascotP = room.players.find((p) => k.characters.find((c) => c.id === p.characterId)?.role === "mascot")?.name;
  const awards: Result["awards"] = [];
  if (scores[0]) awards.push({ award: "Detective of the Night", to: scores[0].name });
  if (killerP) awards.push({ award: "Best Liar", to: killerP });
  if (victimP) { awards.push({ award: "Most Dramatic Death", to: victimP }); awards.push({ award: "Ghost MVP", to: victimP }); }
  if (mascotP) awards.push({ award: "Mascot of Honor", to: mascotP });
  const rest = shuffle(room.players.map((p) => p.name));
  if (rest[0]) awards.push({ award: "Best Entrance", to: rest[0] });
  return { killerId: k.killerId, methodId: k.truth.methodId, motiveId: k.truth.motiveId, story: k.truth.story, scores, awards };
}

// ---------- Host Override Code ----------
export type OverrideCmd = "NUDGE" | "ADVANCED" | "ACCELERATE" | "FINAL" | "FINAL_REVEAL";

export function override(room: Room, code: string, cmd: OverrideCmd, confirm: boolean): { message: string; needsConfirm?: boolean } {
  if (!room.case) throw new HttpError(409, "No case yet");
  if (Date.now() < room.lockedUntil) throw new HttpError(429, "Security guard Gerald is guarding the vault. Try again later.");
  const a = Buffer.from(hashCode(code ?? "", room.overrideSalt));
  const b = Buffer.from(room.overrideHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    room.failedOverrides += 1;
    if (room.failedOverrides >= 3) {
      room.failedOverrides = 0;
      room.lockedUntil = Date.now() + 10 * 60 * 1000;
      throw new HttpError(429, "Alarm! Security guard Gerald approaches. Overrides locked for 10 minutes.");
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
        return { playerName: p.name, characterName: c?.name ?? "", house: c?.house ?? "", tease: c?.tease ?? "", kid: c?.kid ?? false, avatarId: p.profile.avatarId };
      })
    : [];
  const clues = k
    ? [...k.clues, { id: "twist", round: 2 as const, text: k.twist }].filter((c) => room.releasedClueIds.includes(c.id)).map((c) => ({ id: c.id, round: c.round, text: c.text }))
    : [];
  return {
    code: room.code, version: room.version, phase: room.phase, phaseTitle: info.title, clock: info.clock, paused: room.paused,
    title: k?.title, setting: k?.setting, partyName: room.config.name || k?.title || "Murder Mystery Night",
    media: room.media.filter((m) => m.status === "done").map((m) => ({ id: m.id, kind: m.kind, phase: m.phase, caption: m.caption, mime: m.mime })),
    narration: k?.narration[room.phase],
    lobbyNames: room.players.map((p) => p.name),
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
    me: {
      id: p.id, name: p.name, ageGroup: p.ageGroup, ready: p.ready, ballot: p.ballot, avatarId: p.profile.avatarId,
      profile: { backstoryMode: p.profile.backstoryMode, backstory: p.profile.backstory, consent: p.profile.consent, hasPhoto: !!p.profile.photoKey },
      character: c ? { id: c.id, name: c.name, house: c.house, tease: c.tease, kid: c.kid, role: c.role, card: c.card } : undefined,
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
    caseSource: room.caseSource,
    budget: room.budget,
    jobs: room.media.slice(-60).map((m) => ({ id: m.id, kind: m.kind, phase: m.phase, status: m.status, note: m.note, est: m.estCostUsd, caption: m.caption })),
    runSheet: PHASES.map((ph) => ({ phase: ph, ...PHASE_INFO[ph] })),
    players: room.players.map((p) => ({
      id: p.id, name: p.name, ageGroup: p.ageGroup, ready: p.ready, hasDevice: p.hasDevice, ballot: !!p.ballot,
      hasPhoto: !!p.profile.photoKey, backstory: p.profile.backstoryMode,
      characterName: k?.characters.find((c) => c.id === p.characterId)?.name,
    })),
  };
}

export function authPlayer(room: Room, id: string | null, token: string | null): Player {
  const p = room.players.find((x) => x.id === id);
  if (!p || !token || p.token !== token) throw new HttpError(401, "Unknown player");
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

export async function purgePhotos(room: Room) {
  await getMediaStore().deletePrefix(`${room.code}/photos`);
  for (const p of room.players) { p.profile.photoKey = undefined; p.profile.consent = "none"; }
}
