import { describe, expect, it } from "vitest";
import { addPlayer, advance, createRoom, hostView, override, playerView, publicView, setPhoto, startGame, submitBallot } from "../../../src/lib/engine";
import { seededRandom, setRuntime } from "../../../src/lib/ids";
import type { AgeGroup, Room } from "../../../src/lib/types";
import { findLeaks, forbiddenFor } from "./helpers/secrets";
import { ManualClock } from "./helpers/runtime";
import { rosterOf, startedRoom } from "./helpers/rooms";

const checkAll = (room: Room, where: string) => {
  const bad: string[] = [];
  const run = (label: string, view: unknown, viewer: "public" | "host" | Room["players"][number]) => {
    for (const l of findLeaks(view, forbiddenFor(room, viewer))) bad.push(`${where} ${label} ${l}`);
  };
  run("public", publicView(room), "public");
  run("host", hostView(room), "host");
  for (const p of room.players) run(`player ${p.name}`, playerView(room, p), p);
  return bad;
};

describe("secrecy property: views never leak truth, other cards, photo keys, tokens or the override hash", () => {
  it("holds across many seeded random games and every phase transition", { timeout: 120_000 }, async () => {
    const failures: string[] = [];
    let checks = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const rnd = seededRandom(seed * 7919);
      const restore = setRuntime({ clock: new ManualClock(Date.UTC(2026, 0, 1) + seed), random: seededRandom(seed) });
      try {
        const n = 4 + rnd.int(27);
        const room = await createRoom("host", "swordfish");
        const groups: AgeGroup[] = ["adult", "adult", "adult", "kid", "teen", "little"];
        for (let i = 0; i < n; i++) {
          const g: AgeGroup = i < 2 ? "adult" : groups[rnd.int(groups.length)];
          const p = addPlayer(room, `Player${i}`, g, rnd.float() < 0.2, true,
            rnd.float() < 0.5 ? { backstoryMode: rnd.float() < 0.5 ? "own" : "hint", backstory: `backstory ${i} with the killer is secret?` } : undefined);
          if (rnd.float() < 0.5) setPhoto(room, p, `${room.code}/photos/${p.id}.jpg`, g === "adult" ? "self" : "guardian");
        }
        failures.push(...checkAll(room, `seed${seed}/lobby`)); checks++;
        await startGame(room);
        failures.push(...checkAll(room, `seed${seed}/cards`)); checks++;
        while (room.phase !== "reveal") {
          if (rnd.float() < 0.3) { try { override(room, "bad", "NUDGE", false); } catch { /* expected */ } }
          if (rnd.float() < 0.3) { try { override(room, "swordfish", rnd.float() < 0.5 ? "NUDGE" : "ADVANCED", false); } catch { /* maybe locked */ } failures.push(...checkAll(room, `seed${seed}/after-override`)); checks++; }
          advance(room);
          if (room.ballotsOpen) {
            const opts = publicView(room).ballotOptions!;
            room.players.forEach((p) => {
              if (rnd.float() < 0.7) submitBallot(room, p, { killerId: opts.suspects[rnd.int(opts.suspects.length)].id, methodId: opts.methods[rnd.int(4)].id, motiveId: opts.motives[rnd.int(4)].id });
            });
          }
          failures.push(...checkAll(room, `seed${seed}/${room.phase}`)); checks++;
        }
        expect(publicView(room).reveal).toBeDefined();
      } finally { restore(); }
    }
    expect(checks).toBeGreaterThan(200);
    expect([...new Set(failures.map((f) => f.replace(/seed\d+\//, "").replace(/player Player\d+/, "player")))].slice(0, 12)).toEqual([]);
  });

  it("holds when FINAL_REVEAL or ACCELERATE skip phases", async () => {
    const room = await startedRoom(rosterOf(6, 2, 1, 1));
    override(room, "swordfish", "ACCELERATE", false);
    expect(checkAll(room, "accelerate")).toEqual([]);
    override(room, "swordfish", "FINAL_REVEAL", true);
    expect(checkAll(room, "final-reveal")).toEqual([]);
    expect(publicView(room).reveal?.killer).toBeTruthy();
  });

  it("a pre-reveal view has no reveal block and a post-reveal view still hides credentials", async () => {
    const room = await startedRoom(rosterOf(6, 2));
    expect(publicView(room).reveal).toBeUndefined();
    expect(JSON.stringify(publicView(room))).not.toContain(room.case!.truth.story);
    override(room, "swordfish", "FINAL_REVEAL", true);
    const wire = JSON.stringify(hostView(room));
    expect(wire).not.toContain(room.overrideHash);
    expect(wire).not.toContain(room.players[0].token);
  });

  it("an overlong, hostile player name or backstory is inert text, never a field", async () => {
    const room = await createRoom("h", "swordfish");
    addPlayer(room, 'Ann","killerId":"x', "adult", false, true, { backstoryMode: "own", backstory: '</script>{"truth":1}' });
    ["B", "C", "D"].forEach((n) => addPlayer(room, n, "adult", false));
    await startGame(room);
    const wire = JSON.parse(JSON.stringify(publicView(room)));
    expect(Object.keys(wire)).not.toContain("killerId");
    expect(JSON.stringify(hostView(room))).not.toContain(room.overrideHash);
  });
});

describe("mutation check: the leak detector really catches leaks", () => {
  it("flags deliberately leaked fields in every view kind", async () => {
    const room = await startedRoom(rosterOf(6, 2));
    const k = room.case!;
    const other = room.players.find((p) => p.characterId !== room.case!.killerId && p.ageGroup === "adult")!;
    const f = (viewer: "public" | "host" | Room["players"][number]) => forbiddenFor(room, viewer);
    const pub = publicView(room);
    expect(findLeaks(pub, f("public"))).toEqual([]);

    expect(findLeaks({ ...pub, killerId: k.killerId }, f("public")).length).toBeGreaterThan(0);
    expect(findLeaks({ ...pub, deep: { a: [{ truth: { story: "x" } }] } }, f("public")).length).toBeGreaterThan(0);
    expect(findLeaks({ ...pub, note: `see ${k.truth.story}` }, f("public")).length).toBeGreaterThan(0);
    expect(findLeaks({ ...pub, hint: k.nudges.act2 }, f("public")).length).toBeGreaterThan(0);
    expect(findLeaks({ ...pub, who: k.killerId }, f("public")).length).toBeGreaterThan(0);

    const host = hostView(room);
    expect(findLeaks(host, f("host"))).toEqual([]);
    expect(findLeaks({ ...host, overrideHash: room.overrideHash }, f("host")).length).toBeGreaterThan(0);
    expect(findLeaks({ ...host, x: room.players[0].token }, f("host")).length).toBeGreaterThan(0);

    setPhoto(room, room.players[0], `${room.code}/photos/zzz.jpg`, "self");
    expect(findLeaks({ ...hostView(room), k: `${room.code}/photos/zzz.jpg` }, f("host")).length).toBeGreaterThan(0);

    const pv = playerView(room, other);
    expect(findLeaks(pv, f(other))).toEqual([]);
    const killerCard = k.characters.find((c) => c.id === k.killerId)!.card;
    expect(findLeaks({ ...pv, spy: killerCard.secret }, f(other)).length).toBeGreaterThan(0);
  });

  it("the real engine fails the check when a view is tampered with in place", async () => {
    const room = await startedRoom(rosterOf(6, 2));
    const tampered = { ...hostView(room), case: room.case };
    expect(findLeaks(tampered, forbiddenFor(room, "host")).length).toBeGreaterThan(0);
  });
});
