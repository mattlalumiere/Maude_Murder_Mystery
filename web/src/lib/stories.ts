// Saved stories: a replayable mystery ("story pack"), an optional recap of one night, a public gallery, and votes.
//
// Secrecy: the pack holds the whole solution, so it is sealed (AES-256-GCM) and only this server can open it.
// Hosts and storage readers see only the plaintext meta (title, blurb, cast preview without secrets).
// Storage: a separate durable blob store (stories must outlive the 1-day game cleanup).
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { join } from "node:path";
import { cleanLine } from "./bots";
import { PHASES, type CaseFile, type Phase, type Room } from "./types";
import { createMediaStore } from "./storage";
import { HttpError } from "./storage";
import type { MediaStore } from "./storage";

export const STORY_LIMITS = { maxPackBytes: 400_000, maxTitle: 80, maxBlurb: 280, maxLibrary: 50, maxGallery: 500, maxImages: 12, reportHideThreshold: 3 };

export type StoryKind = "story" | "cast";
export type Visibility = "link" | "public";

export interface CastPreview { id: string; name: string; house: string; tease: string; kid: boolean }
export interface StoryMeta {
  id: string; ownerKey: string; title: string; blurb: string; kind: StoryKind; visibility: Visibility; savedAt: number;
  setting: string; castCount: number; houses: string[]; characters?: CastPreview[];
  hasRecap: boolean; recapNames: boolean; recapPictures: boolean;
}
export interface RecapImage { id: string; kind: string; caption: string; mime: string }
export interface Recap {
  title: string; partyName: string; savedAt: number;
  narration: Partial<Record<Phase, string>>; clues: string[];
  reveal?: { killer: string; method: string; motive: string; story: string };
  scores: { name: string; points: number }[]; awards: { award: string; to: string }[];
  images: RecapImage[];
}
export interface Engagement { votes: number; playedVotes: number; plays: number; reports: number }
export interface GalleryEntry { id: string; title: string; blurb: string; kind: StoryKind; savedAt: number; castCount: number; votes: number; playedVotes: number; plays: number; reports: number }

// ---------- storage ----------
const g = globalThis as unknown as { __mmStories?: { key: string; store: MediaStore } };
export function getStoryStore(env: Record<string, string | undefined> = process.env): MediaStore {
  const key = JSON.stringify([env.MEDIA_ADAPTER, env.STORY_BUCKET, env.STORY_FILE_DIR, env.MEDIA_BUCKET, env.S3_BUCKET, env.CELL_ID]);
  if (g.__mmStories?.key === key) return g.__mmStories.store;
  const adapter = env.MEDIA_ADAPTER ?? (env.MEDIA_BUCKET ? "s3" : "file");
  const e: Record<string, string | undefined> = { ...env, MEDIA_FILE_DIR: env.STORY_FILE_DIR || join(process.cwd(), ".data", "stories") };
  if (adapter === "s3") {
    if (!env.STORY_BUCKET) throw new HttpError(503, "Saving stories needs a durable bucket (STORY_BUCKET). The game bucket expires after one day.");
    e.S3_BUCKET = env.STORY_BUCKET; e.MEDIA_BUCKET = env.STORY_BUCKET;
  }
  const store = createMediaStore(e);
  g.__mmStories = { key, store };
  return store;
}

const hash = (s: string, n = 16) => createHash("sha256").update(s).digest("hex").slice(0, n);
export const ownerKeyOf = (hostId: string) => hash(`owner:${hostId}`, 16);
const storyCode = (id: string) => id; // ids look like "ST" + 10 hex and double as the pseudo game code
const hostIndexCode = (ownerKey: string) => `HX${ownerKey.slice(0, 10)}`;
const GALLERY_CODE = "STORYLIB";
const ID_RE = /^ST[0-9a-f]{10}$/;
export const isStoryId = (id: string) => ID_RE.test(id);

async function readJson<T>(key: string): Promise<T | null> {
  const o = await getStoryStore().get(key);
  if (!o) return null;
  try { return JSON.parse(o.bytes.toString("utf8")) as T; } catch { return null; }
}
const writeJson = (key: string, v: unknown) => getStoryStore().put(key, Buffer.from(JSON.stringify(v)), "application/json");

