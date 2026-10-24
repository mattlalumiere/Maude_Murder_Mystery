import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addPlayer, advance, authPlayer, createRoom, hostView, override, playerView, publicView, setPhoto, setPlan, startGame, submitBallot } from "../../../src/lib/engine";
import { LIMITS, setLimits } from "../../../src/lib/engine-limits";
import { isUlid, JOIN_ALPHABET, seededRandom, setRuntime } from "../../../src/lib/ids";
import { PHASES } from "../../../src/lib/types";
import { DEFAULT_ROSTER, lobbyRoom, rosterOf, startedRoom } from "./helpers/rooms";
import { useDeterministicRuntime } from "./helpers/runtime";

const rt = useDeterministicRuntime(11);
const throwsStatus = (fn: () => unknown, status: number, re?: RegExp) => {
  try { fn(); } catch (e) { expect((e as { status: number }).status).toBe(status); if (re) expect((e as Error).message).toMatch(re); return; }
  throw new Error("expected a throw");
};

describe("createRoom and identity", () => {
  const saved = { c: process.env.CELL_ID, r: process.env.REGION_ID };
  afterEach(() => { process.env.CELL_ID = saved.c; process.env.REGION_ID = saved.r; if (saved.c === undefined) delete process.env.CELL_ID; if (saved.r === undefined) delete process.env.REGION_ID; });

  it("gives a ULID gameId, a short code, and cell/region from env", async () => {
    process.env.CELL_ID = "eu-3"; process.env.REGION_ID = "eu";
    const room = await createRoom("h", "swordfish");
    expect(isUlid(room.gameId)).toBe(true);
    expect(room.cellId).toBe("eu-3");
    expect(room.regionId).toBe("eu");
    expect(room.code).toMatch(new RegExp(`^[${JOIN_ALPHABET}]{4,6}$`));
    expect(room.gameId).not.toContain(room.code);
  });
  it("defaults cell and region", async () => {
    delete process.env.CELL_ID; delete process.env.REGION_ID;
    const room = await createRoom("h", "swordfish");
    expect([room.cellId, room.regionId]).toEqual(["local-0", "local"]);
  });
  it("asks the directory callback and avoids taken codes", async () => {
    const asked: string[] = [];
    const room = await createRoom("h", "swordfish", undefined, undefined, undefined, {
      codeExists: async (c) => { asked.push(c); return asked.length < 4; },
    });
    expect(asked.length).toBe(4);
    expect(asked.slice(0, 3)).not.toContain(room.code);
    expect(room.code).toBe(asked[3]);
  });
  it("uses the clock for createdAt, ttl and phaseStartedAt", async () => {
    const room = await createRoom("h", "swordfish");
    expect(room.createdAt).toBe(Math.floor(rt.clock.now() / 1000));
    expect(room.ttl).toBe(room.createdAt + 24 * 3600);
    expect(room.phaseStartedAt).toBe(rt.clock.now());
  });
  it("never stores the override code in the clear and salts per room", async () => {
    const a = await createRoom("h", "swordfish");
    const b = await createRoom("h", "swordfish");
    expect(JSON.stringify(a)).not.toContain("swordfish");
    expect(a.overrideHash).not.toBe(b.overrideHash);
    expect(a.overrideSalt).not.toBe(b.overrideSalt);
  });
  it("rejects short or oversized override codes", async () => {
    await expect(createRoom("h", "abc")).rejects.toMatchObject({ status: 400 });
    await expect(createRoom("h", "x".repeat(LIMITS.overrideCodeMax + 1))).rejects.toMatchObject({ status: 400 });
  });
  it("starts in the lobby with nothing released", async () => {
    const room = await createRoom("h", "swordfish");
    expect(room).toMatchObject({ phase: "lobby", paused: false, players: [], releasedClueIds: [], ballotsOpen: false, failedOverrides: 0, lockedUntil: 0, version: 1 });
  });
});

