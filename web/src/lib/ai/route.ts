// Picks the AI services for one game. Cloud and built-in choices follow the environment; a game that asked for
// local services uses the MCP-connected containers when they are configured.
import { activePrices, LOCAL_PRICES, type Prices } from "../budget";
import type { Room } from "../types";
import { getTextModel } from "./config";
import { localImageModel, localSpeech, localTextModel } from "./local";
import { getImageModel } from "./media";
import { usesLocal } from "./mode";
import type { ImageModel, TextModel } from "./ports";
import { getSpeech } from "./speech";
import type { SpeechModel } from "./speech-port";

type R = Pick<Room, "config">;

export const textModelFor = (room: R): TextModel | null => (usesLocal(room) ? localTextModel : getTextModel());
export const speechFor = (room: R): SpeechModel => (usesLocal(room) ? localSpeech : getSpeech());
export const imageModelFor = (room: R): ImageModel => (usesLocal(room) ? localImageModel : getImageModel());
export const pricesForRoom = (room: R): Prices => (usesLocal(room) ? LOCAL_PRICES : activePrices());

/** Options for generateCase: local models need explicit generous limits. */
export function caseOptionsFor(room: R): { model?: TextModel | null; maxOutputTokens?: number; timeoutMs?: number } {
  return usesLocal(room) ? { model: localTextModel, maxOutputTokens: 9000, timeoutMs: 280_000 } : {};
}
