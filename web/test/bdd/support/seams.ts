// Test seams. The app has no dependency injection for two things the features need, so they are
// installed here by replacing entries in the CommonJS module cache BEFORE any route is loaded:
//   1. `src/auth.ts` (next-auth needs a Next request scope, which does not exist in process).
//      The replacement reads the signed-in host from an AsyncLocalStorage that the HTTP helper sets.
//   2. `src/lib/media-gen.ts` (image generation and photo moderation have no injectable port at the
//      call sites). The replacement delegates to the real module unless a scenario installs a fault.
// No file under src/ is edited. Report: both would be cleaner as real seams (see T2 report).
import { AsyncLocalStorage } from "node:async_hooks";
import Module from "node:module";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "../../../src");
export const sessionStore = new AsyncLocalStorage<{ hostId: string | null }>();

export interface MediaFaults {
  /** Called for every image generation. Throw to simulate a failing model. May return a never ending promise. */
  onImage?: (req: any) => Promise<void> | void;
  /** When set, the next photo moderation returns this result and the flag clears. */
  rejectNextPhoto?: string | null;
  imageCalls: number;
  moderationCalls: number;
}
export const faults: MediaFaults = { imageCalls: 0, moderationCalls: 0 };
export function resetFaults() {
  faults.onImage = undefined; faults.rejectNextPhoto = null; faults.imageCalls = 0; faults.moderationCalls = 0;
}

function install(path: string, exports: unknown) {
  const m = new Module(path) as Module & { filename: string; loaded: boolean; exports: unknown };
  m.filename = path; m.loaded = true; m.exports = exports;
  require.cache[path] = m as unknown as NodeJS.Module;
}

let done = false;
export function installSeams() {
  if (done) return;
  done = true;
  const authPath = require.resolve(resolve(SRC, "auth.ts"));
  install(authPath, {
    hostIdFromSession: async () => sessionStore.getStore()?.hostId ?? null,
    auth: async () => null, providerIds: [], handlers: {}, signIn: async () => {}, signOut: async () => {},
  });
  const mediaPath = require.resolve(resolve(SRC, "lib/media-gen.ts"));
  const real = require(mediaPath);
  install(mediaPath, {
    ...real,
    generateImage: async (r: any, p?: any) => {
      faults.imageCalls++;
      if (faults.onImage) await faults.onImage(r);
      return real.generateImage(r, p);
    },
    moderatePhoto: async (b: Buffer, p?: any) => {
      faults.moderationCalls++;
      if (faults.rejectNextPhoto) { const reason = faults.rejectNextPhoto; faults.rejectNextPhoto = null; return { ok: false, reason }; }
      return real.moderatePhoto(b, p);
    },
  });
}
installSeams();