// ---------- sealing ----------
function sealKey(): Buffer {
  const k = process.env.STORY_SEAL_KEY;
  if (k) { const b = Buffer.from(k, "base64"); if (b.length === 32) return b; throw new Error("STORY_SEAL_KEY must be 32 bytes, base64 encoded"); }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("Set STORY_SEAL_KEY or AUTH_SECRET so saved stories can be sealed");
    return Buffer.from(hkdfSync("sha256", "dev-only-story-seal", "mm", "story-seal", 32));
  }
  return Buffer.from(hkdfSync("sha256", secret, "mm-story-v1", "story-seal", 32));
}
export function sealJson(obj: unknown, aad: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", sealKey(), iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.from(JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") }));
}
export function openJson<T>(blob: Buffer, aad: string): T {
  const j = JSON.parse(blob.toString("utf8")) as { v: number; iv: string; tag: string; ct: string };
  if (j.v !== 1) throw new Error("Unknown seal version");
  const d = createDecipheriv("aes-256-gcm", sealKey(), Buffer.from(j.iv, "base64"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(j.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(j.ct, "base64")), d.final()]).toString("utf8")) as T;
}

// ---------- building a pack and recap ----------
/** The case with every trace of a particular night removed (player backstories, generated guest fillers). */
export function packFromCase(k: CaseFile): CaseFile {
  const c = structuredClone(k);
  c.characters = c.characters.filter((x) => !x.id.startsWith("guest-")).map((x) => {
    const { forHandle: _f, ...rest } = x as typeof x & { forHandle?: string };
    const { extra: _e, ...card } = rest.card as typeof rest.card & { extra?: string };
    return { ...rest, card };
  });
  return c;
}

const castPreview = (k: CaseFile): CastPreview[] => k.characters.map((c) => ({ id: c.id, name: c.name, house: c.house, tease: c.tease, kid: c.kid }));

export interface SaveOptions {
  kind: StoryKind; visibility: Visibility; title?: string; blurb?: string;
  includeRecap: boolean; recapNames: boolean; recapPictures: boolean;
}

function safeText(v: string | undefined, max: number, label: string): string {
  const t = String(v ?? "").trim();
  if (!t) return "";
  const c = cleanLine(t, max);
  if (!c) throw new HttpError(400, `Please keep the ${label} family friendly`);
  return c;
}

export async function saveStory(room: Room, hostId: string, o: SaveOptions): Promise<{ id: string; meta: StoryMeta }> {
  const k = room.case;
  if (!k || room.phase === "lobby") throw new HttpError(409, "Start the game before saving its story");
  const ownerKey = ownerKeyOf(hostId);
  const lib = (await readJson<LibraryEntry[]>(`${hostIndexCode(ownerKey)}/index/library.json`)) ?? [];
  if (lib.length >= STORY_LIMITS.maxLibrary) throw new HttpError(409, `Your library is full (${STORY_LIMITS.maxLibrary}). Delete one first.`);
  const title = safeText(o.title, STORY_LIMITS.maxTitle, "title") || k.title.slice(0, STORY_LIMITS.maxTitle);
  const blurb = safeText(o.blurb, STORY_LIMITS.maxBlurb, "description");
  const pub = o.visibility === "public";
  const includeRecap = o.includeRecap && room.phase === "reveal" && !!room.result;
  // Public stories never carry real names or pictures of players (children may be in them).
  const recapNames = includeRecap && o.recapNames && !pub;
  const recapPictures = includeRecap && o.recapPictures && !pub;

  const pack = packFromCase(k);
  const id = `ST${randomBytes(5).toString("hex")}`;
  const sealedBlob = sealJson(pack, id);
  if (sealedBlob.length > STORY_LIMITS.maxPackBytes) throw new HttpError(413, "This story is too large to save");

  const meta: StoryMeta = {
    id, ownerKey, title, blurb, kind: o.kind === "cast" ? "cast" : "story", visibility: pub ? "public" : "link", savedAt: Date.now(),
    setting: k.setting.slice(0, 600), castCount: pack.characters.length, houses: [...new Set(pack.characters.map((c) => c.house))].slice(0, 12),
    characters: o.kind === "cast" ? castPreview(pack) : undefined,
    hasRecap: includeRecap, recapNames, recapPictures,
  };

  const store = getStoryStore();
  await store.put(`${storyCode(id)}/story/pack.sealed.json`, sealedBlob, "application/json");
  await writeJson(`${storyCode(id)}/story/meta.json`, meta);

  if (includeRecap) {
    const recap = buildRecap(room, recapNames);
    if (recapPictures) {
      const media = getMediaStoreForGame();
      for (const m of room.media.filter((x) => x.status === "done" && x.key && (x.kind === "scene" || x.kind === "avatar")).slice(0, STORY_LIMITS.maxImages)) {
        try {
          const obj = await media.get(m.key!);
          if (!obj) continue;
          const ext = obj.mime.includes("png") ? "png" : obj.mime.includes("svg") ? "svg" : obj.mime.includes("jpeg") ? "jpg" : "bin";
          await store.put(`${storyCode(id)}/img/${m.id.replace(/[^A-Za-z0-9_-]/g, "")}.${ext}`, obj.bytes, obj.mime);
          recap.images.push({ id: m.id.replace(/[^A-Za-z0-9_-]/g, ""), kind: m.kind, caption: m.caption, mime: obj.mime });
        } catch { /* a missing picture never blocks saving */ }
      }
    }
    await writeJson(`${storyCode(id)}/story/recap.json`, recap);
  }

  lib.push({ id, title, kind: meta.kind, visibility: meta.visibility, savedAt: meta.savedAt });
  await writeJson(`${hostIndexCode(ownerKey)}/index/library.json`, lib);
  if (pub) await upsertGallery({ id, title, blurb, kind: meta.kind, savedAt: meta.savedAt, castCount: meta.castCount, votes: 0, playedVotes: 0, plays: 0, reports: 0 });
  return { id, meta };
}

