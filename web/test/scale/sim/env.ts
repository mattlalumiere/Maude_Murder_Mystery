// Builds the process wide runtime the real routes use: store (real adapter + instrumentation),
// virtual clock, seeded random, media dir. Everything is restored by teardown().
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seededRandom, setRuntime } from "../../../src/lib/ids";
import { createMediaStore, createStore } from "../../../src/lib/storage";
import type { Store } from "../../../src/lib/storage";
import { resetAiState } from "../../../src/lib/ai/config";
import { VirtualClock } from "./clock";
import { InstrumentedStore } from "./stores";

export type StoreKind = "memory" | "file" | "postgres";

export interface SimEnvOptions {
  store: StoreKind;
  databaseUrl?: string;
  seed?: number;
  cellId?: string;
  /** Extra env vars (AI settings etc.). */
  env?: Record<string, string>;
  /** Use an existing directory for the file store (restart tests). */
  dir?: string;
  keepDir?: boolean;
}

export interface SimEnv {
  store: InstrumentedStore;
  raw: Store;
  clock: VirtualClock;
  dir: string;
  teardown(): void;
  /** Build a second independent store object on the same backing data (second process model). */
  another(): Store;
}

const g = globalThis as unknown as { __mmStore?: Store; __mmMedia?: unknown };

export function setupEnv(o: SimEnvOptions): SimEnv {
  const dir = o.dir ?? mkdtempSync(join(tmpdir(), "maude-t4-"));
  mkdirSync(dir, { recursive: true });
  const saved: Record<string, string | undefined> = {};
  const setEnv = (k: string, v: string | undefined) => { if (!(k in saved)) saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  const env: Record<string, string | undefined> = {
    STORE_ADAPTER: o.store, STORE_FILE_DIR: join(dir, "state"), MEDIA_ADAPTER: "file", MEDIA_FILE_DIR: join(dir, "media"),
    CELL_ID: o.cellId ?? "local-0", AI_TEXT_ADAPTER: "sample", RATE_LIMIT: "off", ...(o.databaseUrl ? { DATABASE_URL: o.databaseUrl } : {}), ...o.env,
  };
  for (const [k, v] of Object.entries(env)) setEnv(k, v);

  const media = createMediaStore(process.env as Record<string, string | undefined>);
  g.__mmMedia = media;
  const build = () => createStore(process.env as Record<string, string | undefined>, media);
  const raw = build();
  const store = new InstrumentedStore(raw);
  g.__mmStore = store;
  resetAiState();
  const clock = new VirtualClock();
  const restoreRuntime = setRuntime({ clock, random: seededRandom(o.seed ?? 42) });

  return {
    store, raw, clock, dir, another: build,
    teardown() {
      restoreRuntime();
      delete g.__mmStore; delete g.__mmMedia;
      resetAiState();
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      if (!o.keepDir) rmSync(dir, { recursive: true, force: true });
    },
  };
}
