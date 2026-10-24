// Scenario fixtures built through the real routes (create, join, start, advance), plus read helpers.
import { PHASES, type AgeGroup, type Phase, type Room } from "../../../src/lib/types";
import type { GameCtx, MmWorld, PlayerRef } from "./world";
import type { Res } from "./http";

export const HOST = "dev:Hana";

export function expectOk(res: Res, what: string): Res {
  if (res.status < 200 || res.status >= 300) throw new Error(`${what} failed: HTTP ${res.status} ${res.text.slice(0, 300)}`);
  return res;
}

export async function createGame(w: MmWorld, o: { host?: string; overrideCode?: string; cap?: number; config?: any; plan?: any; label?: string } = {}): Promise<GameCtx> {
  const host = o.host ?? w.session ?? HOST;
  const overrideCode = o.overrideCode ?? "hunter2";
  const res = expectOk(await w.call("POST", "/api/rooms", { host, body: { overrideCode, capUsd: o.cap ?? 5, config: o.config, plan: o.plan } }), "create game");
  const ctx: GameCtx = { label: o.label, code: res.json.code, hostId: host, overrideCode, players: [], alias: {} };
  w.game = ctx;
  if (o.label) w.games[o.label] = ctx;
  return ctx;
}

export async function joinPlayer(w: MmWorld, ctx: GameCtx, name: string, ageGroup: AgeGroup = "adult", extra: Record<string, unknown> = {}): Promise<PlayerRef> {
  const res = expectOk(await w.call("POST", `/api/rooms/${ctx.code}/join`, { body: { name, ageGroup, ...extra } }), `join ${name}`);
  const p = { name, id: res.json.playerId, token: res.json.token, ageGroup };
  ctx.players.push(p);
  return p;
}

export async function fillLobby(w: MmWorld, ctx: GameCtx, n: { adults?: number; kids?: number; teens?: number; littles?: number }) {
  const mk = (count: number | undefined, prefix: string, g: AgeGroup) => Array.from({ length: count ?? 0 }, (_, i) => [`${prefix}${i + 1}`, g] as const);
  for (const [name, g] of [...mk(n.adults, "Adult", "adult"), ...mk(n.kids, "Kid", "kid"), ...mk(n.teens, "Teen", "teen"), ...mk(n.littles, "Little", "little")]) {
    await joinPlayer(w, ctx, name, g);
  }
}

export const hostCall = (w: MmWorld, ctx: GameCtx, body: unknown, host = ctx.hostId) =>
  w.call("POST", `/api/rooms/${ctx.code}/action`, { host, body });
export const playerCall = (w: MmWorld, ctx: GameCtx, p: PlayerRef, body: unknown) =>
  w.call("POST", `/api/rooms/${ctx.code}/action`, { host: null, player: p, body });

export async function startGame(w: MmWorld, ctx: GameCtx = w.game) {
  expectOk(await hostCall(w, ctx, { type: "start" }), "start game");
  await assignAliases(w, ctx);
}

/** P1.. aliases: non-killer adults first, then the killer's player, then everyone else in join order. */
export async function assignAliases(w: MmWorld, ctx: GameCtx) {
  const room = await w.room(ctx);
  const killerChar = room.case!.killerId;
  const byId = new Map(ctx.players.map((p) => [p.id, p]));
  const roomPlayers = room.players.map((p) => ({ ref: byId.get(p.id)!, characterId: p.characterId, age: p.ageGroup }));
  const adultsNonKiller = roomPlayers.filter((p) => p.age === "adult" && p.characterId !== killerChar);
  const killer = roomPlayers.filter((p) => p.characterId === killerChar);
  const rest = roomPlayers.filter((p) => p.age !== "adult");
  const ordered = [...adultsNonKiller, ...killer, ...rest].map((p) => p.ref);
  ctx.alias = {};
  ordered.forEach((p, i) => { ctx.alias[`P${i + 1}`] = p; });
}

export async function startedGame(w: MmWorld, o: { adults?: number; kids?: number; teens?: number; littles?: number; config?: any; plan?: any; cap?: number; overrideCode?: string; label?: string; host?: string } = {}): Promise<GameCtx> {
  const ctx = await createGame(w, { config: o.config, plan: o.plan, cap: o.cap, overrideCode: o.overrideCode, label: o.label, host: o.host });
  await fillLobby(w, ctx, { adults: o.adults ?? 4, kids: o.kids ?? 2, teens: o.teens, littles: o.littles });
  await startGame(w, ctx);
  return ctx;
}