describe("addPlayer rules", () => {
  it("trims, caps and validates names", async () => {
    const room = await createRoom("h", "swordfish");
    expect(addPlayer(room, "  Ann  ", "adult", false).name).toBe("Ann");
    expect(addPlayer(room, "n".repeat(100), "adult", false).name).toHaveLength(LIMITS.playerName);
    throwsStatus(() => addPlayer(room, "   ", "adult", false), 400);
    throwsStatus(() => addPlayer(room, "Bob", "martian" as never, false), 400);
    throwsStatus(() => addPlayer(room, "ann", "adult", false), 409, /taken/);
  });
  it("enforces the max players quota", async () => {
    const room = await createRoom("h", "swordfish");
    for (let i = 0; i < LIMITS.maxPlayers; i++) addPlayer(room, `P${i}`, "adult", false);
    throwsStatus(() => addPlayer(room, "Extra", "adult", false), 409, /full/i);
  });
  it("honours a lowered quota", async () => {
    const restore = setLimits({ maxPlayers: 5 });
    try {
      const room = await createRoom("h", "swordfish");
      for (let i = 0; i < 5; i++) addPlayer(room, `P${i}`, "adult", false);
      throwsStatus(() => addPlayer(room, "Extra", "adult", false), 409);
    } finally { restore(); }
  });
  it("gives each player a unique id and a secret token, and caps backstory", async () => {
    const room = await createRoom("h", "swordfish");
    const a = addPlayer(room, "Ann", "adult", false, true, { backstoryMode: "own", backstory: "z".repeat(9999) });
    const b = addPlayer(room, "Bob", "adult", false);
    expect(a.id).not.toBe(b.id);
    expect(a.token.length).toBeGreaterThanOrEqual(18);
    expect(a.profile.backstory).toHaveLength(LIMITS.backstory);
  });
  it("is closed after the game starts", async () => {
    const room = await startedRoom();
    throwsStatus(() => addPlayer(room, "Late", "adult", false), 409, /started/);
  });
  it("authPlayer needs both id and token", async () => {
    const room = await lobbyRoom();
    const p = room.players[0];
    expect(authPlayer(room, p.id, p.token)).toBe(p);
    throwsStatus(() => authPlayer(room, p.id, "bad"), 401);
    throwsStatus(() => authPlayer(room, p.id, null), 401);
    throwsStatus(() => authPlayer(room, "nope", p.token), 401);
  });
});

describe("startGame", () => {
  it("needs 4 players and 2 adults", async () => {
    const few = await lobbyRoom(rosterOf(2, 1));
    await expect(startGame(few)).rejects.toMatchObject({ status: 400 });
    const oneAdult = await lobbyRoom(rosterOf(1, 3));
    await expect(startGame(oneAdult)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/adults/) });
  });
  it("moves lobby to cards once, with a case", async () => {
    const room = await lobbyRoom();
    await startGame(room);
    expect(room.phase).toBe("cards");
    expect(room.case).toBeDefined();
    expect(room.caseSource).toBe("sample");
    await expect(startGame(room)).rejects.toMatchObject({ status: 409 });
  });
  it("does not share the case object with the sample constant", async () => {
    const a = await startedRoom(rosterOf(4));
    a.case!.title = "mutated";
    const b = await startedRoom(rosterOf(4));
    expect(b.case!.title).not.toBe("mutated");
  });
});

