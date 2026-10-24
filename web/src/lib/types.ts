export type Phase =
  | "lobby"
  | "cards"
  | "act1"
  | "death"
  | "act2"
  | "intermission"
  | "act3"
  | "act4"
  | "reveal";

export const PHASES: Phase[] = [
  "lobby", "cards", "act1", "death", "act2", "intermission", "act3", "act4", "reveal",
];

export const PHASE_INFO: Record<Phase, { title: string; clock: string }> = {
  lobby: { title: "Gathering the guests", clock: "before 0:00" },
  cards: { title: "Pre-game: get your card", clock: "0:00" },
  act1: { title: "Act I: The Party", clock: "0:10" },
  death: { title: "The Death", clock: "0:25" },
  act2: { title: "Act II: Interrogation + Clue Round 1", clock: "0:30" },
  intermission: { title: "Intermission", clock: "0:55" },
  act3: { title: "Act III: The Twist + Clue Round 2", clock: "1:05" },
  act4: { title: "Act IV: Showdowns + Accusations", clock: "1:25" },
  reveal: { title: "Act V: The Reveal", clock: "1:40" },
};

export type AgeGroup = "little" | "kid" | "teen" | "adult";

export interface CharacterCard {
  story: string;
  secret: string;
  alibi: string;
  knows: string[];
  goal: string;
  special: string;
  /** Extra material the player supplied (own backstory or a hint for the GM). */
  extra?: string;
}

export interface Character {
  id: string;
  name: string;
  house: string;
  kid: boolean;
  role: "suspect" | "witness" | "victim" | "mascot" | "informant";
  /** Handle (P1, P2...) of the player this character was written for, if any. */
  forHandle?: string;
  tease: string;
  card: CharacterCard;
}

export interface Clue {
  id: string;
  round: 1 | 2;
  text: string;
}

export interface Option {
  id: string;
  text: string;
}

export interface CaseFile {
  title: string;
  setting: string;
  characters: Character[];
  killerId: string;
  victimId: string;
  /** Names appearing in clues that may not be played (NPC fallback) are fine. */
  truth: { methodId: string; motiveId: string; story: string };
  methods: Option[];
  motives: Option[];
  clues: Clue[];
  twist: string;
  narration: Partial<Record<Phase, string>>;
  nudges: Partial<Record<Phase, string>>;
  advanced: Partial<Record<Phase, string>>;
  awards: string[];
}

export interface Ballot {
  killerId: string;
  methodId: string;
  motiveId: string;
}

export type Spice = "mild" | "medium" | "spicy";

/** Host-provided direction for the game. Blank prompts mean "GM's pick". */
export interface GameConfig {
  name: string;
  expected: { adults: number; kids: number; toddlers: number };
  lengthMin: 90 | 120 | 150;
  spice: Spice;
  drinking: "adults" | "none";
  themePrompt: string;
  settingPrompt: string;
  tonePrompt: string;
  mustInclude: string;
  avoid: string;
  allowPlayerBackstory: boolean;
}

export interface MediaPlan {
  avatars: boolean;
  scenesPerAct: 0 | 1 | 2 | 3;
  videoClips: 0 | 1 | 2 | 3 | 4;
  quality: "standard" | "premium";
  paused: boolean;
}

export interface BudgetState {
  capUsd: number;
  spentUsd: number;
  reservedUsd: number;
  plan: MediaPlan;
}

export interface PlayerProfile {
  backstoryMode: "gm" | "hint" | "own";
  backstory: string;
  photoKey?: string;
  consent: "none" | "self" | "guardian";
  avatarId?: string;
}

export type MediaKind = "avatar" | "scene" | "video";

export interface MediaItem {
  id: string;
  kind: MediaKind;
  phase: Phase;
  playerIds: string[];
  prompt: string;
  caption: string;
  status: "queued" | "running" | "polling" | "done" | "failed" | "skipped";
  estCostUsd: number;
  mime?: string;
  key?: string;
  jobRef?: string;
  note?: string;
  lockUntil?: number;
  createdAt: number;
}

export interface BotProfile {
  /** One-line persona the bot speaks in. */
  style: string;
  /** Voice id for the speech adapter in use. */
  voice: string;
}

export interface BotLine {
  id: string;
  botId: string;
  speaker: string;
  text: string;
  phase: Phase;
  kind: "reply" | "chatter";
  /** Name of the player this reply answers. */
  to?: string;
  audioKey?: string;
  audioMime?: string;
  ts: number;
}

export interface BotQueueItem { id: string; botId: string; phase: Phase }
export interface BotConfig { chatter: boolean; voice: boolean }

export interface Player {
  id: string;
  name: string;
  ageGroup: AgeGroup;
  wantsVictim: boolean;
  profile: PlayerProfile;
  /** AI guest: has no device or photo, and speaks through the bot engine. */
  isBot?: boolean;
  bot?: BotProfile;
  token: string;
  characterId?: string;
  ready: boolean;
  ballot?: Ballot;
  hasDevice: boolean;
}

export interface Result {
  killerId: string;
  methodId: string;
  motiveId: string;
  story: string;
  scores: { playerId: string; name: string; points: number; detail: string }[];
  awards: { award: string; to: string }[];
}

export interface Room {
  /** Short join code shown to users; resolves to gameId through the directory. */
  code: string;
  /** Internal 26 char ULID, never shown to users. Tenant key component. */
  gameId: string;
  /** Cell and region that own this game for its whole life. */
  cellId: string;
  regionId: string;
  version: number;
  createdAt: number;
  ttl: number;
  hostId: string;
  config: GameConfig;
  budget: BudgetState;
  media: MediaItem[];
  overrideSalt: string;
  overrideHash: string;
  failedOverrides: number;
  lockedUntil: number;
  overrideUsed: boolean;
  phase: Phase;
  phaseStartedAt: number;
  paused: boolean;
  players: Player[];
  case?: CaseFile;
  caseSource?: "sample" | "bedrock";
  releasedClueIds: string[];
  ballotsOpen: boolean;
  /** Set (epoch ms) while the host-triggered case generation is running; null/undefined otherwise. */
  generating?: number;
  botLog?: BotLine[];
  botQueue?: BotQueueItem[];
  botConfig?: BotConfig;
  botCooldown?: Record<string, number>;
  botMessages?: number;
  result?: Result;
}
