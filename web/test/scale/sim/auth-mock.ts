// Replaces "@/auth" in scale tests so the REAL route handlers run without next-auth.
// The caller sets the session host with `asHost(id, fn)` (AsyncLocalStorage, safe under concurrency).
import { AsyncLocalStorage } from "node:async_hooks";

export const hostStore = new AsyncLocalStorage<string | null>();
export const hostIdFromSession = async () => hostStore.getStore() ?? null;
export const asHost = <T>(id: string | null, fn: () => Promise<T>) => hostStore.run(id, fn);
export const auth = async () => null;
export const providerIds: string[] = [];
