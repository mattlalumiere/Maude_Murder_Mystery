// The World: one per scenario. Holds the deterministic clock, seeded random, temp directories,
// the spying store and the HTTP helper. Everything runs in process, no browser, no network
// except the loopback fake model server.
import "./seams";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { After, Before, BeforeStep, setDefaultTimeout, setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import { PRICES } from "../../../src/lib/budget";
import { LIMITS } from "../../../src/lib/engine-limits";
import { seededRandom, setRuntime } from "../../../src/lib/ids";
import type { AgeGroup, Room } from "../../../src/lib/types";
import { resetAiState } from "../../../src/lib/ai/config";
import { ManualClock } from "./clock";
import type { FakeServer } from "./fake-server";
import { faults, resetFaults } from "./seams";
import { SpyStore, installStores } from "./stores";
import { callApi, type CallOpts, type Res } from "./http";

setDefaultTimeout(240_000);

export interface PlayerRef { name: string; id: string; token: string; ageGroup: AgeGroup }
export interface GameCtx {
  label?: string;
  code: string;
  hostId: string;
  overrideCode: string;
  players: PlayerRef[];
  alias: Record<string, PlayerRef>;
}

const ENV_KEYS = [
  "STORE_ADAPTER", "STORE_FILE_DIR", "MEDIA_ADAPTER", "MEDIA_FILE_DIR", "CELL_ID", "REGION_ID", "MEDIA_PROVIDER", "GAME_MAX_BYTES",
  "GAME_MAX_BLOB_BYTES", "GAME_MAX_STATE_BYTES", "GAME_TTL_HOURS", "AI_TEXT_ADAPTER", "AI_BASE_URL", "AI_MODEL", "AI_API_KEY",
  "AI_TIMEOUT_MS", "AI_CASE_TIMEOUT_MS", "AI_MAX_CONCURRENCY", "AI_MAX_QUEUE", "AI_MAX_RETRIES", "AI_BREAKER_FAILURES",
  "AI_BREAKER_COOLDOWN_MS", "AI_GAME_TOKEN_BUDGET", "AI_GAME_REQUEST_BUDGET", "BEDROCK_MODEL_ID", "ROOMS_TABLE", "MEDIA_BUCKET",
  "RATE_LIMIT", "DATABASE_URL",
] as const;

export class MmWorld extends World {
  clock = new ManualClock();
  tmp = "";
  /** Host id of the signed-in user, or null for anonymous. */
  session: string | null = null;
  game!: GameCtx;
  games: Record<string, GameCtx> = {};
  last!: Res;
  all: Res[] = [];
  /** Every response seen in the scenario, for leak scans. */
  log: { method: string; path: string; res: Res }[] = [];
  consoleLines: string[] = [];
  store!: SpyStore;
  fake?: FakeServer;
  /** Free form scratch space for steps of one feature. */
  s: Record<string, any> = {};
  stepType: "Context" | "Action" | "Outcome" = "Context";
  private prevType: "Context" | "Action" | "Outcome" = "Context";
  private savedEnv: Record<string, string | undefined> = {};
  private restoreRuntime: () => void = () => {};
  private realNow = Date.now;
  private restoreLimits: () => void = () => {};
  private savedPrices = { ...PRICES };
  private cleanups: (() => Promise<void> | void)[] = [];
  private consoleSaved: Record<string, (...a: unknown[]) => void> = {};

  constructor(o: IWorldOptions) { super(o); }

  get mediaDir() { return join(this.tmp, "media"); }
  get stateDir() { return join(this.tmp, "state"); }
  get cell() { return process.env.CELL_ID || "local-0"; }

  onCleanup(fn: () => Promise<void> | void) { this.cleanups.push(fn); }

  async setup() {
    this.tmp = mkdtempSync(join(tmpdir(), "mm-bdd-"));
    this.clock = new ManualClock(Date.now());
    const clock = this.clock;
    this.realNow = Date.now;
    Date.now = () => clock.now();
    this.restoreRuntime = setRuntime({ clock, random: seededRandom(20261020) });
    for (const k of ENV_KEYS) { this.savedEnv[k] = process.env[k]; delete process.env[k]; }
    process.env.STORE_ADAPTER = "memory";
    process.env.MEDIA_ADAPTER = "file";
    process.env.MEDIA_FILE_DIR = this.mediaDir;
    process.env.STORE_FILE_DIR = this.stateDir;
    process.env.RATE_LIMIT = "off";
    this.savedPrices = { ...PRICES };
    const prevLimits = { ...LIMITS };
    this.restoreLimits = () => { Object.assign(LIMITS, prevLimits); };
    resetAiState();
    resetFaults();
    this.store = installStores(this);
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      this.consoleSaved[level] = console[level];
      console[level] = (...a: unknown[]) => { this.consoleLines.push(a.map((x) => (typeof x === "string" ? x : safeJson(x))).join(" ")); };
    }
  }

  async teardown() {
    for (const level of Object.keys(this.consoleSaved)) (console as any)[level] = this.consoleSaved[level];
    for (const fn of this.cleanups.reverse()) { try { await fn(); } catch { /* best effort */ } }
    this.cleanups = [];
    if (this.fake) await this.fake.close().catch(() => {});
    Date.now = this.realNow;
    this.restoreRuntime();
    this.restoreLimits();
    Object.assign(PRICES, this.savedPrices);
    for (const k of ENV_KEYS) { if (this.savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = this.savedEnv[k]; }
    resetAiState();
    resetFaults();
    delete (globalThis as any).__mmStore;
    delete (globalThis as any).__mmMedia;
    try { rmSync(this.tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  beginStep(type: string) {
    if (type === "Context" || type === "Action" || type === "Outcome") { this.stepType = type; this.prevType = type; }
    else this.stepType = this.prevType;
  }

  /** One HTTP style call into the real route handlers (and optionally the middleware first). */
  async call(method: string, path: string, o: CallOpts = {}): Promise<Res> {
    const host = o.host === undefined ? this.session : o.host;
    const res = await callApi(this, method, path, { ...o, host });
    this.last = res;
    this.all.push(res);
    this.log.push({ method, path, res });
    return res;
  }

  /** The stored room, read without touching the spy counters. */
  async room(ctx: GameCtx = this.game): Promise<Room> {
    const r = await this.store.peek(ctx.code);
    if (!r) throw new Error(`game ${ctx.code} is not in the store`);
    return r;
  }
}

function safeJson(x: unknown) { try { return JSON.stringify(x); } catch { return String(x); } }

setWorldConstructor(MmWorld);
Before(async function (this: MmWorld) { await this.setup(); });
After(async function (this: MmWorld) { await this.teardown(); });
BeforeStep(async function (this: MmWorld, arg: any) {
  let type = "Conjunction";
  try {
    const id = arg.pickleStep.astNodeIds?.[0];
    const doc = arg.gherkinDocument;
    const visit = (steps: any[]) => { for (const s of steps ?? []) if (s.id === id) type = s.keywordType ?? "Conjunction"; };
    const walk = (children: any[]) => {
      for (const c of children ?? []) {
        if (c.background) visit(c.background.steps);
        if (c.scenario) visit(c.scenario.steps);
        if (c.rule) walk(c.rule.children);
      }
    };
    walk(doc?.feature?.children);
  } catch { /* keep Conjunction */ }
  this.beginStep(type);
});

export { faults };
