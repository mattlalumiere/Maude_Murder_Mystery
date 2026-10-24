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
  /** The embellished life story written for this player (set after casting). */
  life?: Life;
  /** A public-safe visual description (outfit, props, vibe) used to draw their portrait. Never hints at guilt. */
  visual?: string;
  /** The first-round briefing: what to do, where to start, what to note. */
  opening?: Opening;
}

export interface Life { earlyLife: string; loveLife: string; hobbies: string; ambition: string }
export interface Opening { objective: string; startHere: string[]; notes: string[] }

export interface Character {
  id: string;
  name: string;
  house: string;
  kid: boolean;
  role: "suspect" | "witness" | "victim" | "mascot" | "informant";
  /** Handle (P1, P2...) of the player this character was written for, if any. */
  forHandle?: string;
  /** Template slot (P1, P2, ...) used by the name token {{P1}}. Players keep their own names; the slot is replaced by it. */
  slot?: string;
  /** Public occupation, shown to everyone ("Caterer"). */
  title?: string;
  /** Private story trait, assigned at casting ("Gambler", "Murderer"). Only the player sees it. */
  trait?: string;
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
  /** "adults": optional sips. "heavy": adults who opt in drink full drinks at game prompts (adults only, personal limits, tap-out always). "none": alcohol-free. */
  drinking: "adults" | "heavy" | "none";
  /** Heavy mode only: the host confirms every drinker is of legal drinking age and chose to take part. */
  drinkingAttested?: boolean;
  /** Adults-only unfiltered mode: no one under 18, darker taboo comedy. Needs the host's confirmation. */
  adultsOnly?: boolean;
  adultsAttested?: boolean;
  themePrompt: string;
  settingPrompt: string;
  tonePrompt: string;
  mustInclude: string;
  avoid: string;
  allowPlayerBackstory: boolean;
  /** Which AI services to use: automatic (configured cloud or built-in), cloud only, or the local MCP-connected containers. */
  aiMode?: "auto" | "cloud" | "local";
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

export interface DrinkProfile {
  /** "in": takes part with real drinks up to a personal limit. "out": takes part with a mocktail or water. */
  mode: "in" | "out";
  /** Personal limit in standard drinks for the whole night. The game never prompts past it. */
  limit: number;
}

export interface PlayerProfile {
  drink?: DrinkProfile;
  backstoryMode: "gm" | "hint" | "own";
  backstory: string;
  photoKey?: string;
  consent: "none" | "self" | "guardian";
  avatarId?: string;
}

export type MediaKind = "avatar" | "scene" | "video" | "selfie";

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
  /** Selfie jobs: the raw photo to restyle. Deleted as soon as the job finishes. */
  refKey?: string;
  /** Selfie style id, so a redo can repeat it. */
  style?: string;
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

export interface DrinkPrompt {
  id: string;
  phase: Phase;
  title: string;
  text: string;
  /** Standard drinks for people who are "in". "out" players take a mocktail or water. 0 means a water and snack round. */
  units: number;
  scope: "all" | "targets";
  /** Players this prompt is for (adults taking part). */
  targetIds: string[];
  answers: Record<string, "drank" | "tapped">;
  ts: number;
}

export interface DrinkTally { units: number; water: number; drinks: number[]; done: boolean }
export interface DrinkState { prompts: DrinkPrompt[]; tally: Record<string, DrinkTally>; paused: boolean; stopped: boolean }

export interface ChatMsg {
  id: string;
  from: string;
  name: string;
  text: string;
  bot?: boolean;
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
  /** How the story refers to this player. Names and pronouns are never changed by the story. */
  pronouns?: "he" | "she" | "they";
  /** The player's private detective notebook. */
  notes?: string;
  /** AI guest: has no device or photo, and speaks through the bot engine. */
  isBot?: boolean;
  bot?: BotProfile;
  /** Character this player asked for (choose-your-character stories). */
  wantsCharacter?: string;
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
  /** The story with {{P#}} name tokens still in it (saved stories use this, never real names). */
  caseTemplate?: CaseFile;
  /** Life stories still being written (AI): who is queued, who is done, and who a worker has claimed. */
  life?: { queue: string[]; done: string[]; total: number; startedAt: number; claims?: { id: string; until: number }[] };
  /** Who is the killer and the victim, and every trait, decided before the story is written (handles are P1, P2, ... in join order). */
  castPlan?: { killer: string; victim: string; traits: Record<string, string> };
  caseSource?: "sample" | "bedrock" | "story";
  /** Saved story this game replays, and whether players pick their own character from it. */
  storyId?: string;
  storyMode?: "random" | "choose";
  releasedClueIds: string[];
  ballotsOpen: boolean;
  /** Set (epoch ms) while the host-triggered case generation is running; null/undefined otherwise. */
  generating?: number;
  drinks?: DrinkState;
  botLog?: BotLine[];
  /** Portrait redos used per player. */
  avatarRedos?: Record<string, number>;
  /** Selfie pictures each player has ever made (deleting one does not give the spend back). */
  selfieMade?: Record<string, number>;
  /** Players who have used their one un-ready this round. */
  readyUndo?: string[];
  /** When the rest of the table is auto-moved on (set once two thirds are ready). */
  readyDeadline?: number;
  /** A short break between rounds while the next round's pictures render. */
  transition?: { to: Phase; startedAt: number; until: number; skip?: string[]; stage: "gm" | "break"; gmUntil: number };
  /** The table talk: short messages between players and AI guests. */
  chat?: ChatMsg[];
  botQueue?: BotQueueItem[];
  botConfig?: BotConfig;
  botCooldown?: Record<string, number>;
  botMessages?: number;
  result?: Result;
}
