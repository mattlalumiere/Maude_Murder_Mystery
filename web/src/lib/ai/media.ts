// ImageModel and Moderator ports over the providers in media-gen.ts.
// Mock is the local default. The Bedrock and Rekognition paths inside media-gen.ts are legacy.
import { generateImage, moderatePhoto } from "../media-gen";
import type { ImageModel, Moderator } from "./ports";

export const mockImageModel: ImageModel = { id: "mock", generate: (r) => generateImage(r, "mock") };

/** @deprecated Legacy AWS adapter (Nova Canvas). Every call must still go through claim() in media-runner.ts. */
export const bedrockImageModel: ImageModel = { id: "bedrock", generate: (r) => generateImage(r, "bedrock") };

export const mockModerator: Moderator = { id: "mock", moderate: (b) => moderatePhoto(b, "mock") };

/** @deprecated Legacy AWS adapter (Rekognition). */
export const rekognitionModerator: Moderator = { id: "rekognition", moderate: (b) => moderatePhoto(b, "bedrock") };

const provider = () => (process.env.MEDIA_PROVIDER === "bedrock" ? "bedrock" : "mock");
export const getImageModel = (): ImageModel => (provider() === "bedrock" ? bedrockImageModel : mockImageModel);
export const getModerator = (): Moderator => (provider() === "bedrock" ? rekognitionModerator : mockModerator);
