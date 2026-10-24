// Pure module (no Node imports): shared by the registration wizard, host console, and server.
// Prices are ESTIMATES in USD. Verify against current AWS Bedrock pricing and override via PRICES.
import type { MediaPlan } from "./types";

export const PRICES = {
  textPerGame: 0.4, // case generation + narration + a little slack (Claude-class model)
  imageStandard: 0.04, // Nova Canvas, standard quality, up to 1024x1024
  imagePremium: 0.06, // Nova Canvas, premium quality
  videoPerSecond: 0.08, // Nova Reel, 720p
  videoSeconds: 6, // one clip
  moderationPerPhoto: 0.001, // Rekognition image moderation
  contingency: 0.15, // keep 15% of the budget unspent as a safety margin
  botChat: 0.004, // one AI guest reply or chatter line (small text model call)
  gameTokenBudget: 150_000, // text tokens one game may spend (input plus output) through the AI gateway
};

export type Prices = typeof PRICES;
export type PricingProfile = "aws" | "local";

/** Local models (and the mock image/moderation providers) cost nothing, but still flow through claim() and the token budget. */
export const LOCAL_PRICES: Prices = {
  textPerGame: 0, imageStandard: 0, imagePremium: 0, videoPerSecond: 0, videoSeconds: PRICES.videoSeconds,
  moderationPerPhoto: 0, botChat: 0, contingency: PRICES.contingency, gameTokenBudget: 200_000,
};

export const pricesFor = (profile: PricingProfile): Prices => (profile === "local" ? LOCAL_PRICES : PRICES);

/** The local profile is selected when the text adapter is the local OpenAI-compatible one. */
export const profileFromEnv = (env: Record<string, string | undefined>): PricingProfile =>
  env.AI_TEXT_ADAPTER === "openai-compatible" ? "local" : "aws";

/** Server side convenience. In a browser bundle `process.env` has no such variable, so this yields the aws table. */
export const activePrices = (): Prices =>
  pricesFor(profileFromEnv(typeof process !== "undefined" && process.env ? process.env : {}));

/** Phases that get scene art, in story order. Avatars are made separately before the game. */
export const SCENE_PHASES = ["act1", "death", "act2", "act3", "act4", "reveal"] as const;
/** Where video clips go, in priority order (most dramatic first). */
export const VIDEO_PHASES = ["death", "reveal", "act3", "act1"] as const;

export const imageCost = (q: MediaPlan["quality"], p: Prices = PRICES) => (q === "premium" ? p.imagePremium : p.imageStandard);
export const videoCost = (p: Prices = PRICES) => p.videoSeconds * p.videoPerSecond;

export interface CostLine { label: string; usd: number }
export interface Estimate { lines: CostLine[]; total: number }

export function estimate(plan: MediaPlan, players: number, photos = players, prices: Prices = PRICES): Estimate {
  const lines: CostLine[] = [{ label: "Story and narration (text AI)", usd: prices.textPerGame }];
  if (plan.avatars) {
    lines.push({ label: `${players} character portraits`, usd: players * imageCost(plan.quality, prices) });
    lines.push({ label: `Photo safety checks (${photos})`, usd: photos * prices.moderationPerPhoto });
  }
  if (plan.scenesPerAct > 0) {
    const n = SCENE_PHASES.length * plan.scenesPerAct;
    lines.push({ label: `${n} story scenes (${plan.scenesPerAct} per act)`, usd: n * imageCost(plan.quality, prices) });
  }
  if (plan.videoClips > 0) {
    lines.push({ label: `${plan.videoClips} video clip${plan.videoClips > 1 ? "s" : ""} (${prices.videoSeconds}s each)`, usd: plan.videoClips * videoCost(prices) });
  }
  return { lines, total: lines.reduce((a, l) => a + l.usd, 0) };
}

export interface Tier { id: string; name: string; blurb: string; plan: MediaPlan }
const P = (avatars: boolean, scenesPerAct: MediaPlan["scenesPerAct"], videoClips: MediaPlan["videoClips"], quality: MediaPlan["quality"] = "standard"): MediaPlan =>
  ({ avatars, scenesPerAct, videoClips, quality, paused: false });

export const TIERS: Tier[] = [
  { id: "text", name: "Text only", blurb: "Story, cards, and clues. No pictures.", plan: P(false, 0, 0) },
  { id: "portraits", name: "Portraits", blurb: "A cartoon portrait for every player.", plan: P(true, 0, 0) },
  { id: "storybook", name: "Storybook", blurb: "Portraits plus one illustrated scene per act.", plan: P(true, 1, 0) },
  { id: "illustrated", name: "Illustrated", blurb: "Portraits plus two scenes per act.", plan: P(true, 2, 0) },
  { id: "cinematic", name: "Cinematic", blurb: "Storybook scenes plus 2 short video clips (the death and the reveal).", plan: P(true, 1, 2) },
  { id: "blockbuster", name: "Blockbuster", blurb: "Premium art, 2 scenes per act, and 4 video clips.", plan: P(true, 2, 4, "premium") },
];

export interface Recommendation {
  budget: number;
  usable: number;
  affordable: (Tier & { cost: number })[];
  best: (Tier & { cost: number }) | null;
  next: (Tier & { cost: number; extra: number }) | null;
  summary: string;
}

/** Works out what a budget buys for a group of this size. */
export function recommend(budget: number, players: number, prices: Prices = PRICES): Recommendation {
  const usable = Math.max(0, budget * (1 - prices.contingency));
  const priced = TIERS.map((t) => ({ ...t, cost: estimate(t.plan, players, players, prices).total }));
  const affordable = priced.filter((t) => t.cost <= usable);
  const best = affordable.length ? affordable[affordable.length - 1] : null;
  const nextT = priced.find((t) => t.cost > usable) ?? null;
  const next = nextT ? { ...nextT, extra: nextT.cost - usable } : null;
  let summary: string;
  if (!best) {
    summary = `$${budget.toFixed(2)} is below the cost of even the text-only game (about $${priced[0].cost.toFixed(2)}). Raise the budget a little or run without AI.`;
  } else {
    summary = `With $${budget.toFixed(2)} for ${players} players you can afford the "${best.name}" experience (about $${best.cost.toFixed(2)}, keeping a ${Math.round(prices.contingency * 100)}% safety margin).`;
    if (next) summary += ` Stepping up to "${next.name}" would need about $${next.extra.toFixed(2)} more.`;
  }
  return { budget, usable, affordable, best, next, summary };
}

/** Clamp a plan to what a cap can actually pay for, trimming the most expensive extras first. */
export function fitPlan(plan: MediaPlan, cap: number, players: number, prices: Prices = PRICES): MediaPlan {
  const usable = cap * (1 - prices.contingency);
  const p = { ...plan };
  while (estimate(p, players, players, prices).total > usable) {
    if (p.videoClips > 0) p.videoClips = (p.videoClips - 1) as MediaPlan["videoClips"];
    else if (p.quality === "premium") p.quality = "standard";
    else if (p.scenesPerAct > 0) p.scenesPerAct = (p.scenesPerAct - 1) as MediaPlan["scenesPerAct"];
    else if (p.avatars) p.avatars = false;
    else break;
  }
  return p;
}
