// Public entry for blob storage. Adapters live in ./storage; selected by MEDIA_ADAPTER.
import { createMediaStore } from "./storage";
import type { MediaStore } from "./storage";

export type { MediaStore };

const g = globalThis as unknown as { __mmMedia?: MediaStore };
export function getMediaStore(): MediaStore {
  if (!g.__mmMedia) g.__mmMedia = createMediaStore(process.env);
  return g.__mmMedia;
}
