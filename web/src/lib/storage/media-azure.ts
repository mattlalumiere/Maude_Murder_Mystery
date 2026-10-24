import { NotImplementedError } from "./errors";
import type { MediaStore } from "./ports";

/** Stub: Azure Blob is specified but not built. See docs/platform/adr/ (object store portability) and portability-matrix.md. */
export class AzureBlobMediaStore implements MediaStore {
  constructor() {
    throw new NotImplementedError(
      "MEDIA_ADAPTER=azureblob is not implemented yet. Use MEDIA_ADAPTER=s3 against an S3 compatible gateway, " +
        "or see docs/platform/adr/ and docs/platform/portability-matrix.md for the Azure Blob plan.",
    );
  }
  put(): Promise<void> { throw new NotImplementedError("azureblob"); }
  get(): Promise<never> { throw new NotImplementedError("azureblob"); }
  deletePrefix(): Promise<void> { throw new NotImplementedError("azureblob"); }
  list(): Promise<never> { throw new NotImplementedError("azureblob"); }
  stat(): Promise<never> { throw new NotImplementedError("azureblob"); }
}