export async function advanceTo(w: MmWorld, ctx: GameCtx, phase: Phase) {
  const target = PHASES.indexOf(phase);
  for (;;) {
    const room = await w.room(ctx);
    const cur = PHASES.indexOf(room.phase);
    if (cur === target) return;
    if (cur > target) throw new Error(`game is already past ${phase} (in ${room.phase})`);
    if (room.phase === "lobby") await startGame(w, ctx);
    else expectOk(await hostCall(w, ctx, { type: "advance" }), `advance from ${room.phase}`);
  }
}

export function player(ctx: GameCtx, alias: string): PlayerRef {
  const p = ctx.alias[alias] ?? ctx.players.find((x) => x.name === alias);
  if (!p) throw new Error(`no player ${alias}`);
  return p;
}

export async function viewOf(w: MmWorld, ctx: GameCtx, who: "public" | "host" | PlayerRef, extra: { v?: number } = {}): Promise<Res> {
  if (who === "public") return w.call("GET", `/api/rooms/${ctx.code}/state`, { host: null, query: { role: "screen", ...(extra.v !== undefined ? { v: extra.v } : {}) } });
  if (who === "host") return w.call("GET", `/api/rooms/${ctx.code}/state`, { host: ctx.hostId, query: { role: "host", ...(extra.v !== undefined ? { v: extra.v } : {}) } });
  return w.call("GET", `/api/rooms/${ctx.code}/state`, { host: null, player: who, query: { role: "player", ...(extra.v !== undefined ? { v: extra.v } : {}) } });
}

/** Public, host and every player view as parsed JSON (fails if any is not 200). */
export async function allViews(w: MmWorld, ctx: GameCtx): Promise<{ who: string; json: any; text: string }[]> {
  const out: { who: string; json: any; text: string }[] = [];
  const pub = expectOk(await viewOf(w, ctx, "public"), "public view");
  out.push({ who: "public", json: pub.json, text: pub.text });
  const host = expectOk(await viewOf(w, ctx, "host"), "host view");
  out.push({ who: "host", json: host.json, text: host.text });
  for (const p of ctx.players) {
    const r = expectOk(await viewOf(w, ctx, p), `player view of ${p.name}`);
    out.push({ who: `player:${p.name}`, json: r.json, text: r.text });
  }
  return out;
}

// ---- case helpers ----
export const killerPlayer = (room: Room) => room.players.find((p) => p.characterId === room.case!.killerId)!;
export const characterOf = (room: Room, playerId: string) => room.case!.characters.find((c) => c.id === room.players.find((p) => p.id === playerId)?.characterId);

export function cardText(c: { card: Record<string, unknown> }, skipExtra = false): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(c.card)) {
    if (skipExtra && k === "extra") continue;
    if (typeof v === "string") out.push(v); else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") out.push(x);
  }
  return out;
}

export function correctBallot(room: Room) {
  return { killerId: room.case!.killerId, methodId: room.case!.truth.methodId, motiveId: room.case!.truth.motiveId };
}

export function wrongOption(list: { id: string }[], correct: string) {
  const o = list.find((x) => x.id !== correct);
  if (!o) throw new Error("no wrong option available");
  return o.id;
}

/** Valid-looking JPEG bytes: SOI marker plus padding, over the 1000 byte floor the route enforces. */
export function jpeg(size = 2048): Buffer {
  const b = Buffer.alloc(size, 0x41);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
  return b;
}

export async function uploadPhoto(w: MmWorld, ctx: GameCtx, p: PlayerRef, consent: string | null, bytes: Buffer = jpeg()): Promise<Res> {
  const headers: Record<string, string> = { "content-type": "image/jpeg" };
  if (consent) headers["x-consent"] = consent;
  return w.call("POST", `/api/rooms/${ctx.code}/photo`, { host: null, player: p, raw: new Uint8Array(bytes), headers });
}

export async function peekRoomByCode(w: MmWorld, code: string) { return w.store.peek(code); }