describe("casting", () => {
  const assertCast = (room: Awaited<ReturnType<typeof startedRoom>>) => {
    const k = room.case!;
    expect(new Set(room.players.map((p) => p.characterId)).size).toBe(room.players.length);
    room.players.forEach((p) => expect(k.characters.some((c) => c.id === p.characterId)).toBe(true));
    const killer = room.players.find((p) => p.characterId === k.killerId)!;
    expect(killer.ageGroup).toBe("adult");
    expect(room.players.filter((p) => p.characterId === k.victimId)).toHaveLength(1);
    // adults never receive a kid character except as the victim of an all-adult table
    for (const p of room.players) {
      const c = k.characters.find((x) => x.id === p.characterId)!;
      if (p.ageGroup === "adult" && c.id !== k.victimId) expect(c.kid).toBe(false);
      if (p.ageGroup !== "adult") expect(c.kid).toBe(true);
    }
  };

  it("casts the default mixed party: killer adult, volunteer kid is the victim", async () => {
    const room = await lobbyRoom(DEFAULT_ROSTER);
    room.players.find((p) => p.name === "Maya")!.wantsVictim = true;
    await startGame(room);
    assertCast(room);
    expect(room.players.find((p) => p.characterId === room.case!.victimId)!.name).toBe("Maya");
  });
  it("prefers any kid over a teen when nobody volunteers", async () => {
    const room = await startedRoom(rosterOf(4, 1, 1));
    expect(room.players.find((p) => p.characterId === room.case!.victimId)!.ageGroup).toBe("kid");
  });
  it("falls back to a teen, then to a volunteering adult, then to a random adult", async () => {
    const teen = await startedRoom(rosterOf(4, 0, 1));
    expect(teen.players.find((p) => p.characterId === teen.case!.victimId)!.ageGroup).toBe("teen");
    const vol = await lobbyRoom(rosterOf(4));
    vol.players[2].wantsVictim = true;
    await startGame(vol);
    expect(vol.players[2].characterId).toBe(vol.case!.victimId);
    const rnd = await startedRoom(rosterOf(4));
    expect(rnd.players.filter((p) => p.characterId === rnd.case!.victimId)).toHaveLength(1);
  });
  it("casts every size from 4 to the max with mixed and odd age splits", async () => {
    for (let n = 4; n <= LIMITS.maxPlayers; n++) {
      const adults = Math.max(2, Math.ceil(n / 2));
      const rest = n - adults;
      const kids = Math.ceil(rest / 2), teens = Math.floor(rest / 4), littles = rest - kids - teens;
      assertCast(await startedRoom(rosterOf(adults, kids, teens, littles)));
    }
  });
  it("adds generic guests when the case has too few characters", async () => {
    const room = await startedRoom(rosterOf(24, 10, 4, 2));
    assertCast(room);
    expect(room.case!.characters.some((c) => c.id.startsWith("guest-a"))).toBe(true);
    expect(room.case!.characters.some((c) => c.id.startsWith("guest-k"))).toBe(true);
  });
  it("never casts a little player as the victim or as a ballot suspect", async () => {
    for (let n = 0; n < 10; n++) {
      const room = await startedRoom(rosterOf(4, 0, 0, 4 + n % 3));
      const little = room.players.filter((p) => p.ageGroup === "little");
      expect(little.every((p) => p.characterId !== room.case!.victimId)).toBe(true);
      while (room.phase !== "act4") advance(room);
      const ids = publicView(room).ballotOptions!.suspects.map((s) => s.id);
      expect(little.some((p) => ids.includes(p.characterId!))).toBe(false);
    }
  });
  it("gives little players the mascot before other kid roles", async () => {
    const room = await startedRoom(rosterOf(4, 0, 0, 1));
    const little = room.players.find((p) => p.ageGroup === "little")!;
    const victim = room.players.find((p) => p.characterId === room.case!.victimId)!;
    if (victim !== little) expect(room.case!.characters.find((c) => c.id === little.characterId)!.role).toBe("mascot");
  });
  it("puts own backstory and hints on the card in the player's own words", async () => {
    const room = await createRoom("h", "swordfish");
    addPlayer(room, "Ann", "adult", false, true, { backstoryMode: "own", backstory: "I am a retired circus strongman." });
    addPlayer(room, "Bea", "adult", false, true, { backstoryMode: "hint", backstory: "make me a spy" });
    addPlayer(room, "Cy", "adult", false); addPlayer(room, "Di", "adult", false);
    await startGame(room);
    const card = (n: string) => room.case!.characters.find((c) => c.id === room.players.find((p) => p.name === n)!.characterId)!.card;
    expect(card("Ann").extra).toContain("retired circus strongman");
    expect(card("Ann").extra).toMatch(/Your own backstory/);
    expect(card("Bea").extra).toMatch(/Your idea for the GM/);
    expect(card("Cy").extra).toBeUndefined();
  });
  it("is deterministic under a seeded random", async () => {
    const lobby = await lobbyRoom(rosterOf(6, 2, 1, 1));
    const cast = async () => {
      const r = structuredClone(lobby);
      const restore = setRuntime({ random: seededRandom(99) });
      try { await startGame(r); } finally { restore(); }
      return r.players.map((p) => `${p.name}:${p.characterId}`).join(",");
    };
    expect(await cast()).toBe(await cast());
  });
});