// The game's own blob store (where generated pictures live), distinct from the durable story store.
import { getMediaStore } from "./media-store";
const getMediaStoreForGame = () => getMediaStore();

function buildRecap(room: Room, names: boolean): Recap {
  const k = room.case!;
  const who = (id: string) => room.players.find((p) => p.id === id);
  const label = (p: { id: string; name: string; characterId?: string; isBot?: boolean }) => {
    const ch = k.characters.find((c) => c.id === p.characterId)?.name ?? "A guest";
    return names && !p.isBot ? `${p.name} as ${ch}` : p.isBot ? `${ch} (AI guest)` : ch;
  };
  const r = room.result;
  const clues = [...k.clues, { id: "twist", round: 2 as const, text: k.twist }].filter((c) => room.releasedClueIds.includes(c.id)).map((c) => c.text);
  const nameForAward = (n: string) => { const p = room.players.find((x) => x.name === n); return p ? label(p) : n; };
  return {
    title: k.title, partyName: room.config.name || k.title, savedAt: Date.now(),
    narration: Object.fromEntries(PHASES.filter((ph) => ph !== "lobby" && k.narration[ph]).map((ph) => [ph, k.narration[ph]!])),
    clues,
    reveal: r ? {
      killer: k.characters.find((c) => c.id === r.killerId)?.name ?? "",
      method: k.methods.find((m) => m.id === r.methodId)?.text ?? "", motive: k.motives.find((m) => m.id === r.motiveId)?.text ?? "", story: r.story,
    } : undefined,
    scores: (r?.scores ?? []).map((s) => { const p = who(s.playerId); return { name: p ? label(p) : "A guest", points: s.points }; }),
    awards: (r?.awards ?? []).map((a) => ({ award: a.award, to: nameForAward(a.to) })),
    images: [],
  };
}

// ---------- reading ----------
export interface LibraryEntry { id: string; title: string; kind: StoryKind; visibility: Visibility; savedAt: number }

export async function getStoryMeta(id: string): Promise<StoryMeta | null> {
  if (!isStoryId(id)) return null;
  return readJson<StoryMeta>(`${storyCode(id)}/story/meta.json`);
}
export async function getRecap(id: string): Promise<Recap | null> {
  if (!isStoryId(id)) return null;
  return readJson<Recap>(`${storyCode(id)}/story/recap.json`);
}
export async function getStoryImage(id: string, imgId: string) {
  if (!isStoryId(id) || !/^[A-Za-z0-9_-]{1,40}$/.test(imgId)) return null;
  const recap = await getRecap(id);
  const img = recap?.images.find((i) => i.id === imgId);
  if (!img) return null;
  const ext = img.mime.includes("png") ? "png" : img.mime.includes("svg") ? "svg" : img.mime.includes("jpeg") ? "jpg" : "bin";
  return getStoryStore().get(`${storyCode(id)}/img/${imgId}.${ext}`);
}

/** Server only. Opens the sealed solution. Never return the result to a client. */
export async function openStoryCase(id: string): Promise<CaseFile> {
  if (!isStoryId(id)) throw new HttpError(404, "Story not found");
  const o = await getStoryStore().get(`${storyCode(id)}/story/pack.sealed.json`);
  if (!o) throw new HttpError(404, "Story not found");
  let c: CaseFile;
  try { c = openJson<CaseFile>(o.bytes, id); } catch { throw new HttpError(500, "This saved story could not be opened"); }
  if (!c?.characters?.length || !c.killerId || !c.victimId || !c.truth) throw new HttpError(500, "This saved story is damaged");
  return c;
}

