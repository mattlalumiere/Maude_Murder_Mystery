// Boots the real route handlers against temp-dir stores. The Auth.js session is faked per test file with
//   vi.mock("@/auth", async () => ({ hostIdFromSession: async () => (await import("./_app")).hostSession.id }));
import { join } from "node:path";
import { addPlayer, advance, createRoom, startGame } from "@/lib/engine";
import { getStore, mutate } from "@/lib/store";
import { getMediaStore } from "@/lib/media-store";
import type { Room, AgeGroup } from "@/lib/types";
import { rmDir, tmpDir } from "./_support";

export const hostSession: { id: string | null } = { id: null };

const g = globalThis as unknown as Record<string, unknown>;
const ENV_KEYS = ["STORE_ADAPTER", "STORE_FILE_DIR", "MEDIA_ADAPTER", "MEDIA_FILE_DIR", "CELL_ID", "AI_TEXT_ADAPTER", "AI_BASE_URL", "MEDIA_PROVIDER", "MEDIA_BUCKET", "ROOMS_TABLE", "S3_ENDPOINT", "S3_BUCKET", "DATABASE_URL"];

export interface Booted { dir: string; cleanup(): Promise<void> }

export async function boot(env: Record<string, string> = {}): Promise<Booted> {
  const dir = await tmpDir("t3-app-");
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, {
    STORE_ADAPTER: "memory", STORE_FILE_DIR: join(dir, "state"), MEDIA_ADAPTER: "file", MEDIA_FILE_DIR: join(dir, "media"), CELL_ID: "local-0", ...env,
  });
  delete g.__mmStore; delete g.__mmMedia; delete g.__mmAi;
  hostSession.id = null;
  return {
    dir,
    async cleanup() {
      for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
      delete g.__mmStore; delete g.__mmMedia; delete g.__mmAi;
      hostSession.id = null;
      await rmDir(dir);
    },
  };
}

export interface TestPlayer { id: string; token: string; name: string; ageGroup: AgeGroup }
export interface TestGame { code: string; gameId: string; hostId: string; overrideCode: string; players: TestPlayer[] }

export const DEFAULT_MIX: AgeGroup[] = ["adult", "adult", "adult", "adult", "adult", "kid", "teen", "little"];

export async function newGame(o: { host?: string; overrideCode?: string; mix?: AgeGroup[]; start?: boolean; phase?: Room["phase"]; names?: string } = {}): Promise<TestGame> {
  const hostId = o.host ?? "host-1";
  const overrideCode = o.overrideCode ?? "Swordfish-9";
  const room = await createRoom(hostId, overrideCode);
  const mix = o.mix ?? DEFAULT_MIX;
  const prefix = o.names ?? "P";
  const players: TestPlayer[] = [];
  await mutate(room.code, (r) => {
    mix.forEach((ageGroup, i) => {
      const p = addPlayer(r, `${prefix}${i}`, ageGroup, false);
      players.push({ id: p.id, token: p.token, name: p.name, ageGroup });
    });
  });
  if (o.start || o.phase) {
    await mutate(room.code, async (r) => { await startGame(r); });
    const order = ["cards", "act1", "death", "act2", "intermission", "act3", "act4", "reveal"];
    const target = o.phase ?? "cards";
    for (const ph of order.slice(order.indexOf("cards"))) {
      if (ph === target) break;
      await mutate(room.code, (r) => { advance(r); });
    }
  }
  return { code: room.code, gameId: room.gameId, hostId, overrideCode, players };
}

export const loadRoom = async (code: string) => (await getStore().get(code))!;
export { getStore, getMediaStore, mutate };

// ---------- request helpers ----------
export const ctx = <E extends Record<string, string>>(code: string, extra?: E) => ({ params: Promise.resolve({ code, ...(extra ?? {}) } as { code: string } & E) });

export function mkReq(method: string, path: string, o: { headers?: Record<string, string>; json?: unknown; body?: BodyInit | null; query?: string } = {}) {
  const headers = new Headers(o.headers ?? {});
  let body: BodyInit | null | undefined = o.body;
  if (o.json !== undefined) { body = JSON.stringify(o.json); if (!headers.has("content-type")) headers.set("content-type", "application/json"); }
  return new Request(`http://localhost:3000${path}${o.query ?? ""}`, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : body });
}

export const asPlayer = (p: TestPlayer, extra: Record<string, string> = {}) => ({ "x-player-id": p.id, "x-player-token": p.token, ...extra });

export const routes = {
  rooms: () => import("@/app/api/rooms/route"),
  action: () => import("@/app/api/rooms/[code]/action/route"),
  join: () => import("@/app/api/rooms/[code]/join/route"),
  state: () => import("@/app/api/rooms/[code]/state/route"),
  photo: () => import("@/app/api/rooms/[code]/photo/route"),
  mediaRun: () => import("@/app/api/rooms/[code]/media/run/route"),
  mediaGet: () => import("@/app/api/rooms/[code]/media/[id]/route"),
  healthz: () => import("@/app/api/healthz/route"),
  readyz: () => import("@/app/api/readyz/route"),
};

export async function bodyOf(res: Response): Promise<unknown> {
  const t = await res.text();
  try { return JSON.parse(t); } catch { return t; }
}

/**
 * A structurally valid minimal JPEG (SOI, JFIF, SOF, SOS, scan data, EOI) of about n bytes.
 * `tail` is embedded in the scan data (it survives metadata stripping). `extra.exif` adds an EXIF-style APP1 segment and
 * `extra.trailing` appends bytes after the end-of-image marker; both are expected to be removed by the upload route.
 */
export const fakeJpeg = (n = 4000, tail = "", extra: { exif?: string; trailing?: string } = {}) => {
  const seg = (m: number, payload: Buffer) => Buffer.concat([Buffer.from([0xff, m, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
  const head = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from("JFIF\0")),
    ...(extra.exif ? [seg(0xe1, Buffer.from(extra.exif, "latin1"))] : []),
    seg(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0])),
    seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
  ]);
  const scan = Buffer.alloc(Math.max(0, n - head.length - 2), 0x41);
  if (tail) scan.write(tail, 4, "latin1");
  return Buffer.concat([head, scan, Buffer.from([0xff, 0xd9]), Buffer.from(extra.trailing ?? "", "latin1")]);
};
