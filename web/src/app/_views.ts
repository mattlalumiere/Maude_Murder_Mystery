// Shapes of the three client views (hostView, playerView, publicView). Secret fields are never part of these.
import type { BudgetState, CharacterCard, GameConfig } from "@/lib/types";

export type MediaItemView = { id: string; kind: string; phase: string; caption: string; mime?: string };

export type HostState = {
  version: number; code: string; phase: string; phaseTitle: string; clock: string; paused: boolean; title?: string;
  narration?: string; overrideUsed: boolean; ballotsIn: number; totalPlayers: number; ballotsOpen: boolean;
  runSheet: { phase: string; title: string; clock: string }[];
  players: { id: string; name: string; ageGroup: string; ready: boolean; hasDevice: boolean; ballot: boolean; characterName?: string; hasPhoto: boolean; backstory: string }[];
  clues: { id: string; text: string }[];
  reveal?: { killer?: string; scores: { name: string; points: number }[] };
  generating?: number | null; starting?: boolean; drinking?: "adults" | "none";
  config: GameConfig; caseSource?: "sample" | "bedrock"; aiDegraded?: boolean; budget: BudgetState;
  jobs: { id: string; kind: string; phase: string; status: string; note?: string; est: number; caption: string }[];
};

export type Opt = { id: string; text?: string; name?: string; house?: string };

export type PlayerState = {
  version: number; phase: string; phaseTitle: string; paused: boolean; narration?: string; setting?: string; title?: string;
  starting?: boolean; drinking?: "adults" | "none";
  lobbyNames: string[]; clues: { id: string; text: string }[]; ballotsOpen: boolean;
  ballotOptions?: { suspects: Opt[]; methods: Opt[]; motives: Opt[] };
  roster: { playerName: string; characterName: string; house: string; tease: string }[];
  reveal?: { killer?: string; method?: string; motive?: string; story: string; scores: { name: string; points: number; detail: string }[]; awards: { award: string; to: string }[] };
  media: MediaItemView[];
  me: {
    id: string; name: string; ageGroup: string; ready: boolean; avatarId?: string; profile: { hasPhoto: boolean; consent: string };
    ballot?: { killerId: string; methodId: string; motiveId: string };
    character?: { name: string; house: string; tease: string; role: string; card: CharacterCard };
  };
};

export type ScreenState = {
  version: number; code: string; phase: string; phaseTitle: string; paused: boolean; narration?: string; title?: string; setting?: string;
  starting?: boolean; drinking?: "adults" | "none";
  lobbyNames: string[]; clues: { id: string; round: number; text: string }[];
  roster: { playerName: string; characterName: string; house: string; tease: string; avatarId?: string }[];
  partyName: string; media: MediaItemView[];
  ballotsIn: number; totalPlayers: number; ballotsOpen: boolean;
  reveal?: { killer?: string; method?: string; motive?: string; story: string; scores: { name: string; points: number }[]; awards: { award: string; to: string }[] };
};
