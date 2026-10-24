// Port for text-to-speech. The app depends on this interface only; vendor SDKs live in speech-*.ts adapter files.

export interface SpeechResult { bytes: Buffer; mime: string }

export interface SpeechModel {
  readonly id: string;
  /** "browser" adapters make no audio on the server: the player's or TV's browser speaks the text itself. */
  readonly kind: "server" | "browser";
  /** Voice ids this adapter can use. Bots are given distinct ones in order. */
  readonly voices: string[];
  /** Rough price in USD per spoken character, for the budget ledger (0 when free). */
  readonly usdPerChar: number;
  synthesize(text: string, voice: string, signal?: AbortSignal): Promise<SpeechResult>;
}

export class SpeechUnavailableError extends Error {
  constructor(message = "Speech is unavailable") { super(message); this.name = "SpeechUnavailableError"; }
}

const xmlEscape = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
export { xmlEscape };