describe("phases", () => {
  it("walks every phase in order and stops after the reveal", async () => {
    const room = await startedRoom();
    const seen = [room.phase];
    while (room.phase !== "reveal") { rt.clock.advance(1000); advance(room); seen.push(room.phase); }
    expect(seen).toEqual(PHASES.slice(1));
    throwsStatus(() => advance(room), 409, /over/);
  });
  it("cannot advance from the lobby", async () => {
    throwsStatus(() => advance(lobbyForAdvance), 409, /Start/);
  });
  it("stamps phaseStartedAt from the clock", async () => {
    const room = await startedRoom();
    rt.clock.advance(5000);
    advance(room);
    expect(room.phaseStartedAt).toBe(rt.clock.now());
  });
  it("releases clues round by round and the twist in act3", async () => {
    const room = await startedRoom();
    const n = () => publicView(room).clues.length;
    expect(n()).toBe(0);
    advance(room); advance(room); advance(room); // act1, death, act2
    expect(room.phase).toBe("act2");
    expect(n()).toBe(6);
    advance(room); expect(n()).toBe(6); // intermission
    advance(room); expect(n()).toBe(13); // act3 adds round 2 and the twist
    expect(publicView(room).clues.some((c) => c.id === "twist")).toBe(true);
    advance(room); expect(n()).toBe(13);
  });
  it("never releases the same clue twice", async () => {
    const room = await startedRoom();
    while (room.phase !== "reveal") advance(room);
    expect(new Set(room.releasedClueIds).size).toBe(room.releasedClueIds.length);
  });
  it("enforces the max released clues quota", async () => {
    const restore = setLimits({ maxCluesReleased: 8 });
    try {
      const room = await startedRoom();
      while (room.phase !== "reveal") advance(room);
      expect(room.releasedClueIds.length).toBe(8);
    } finally { restore(); }
  });
  it("opens ballots only in act4", async () => {
    const room = await startedRoom();
    const open: Record<string, boolean> = {};
    while (room.phase !== "reveal") { advance(room); open[room.phase] = room.ballotsOpen; }
    expect(Object.entries(open).filter(([, v]) => v).map(([k]) => k)).toEqual(["act4"]);
    expect(room.ballotsOpen).toBe(false);
  });
  it("blocks advance while paused", async () => {
    const room = await startedRoom();
    room.paused = true;
    throwsStatus(() => advance(room), 409, /paused/);
  });
});

