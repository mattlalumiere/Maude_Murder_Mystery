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
}

export interface Character {
  id: string;
  name: string;
  house: string;
  kid: boolean;
  role: "suspect" | "witness" | "victim" | "mascot" | "informant";
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

export interface Player {
  id: string;
  name: string;
  ageGroup: AgeGroup;
  wantsVictim: boolean;
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
  code: string;
  version: number;
  createdAt: number;
  ttl: number;
  hostId: string;
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
  releasedClueIds: string[];
  ballotsOpen: boolean;
  result?: Result;
}
