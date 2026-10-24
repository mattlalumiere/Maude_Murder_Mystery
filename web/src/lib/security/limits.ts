import type { RateRule, RouteClass } from "./rate-limit";

/**
 * Single source of truth for every quota. W3 (storage), W4 (engine) and W5 (AI) import or copy these names.
 * Rationale per entry lives in docs/platform/scale/limits.md. Change both together.
 */
export const LIMITS = {
  // Game shape
  typicalPlayersPerGame: 16,
  maxPlayersPerGame: 40,
  maxPlayerNameChars: 24,
  maxBackstoryChars: 600,
  maxHostPromptChars: 400,
  joinCodeLength: 6,
  activeGamesTarget: 20_000,
  maxActiveGamesPerHost: 3,
  maxGamesCreatedPerHostPerDay: 10,
  gameTtlHours: 24,
  maxGameTtlHours: 72,
  // Request sizes
  maxJsonBodyBytes: 32 * 1024,
  maxPhotoBytes: 2 * 1024 * 1024,
  maxPhotoBodyBytes: 2 * 1024 * 1024 + 4096,
  // Storage
  maxStateBytesPerGame: 256 * 1024,
  maxStoredBytesPerGame: 64 * 1024 * 1024,
  maxPhotosPerGame: 40,
  maxMediaItemsPerGame: 60,
  maxGeneratedImageBytes: 8 * 1024 * 1024,
  maxGeneratedVideoBytes: 40 * 1024 * 1024,
  maxStoreWritesPerGamePerSec: 10,
  maxMutateRetries: 6,
  // Override code
  minOverrideCodeChars: 6,
  maxOverrideCodeChars: 64,
  maxFailedOverrides: 3,
  overrideLockMinutes: 10,
  // AI
  maxAiSpendUsdPerGame: 50,
  maxAiTokensPerGame: 150_000,
  maxAiOutputTokensPerCall: 4096,
  maxCaseGenerationsPerGame: 3,
  aiConcurrencyPerBox: 3,
  aiQueueDepthPerCell: 200,
  aiQueueMaxWaitSec: 120,
  aiTimeoutSec: 60,
  // Retention
  photoRetentionHours: 24,
  auditRetentionDays: 30,
} as const;

type Scope = Record<RouteClass, RateRule>;

/** Token buckets: capacity is the burst, refillPerSec the sustained rate. */
export const RATE_LIMITS: { game: Scope; ip: Scope } = {
  // Per game. A full game polls at (16+2)/2 = 9 rps, so state allows 24 rps sustained.
  game: {
    state: { capacity: 60, refillPerSec: 24 },
    action: { capacity: 20, refillPerSec: 5 },
    join: { capacity: 24, refillPerSec: 1 },
    photo: { capacity: 8, refillPerSec: 0.2 },
    mediaRun: { capacity: 4, refillPerSec: 0.5 },
    mediaGet: { capacity: 80, refillPerSec: 20 },
    create: { capacity: 10, refillPerSec: 1 },
    auth: { capacity: 20, refillPerSec: 1 },
    api: { capacity: 40, refillPerSec: 10 },
  },
  // Per client IP. A party shares one NAT, so these are looser than per game for the hot paths.
  ip: {
    state: { capacity: 120, refillPerSec: 40 },
    action: { capacity: 40, refillPerSec: 10 },
    join: { capacity: 30, refillPerSec: 2 },
    photo: { capacity: 12, refillPerSec: 0.3 },
    mediaRun: { capacity: 8, refillPerSec: 1 },
    mediaGet: { capacity: 160, refillPerSec: 40 },
    create: { capacity: 3, refillPerSec: 1 / 60 },
    auth: { capacity: 10, refillPerSec: 0.2 },
    api: { capacity: 60, refillPerSec: 15 },
  },
};