describe("ballots", () => {
  const good = (room: Awaited<ReturnType<typeof startedRoom>>) => ({ killerId: room.case!.killerId, methodId: room.case!.truth.methodId, motiveId: room.case!.truth.motiveId });
  const toAct4 = (room: Awaited<ReturnType<typeof startedRoom>>) => { while (room.phase !== "act4") advance(room); };

  it("rejects ballots before act4 and after the reveal", async () => {
    const room = await startedRoom();
    throwsStatus(() => submitBallot(room, room.players[0], good(room)), 409);
    toAct4(room); advance(room);
    throwsStatus(() => submitBallot(room, room.players[0], good(room)), 409);
  });
  it("rejects unknown ids, the victim, kids and unassigned characters as killer", async () => {
    const room = await startedRoom(rosterOf(4, 1));
    toAct4(room);
    const k = room.case!;
    const p = room.players[0];
    throwsStatus(() => submitBallot(room, p, { ...good(room), killerId: "nobody" }), 400);
    throwsStatus(() => submitBallot(room, p, { ...good(room), killerId: k.victimId }), 400);
    throwsStatus(() => submitBallot(room, p, { ...good(room), killerId: "pip" }), 400);
    throwsStatus(() => submitBallot(room, p, { ...good(room), methodId: "x" }), 400);
    throwsStatus(() => submitBallot(room, p, { ...good(room), motiveId: "x" }), 400);
    expect(p.ballot).toBeUndefined();
  });
  it("stores only the three ids and lets a player change their mind", async () => {
    const room = await startedRoom();
    toAct4(room);
    const p = room.players[0];
    submitBallot(room, p, { ...good(room), extra: "evil" } as never);
    expect(Object.keys(p.ballot!).sort()).toEqual(["killerId", "methodId", "motiveId"]);
    const other = room.case!.methods.find((m) => m.id !== room.case!.truth.methodId)!.id;
    submitBallot(room, p, { ...good(room), methodId: other });
    expect(p.ballot!.methodId).toBe(other);
  });
  it("ballot options exclude the victim and kids", async () => {
    const room = await startedRoom();
    toAct4(room);
    const opts = publicView(room).ballotOptions!;
    const ids = opts.suspects.map((s) => s.id);
    expect(ids).not.toContain(room.case!.victimId);
    expect(ids).toContain(room.case!.killerId);
    expect(ids.every((id) => !room.case!.characters.find((c) => c.id === id)!.kid)).toBe(true);
  });
});

describe("scoring and reveal", () => {
  async function playTo(votes: (i: number, k: NonNullable<Awaited<ReturnType<typeof startedRoom>>["case"]>, others: string[]) => { killerId: string; methodId: string; motiveId: string } | null) {
    const room = await startedRoom();
    while (room.phase !== "act4") advance(room);
    const k = room.case!;
    const others = publicView(room).ballotOptions!.suspects.map((s) => s.id).filter((id) => id !== k.killerId);
    room.players.forEach((p, i) => { const b = votes(i, k, others); if (b) submitBallot(room, p, b); });
    advance(room);
    return room;
  }
  const wrong = (k: { truth: { methodId: string; motiveId: string }; methods: { id: string }[]; motives: { id: string }[] }, others: string[]) => ({
    killerId: others[0], methodId: k.methods.find((m) => m.id !== k.truth.methodId)!.id, motiveId: k.motives.find((m) => m.id !== k.truth.motiveId)!.id,
  });
  const right = (k: { killerId: string; truth: { methodId: string; motiveId: string } }) => ({ killerId: k.killerId, methodId: k.truth.methodId, motiveId: k.truth.motiveId });

  it("awards 3 for killer, 1 method, 1 motive", async () => {
    const room = await playTo((i, k) => (i === 0 ? right(k) : null));
    const s = room.result!.scores.find((x) => x.playerId === room.players[0].id)!;
    expect(s.points).toBe(5);
    expect(s.detail).toBe("killer +3, method +1, motive +1");
    const none = room.result!.scores.find((x) => x.playerId === room.players[1].id)!;
    expect(none.detail).toContain("no ballot");
  });
  it("scores a partly right ballot", async () => {
    const room = await playTo((i, k, others) => (i === 0 ? { killerId: others[0], methodId: k.truth.methodId, motiveId: k.motives.find((m) => m.id !== k.truth.motiveId)!.id } : null));
    const s = room.result!.scores.find((x) => x.playerId === room.players[0].id)!;
    expect(s.points).toBe(1);
    expect(s.detail).toBe("method +1");
  });
  it("gives the killer +5 for getting away when fewer than half the voters were right", async () => {
    const room = await playTo((i, k, others) => (i < 3 ? right(k) : wrong(k, others)));
    const killerP = room.players.find((p) => p.characterId === room.case!.killerId)!;
    const row = room.result!.scores.find((x) => x.playerId === killerP.id)!;
    expect(row.detail).toContain("got away with it +5");
  });
  it("does not give the +5 when half or more got it right, or when nobody voted", async () => {
    const half = await playTo((i, k, others) => (i % 2 === 0 ? right(k) : wrong(k, others)));
    const kp = half.players.find((p) => p.characterId === half.case!.killerId)!;
    expect(half.result!.scores.find((x) => x.playerId === kp.id)!.detail).not.toContain("got away");
    const none = await playTo(() => null);
    expect(none.result!.scores.every((x) => !x.detail.includes("got away"))).toBe(true);
  });
  it("sorts scores and hands out awards", async () => {
    const room = await playTo((i, k) => (i === 2 ? right(k) : null));
    const r = room.result!;
    expect(r.scores[0].playerId).toBe(room.players[2].id);
    expect(r.scores.map((s) => s.points)).toEqual([...r.scores.map((s) => s.points)].sort((a, b) => b - a));
    const byAward = Object.fromEntries(r.awards.map((a) => [a.award, a.to]));
    expect(byAward["Detective of the Night"]).toBe(room.players[2].name);
    expect(byAward["Best Liar"]).toBe(room.players.find((p) => p.characterId === room.case!.killerId)!.name);
    expect(byAward["Most Dramatic Death"]).toBe(room.players.find((p) => p.characterId === room.case!.victimId)!.name);
    expect(byAward["Mascot of Honor"]).toBeDefined();
    expect(byAward["Best Entrance"]).toBeDefined();
  });
  it("shows the reveal only in the reveal phase", async () => {
    const room = await playTo(() => null);
    const v = publicView(room);
    expect(v.reveal?.killer).toBe("Carol Greenthumb");
    expect(v.reveal?.story).toBe(room.case!.truth.story);
    const early = await startedRoom();
    expect(publicView(early).reveal).toBeUndefined();
  });
});

