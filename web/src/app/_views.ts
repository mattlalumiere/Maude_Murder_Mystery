// Shapes of the three client views (hostView, playerView, publicView). Secret fields are never part of these.
import type { BotLineView, BotView } from "@/lib/client";
import type { LaunchView } from "@/lib/launch";
import type { BudgetState, CharacterCard, GameConfig } from "@/lib/types";

export type DrinkRoundView = { id: string; title: string; text: string; units: number; scope: "all" | "targets"; names: string[]; answered: number; total: number };
export type DrinkPublic = { paused: boolean; stopped: boolean; round: DrinkRoundView | null; rules: string[]; standardDrink: string };
export type DrinkMe = { mode: "in" | "out"; limit: number; units: number; water: number; atLimit: boolean; paceHold: boolean; pending: DrinkRoundView | null };
export type DrinkHost = { paused: boolean; stopped: boolean; players: { id: string; name: string; mode: "in" | "out"; limit: number; units: number; water: number; done: boolean }[] };

export type CallView = { id: string; withId: string; withName: string; role: "caller" | "callee"; state: "ringing" | "active" | "ended"; offer?: string; answer?: string };
export type RoundView = { canReady: boolean; ready: number; total: number; needed: number; countdownMs: number | null; intermission: { toTitle: string; stage: "gm" | "break"; gm: { title: string; text: string; clock: string } | null; remainingMs: number; skipVotes: number; skipNeeded: number; artLeft: number; artTotal: number } | null };
export type RecapLine = { id: string; who: string; text: string; bot: boolean; botId: string; audio: boolean; ts: number };
export type BotCommon = { round?: RoundView; recap?: RecapLine[]; adultsOnly?: boolean; selfies?: { id: string; caption: string }[]; launch?: LaunchView | null; drink?: DrinkPublic; storyId?: string | null; stt?: "server" | "browser"; bots: BotView[]; botLog: BotLineView[]; botConfig: { chatter: boolean; voice: boolean }; speech: "server" | "browser" };

export type MediaItemView = { id: string; kind: string; phase: string; caption: string; mime?: string };

export type HostState = BotCommon & {
  botQueued?: number;
  lifeLeft?: number;
  version: number; code: string; phase: string; phaseTitle: string; clock: string; paused: boolean; title?: string;
  narration?: string; overrideUsed: boolean; ballotsIn: number; totalPlayers: number; ballotsOpen: boolean;
  runSheet: { phase: string; title: string; clock: string }[];
  players: { id: string; name: string; isBot?: boolean; ageGroup: string; ready: boolean; hasDevice: boolean; ballot: boolean; characterName?: string; hasPhoto: boolean; backstory: string }[];
  clues: { id: string; text: string }[];
  reveal?: { killer?: string; scores: { name: string; points: number }[] };
  localAi?: boolean; aiMode?: string; generationWindowMs?: number; generating?: number | null; starting?: boolean; drinking?: "adults" | "heavy" | "none";
  drinks?: DrinkHost;
  config: GameConfig; caseSource?: "sample" | "bedrock"; aiDegraded?: boolean; budget: BudgetState;
  jobs: { id: string; kind: string; phase: string; status: string; note?: string; est: number; caption: string }[];
};

export type Opt = { id: string; text?: string; name?: string; house?: string };

export type PlayerState = BotCommon & {
  chat?: { id: string; from: string; name: string; text: string; bot: boolean; ts: number; private?: boolean; to?: string; toName?: string }[];
  people?: { id: string; name: string; isBot: boolean; canCall: boolean }[];
  calls?: CallView[];
  version: number; phase: string; phaseTitle: string; paused: boolean; narration?: string; setting?: string; title?: string;
  starting?: boolean; drinking?: "adults" | "heavy" | "none";
  lobbyNames: string[]; clues: { id: string; text: string }[]; ballotsOpen: boolean;
  ballotOptions?: { suspects: Opt[]; methods: Opt[]; motives: Opt[] };
  roster: { playerName: string; characterName: string; house: string; tease: string; avatarId?: string; ready?: boolean; isBot?: boolean }[];
  reveal?: { killer?: string; method?: string; motive?: string; story: string; scores: { name: string; points: number; detail: string }[]; awards: { award: string; to: string }[] };
  media: MediaItemView[];
  me: {
    canUndoReady?: boolean; skippedIntermission?: boolean; tracked?: boolean; selfieOk?: boolean; notes?: string; pronouns?: "he" | "she" | "they"; selfies?: { id: string; status: string; note?: string; style?: string; canRedo?: boolean }[]; portraitRedos?: number;
    id: string; name: string; ageGroup: string; ready: boolean; avatarId?: string; drink?: DrinkMe; profile: { hasPhoto: boolean; consent: string };
    ballot?: { killerId: string; methodId: string; motiveId: string };
    character?: { name: string; house: string; tease: string; role: string; title?: string; trait?: string; card: CharacterCard };
  };
};

export type ScreenState = BotCommon & {
  version: number; code: string; phase: string; phaseTitle: string; paused: boolean; narration?: string; title?: string; setting?: string;
  starting?: boolean; drinking?: "adults" | "heavy" | "none";
  lobbyNames: string[]; clues: { id: string; round: number; text: string }[];
  roster: { playerName: string; characterName: string; house: string; tease: string; avatarId?: string; ready?: boolean; isBot?: boolean }[];
  partyName: string; media: MediaItemView[];
  ballotsIn: number; totalPlayers: number; ballotsOpen: boolean;
  reveal?: { killer?: string; method?: string; motive?: string; story: string; scores: { name: string; points: number }[]; awards: { award: string; to: string }[] };
};