export async function listLibrary(hostId: string): Promise<LibraryEntry[]> {
  const lib = (await readJson<LibraryEntry[]>(`${hostIndexCode(ownerKeyOf(hostId))}/index/library.json`)) ?? [];
  return [...lib].sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteStory(hostId: string, id: string) {
  const meta = await getStoryMeta(id);
  if (!meta) throw new HttpError(404, "Story not found");
  if (meta.ownerKey !== ownerKeyOf(hostId)) throw new HttpError(403, "Only the owner can delete this story");
  await getStoryStore().deletePrefix(storyCode(id));
  const ik = `${hostIndexCode(meta.ownerKey)}/index/library.json`;
  await writeJson(ik, ((await readJson<LibraryEntry[]>(ik)) ?? []).filter((e) => e.id !== id));
  await removeFromGallery(id);
}

// ---------- engagement (votes, plays, reports): one blob per voter, so simultaneous votes never overwrite each other ----------
async function names(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | null = null;
  do {
    const page: { entries: { key: string }[]; next: string | null } = await getStoryStore().list(prefix, { limit: 1000, cursor });
    out.push(...page.entries.map((e) => e.key.split("/").pop()!));
    cursor = page.next;
  } while (cursor);
  return out;
}

export async function engagementOf(id: string): Promise<Engagement> {
  const [v, pl, rp] = await Promise.all([names(`${storyCode(id)}/votes`), names(`${storyCode(id)}/plays`), names(`${storyCode(id)}/reports`)]);
  return { votes: v.length, playedVotes: v.filter((n) => n.startsWith("p-")).length, plays: pl.length, reports: rp.length };
}

async function touch(id: string, name: string, present: boolean, kind: "votes" | "plays" | "reports") {
  const key = `${storyCode(id)}/${kind}/${name}`;
  if (present) await getStoryStore().put(key, Buffer.from("1"), "text/plain");
  else await getStoryStore().deletePrefix(key);
  const e = await engagementOf(id);
  await patchGallery(id, e);
  return e;
}

/** `who` is an account id (signed-in user) or a player of a finished game that was started from this story. */
export async function setVote(id: string, who: { account?: string; player?: { room: string; player: string } }, on: boolean): Promise<Engagement> {
  if (!(await getStoryMeta(id))) throw new HttpError(404, "Story not found");
  const name = who.account ? `a-${hash(`acct:${who.account}`, 20)}` : who.player ? `p-${hash(`play:${who.player.room}:${who.player.player}`, 20)}` : "";
  if (!name) throw new HttpError(400, "No voter");
  return touch(id, name, on, "votes");
}
export async function recordPlay(id: string, roomCode: string) {
  if (!(await getStoryMeta(id))) return;
  await touch(id, hash(`room:${roomCode}`, 20), true, "plays");
}
export async function reportStory(id: string, reporter: string) {
  if (!(await getStoryMeta(id))) throw new HttpError(404, "Story not found");
  return touch(id, hash(`rep:${reporter}`, 20), true, "reports");
}

// ---------- gallery (public stories only) ----------
async function readGallery(): Promise<GalleryEntry[]> { return (await readJson<GalleryEntry[]>(`${GALLERY_CODE}/index/gallery.json`)) ?? []; }
const writeGallery = (g: GalleryEntry[]) => writeJson(`${GALLERY_CODE}/index/gallery.json`, g.slice(0, STORY_LIMITS.maxGallery));
async function upsertGallery(e: GalleryEntry) { const g = (await readGallery()).filter((x) => x.id !== e.id); g.unshift(e); await writeGallery(g); }
async function removeFromGallery(id: string) { await writeGallery((await readGallery()).filter((x) => x.id !== id)); }
async function patchGallery(id: string, e: Engagement) {
  const g = await readGallery();
  const hit = g.find((x) => x.id === id);
  if (!hit) return;
  Object.assign(hit, e);
  await writeGallery(g);
}

export type GallerySort = "top" | "new" | "played";
export async function listGallery(o: { sort?: GallerySort; q?: string; limit?: number } = {}): Promise<GalleryEntry[]> {
  const q = (o.q ?? "").trim().toLowerCase();
  let g = (await readGallery()).filter((x) => x.reports < STORY_LIMITS.reportHideThreshold);
  if (q) g = g.filter((x) => (x.title + " " + x.blurb).toLowerCase().includes(q));
  const by: Record<GallerySort, (a: GalleryEntry, b: GalleryEntry) => number> = {
    top: (a, b) => b.votes - a.votes || b.plays - a.plays || b.savedAt - a.savedAt,
    new: (a, b) => b.savedAt - a.savedAt,
    played: (a, b) => b.plays - a.plays || b.votes - a.votes,
  };
  return g.sort(by[o.sort ?? "top"]).slice(0, Math.min(o.limit ?? 40, 100));
}