describe("Host Override Code", () => {
  const live = async () => { const r = await startedRoom(); while (r.phase !== "act2") advance(r); return r; };
  const fails = (room: Awaited<ReturnType<typeof live>>, n: number, code = "wrong") => { for (let i = 0; i < n; i++) { try { override(room, code, "NUDGE", false); } catch { /* counted */ } } };

  it("needs a case", async () => {
    const room = await lobbyRoom();
    throwsStatus(() => override(room, "swordfish", "NUDGE", false), 409);
  });
  it("checks the lock before anything else, even without a case", async () => {
    const room = await lobbyRoom();
    room.lockedUntil = rt.clock.now() + 1000;
    throwsStatus(() => override(room, "swordfish", "NUDGE", false), 429);
  });
  it("accepts the code trimmed and case-insensitive; NUDGE and ADVANCED differ in cost", async () => {
    const room = await live();
    const n = override(room, "  SwordFish ", "NUDGE", false);
    expect(n.message).toBe(room.case!.nudges.act2);
    expect(n.message).not.toMatch(/revoked/);
    const a = override(room, "swordfish", "ADVANCED", false);
    expect(a.message).toContain(room.case!.advanced.act2!);
    expect(a.message).toMatch(/license has been revoked/);
    expect(room.overrideUsed).toBe(true);
  });
  it("falls back to a generic hint for a phase without one", async () => {
    const room = await startedRoom(); // cards
    expect(override(room, "swordfish", "NUDGE", false).message).toMatch(/Re-read the clues/);
  });
  it("ACCELERATE advances one phase and clears pause", async () => {
    const room = await live();
    room.paused = true;
    const r = override(room, "swordfish", "ACCELERATE", false);
    expect(room.phase).toBe("intermission");
    expect(room.paused).toBe(false);
    expect(r.message).toMatch(/Intermission/);
  });
  it("FINAL asks to confirm, then reveals the solution as text without ending the game", async () => {
    const room = await live();
    const ask = override(room, "swordfish", "FINAL", false);
    expect(ask.needsConfirm).toBe(true);
    expect(room.overrideUsed).toBe(false);
    const done = override(room, "swordfish", "FINAL", true);
    expect(done.message).toContain("Carol Greenthumb");
    expect(done.message).toContain(room.case!.truth.story);
    expect(room.phase).toBe("act2");
    expect(room.overrideUsed).toBe(true);
  });
  it("FINAL_REVEAL jumps to the reveal and computes the result", async () => {
    const room = await live();
    expect(override(room, "swordfish", "FINAL_REVEAL", false).needsConfirm).toBe(true);
    expect(room.phase).toBe("act2");
    override(room, "swordfish", "FINAL_REVEAL", true);
    expect(room.phase).toBe("reveal");
    expect(room.result).toBeDefined();
  });
  it("counts wrong codes, resets on success, and tells nothing about the code", async () => {
    const room = await live();
    fails(room, 2);
    expect(room.failedOverrides).toBe(2);
    try { override(room, "wrong", "NUDGE", false); } catch (e) { expect((e as Error).message).not.toContain("swordfish"); }
    const room2 = await live();
    fails(room2, 2);
    override(room2, "swordfish", "NUDGE", false);
    expect(room2.failedOverrides).toBe(0);
  });
  it("locks for exactly 10 minutes after 3 failures, even for the right code", async () => {
    const room = await live();
    fails(room, 2);
    throwsStatus(() => override(room, "wrong", "NUDGE", false), 429, /10 minutes/);
    expect(room.lockedUntil).toBe(rt.clock.now() + 10 * 60 * 1000);
    expect(hostView(room).lockedUntil).toBe(room.lockedUntil);
    throwsStatus(() => override(room, "swordfish", "NUDGE", false), 429, /Gerald/);
    rt.clock.advance(10 * 60 * 1000 - 1);
    throwsStatus(() => override(room, "swordfish", "NUDGE", false), 429);
    rt.clock.advance(1);
    expect(override(room, "swordfish", "NUDGE", false).message.length).toBeGreaterThan(0);
  });
  it("does not count attempts made while locked, and a fresh run of 3 relocks", async () => {
    const room = await live();
    fails(room, 3);
    fails(room, 5);
    expect(room.failedOverrides).toBe(0);
    rt.clock.advance(10 * 60 * 1000);
    fails(room, 3);
    expect(room.lockedUntil).toBe(rt.clock.now() + 10 * 60 * 1000);
  });
  it("copes with junk and giant codes without exploding", async () => {
    const room = await live();
    throwsStatus(() => override(room, undefined as never, "NUDGE", false), 403);
    throwsStatus(() => override(room, "x".repeat(100000), "NUDGE", false), 403);
  });
});

