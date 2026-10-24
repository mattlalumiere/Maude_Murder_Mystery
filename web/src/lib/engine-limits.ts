/**
 * The single source of engine limits and quotas. Everything in engine.ts, sanitize.ts and
 * case-validate.ts reads from this object at call time, so tests can lower a limit with setLimits().
 */
export interface EngineLimits {
  /** Max players in one game. */
  maxPlayers: number;
  minPlayers: number;
  minAdults: number;
  /** Max clue ids (including the twist) a game may ever release. */
  maxCluesReleased: number;
  playerName: number;
  backstory: number;
  configName: number;
  configPrompt: number;
  configTone: number;
  expectedAdultsMax: number;
  expectedKidsMax: number;
  expectedToddlersMax: number;
  overrideCodeMin: number;
  overrideCodeMax: number;
  overrideMaxFailures: number;
  overrideLockMs: number;
  /** Case file caps (model output is untrusted). */
  caseTitle: number;
  caseText: number;
  caseMaxCharacters: number;
  caseMaxClues: number;
  caseMaxOptions: number;
  caseTotalChars: number;
}

export const LIMITS: EngineLimits = {
  maxPlayers: 40,
  minPlayers: 4,
  minAdults: 2,
  maxCluesReleased: 40,
  playerName: 24,
  backstory: 600,
  configName: 60,
  configPrompt: 400,
  configTone: 300,
  expectedAdultsMax: 40,
  expectedKidsMax: 30,
  expectedToddlersMax: 10,
  overrideCodeMin: 4,
  overrideCodeMax: 64,
  overrideMaxFailures: 3,
  overrideLockMs: 10 * 60 * 1000,
  caseTitle: 120,
  caseText: 1500,
  caseMaxCharacters: 60,
  caseMaxClues: 40,
  caseMaxOptions: 8,
  caseTotalChars: 200_000,
};

/** Overrides limits (tests, ops). Returns a function that restores the previous values. */
export function setLimits(patch: Partial<EngineLimits>): () => void {
  const prev = { ...LIMITS };
  Object.assign(LIMITS, patch);
  return () => { Object.assign(LIMITS, prev); };
}