describe("media plan and photos", () => {
  it("setPlan refuses a cap below spend and applies a valid one", async () => {
    const room = await createRoom("h", "swordfish", undefined, 5);
    room.budget.spentUsd = 1;
    throwsStatus(() => setPlan(room, undefined, 0.5), 400, /cannot go below/);
    setPlan(room, { scenesPerAct: 1 }, 3);
    expect(room.budget.capUsd).toBe(3);
  });
  it("minors need guardian consent for a photo", async () => {
    const room = await lobbyRoom(rosterOf(2, 1));
    const kid = room.players.find((p) => p.ageGroup === "kid")!;
    throwsStatus(() => setPhoto(room, kid, "k", "self"), 400);
    setPhoto(room, kid, "k", "guardian");
    expect(kid.profile.consent).toBe("guardian");
    setPhoto(room, room.players[0], "a", "self");
    expect(room.players[0].profile.consent).toBe("self");
  });
});

describe("view shapes", () => {
  it("the player view carries only the player's own card", async () => {
    const room = await startedRoom();
    const p = room.players[3];
    const v = playerView(room, p);
    expect(v.me.character?.id).toBe(p.characterId);
    expect(JSON.stringify(v)).not.toContain("killerId");
  });
});

let lobbyForAdvance: Awaited<ReturnType<typeof lobbyRoom>>;
beforeEach(async () => { lobbyForAdvance = await lobbyRoom(); });
