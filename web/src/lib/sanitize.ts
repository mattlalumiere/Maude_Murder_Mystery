import { LIMITS } from "./engine-limits";
import type { GameConfig, MediaPlan, PlayerProfile, Spice } from "./types";

export const clean = (v: unknown, max: number) =>
  String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function sanitizeConfig(i: Partial<GameConfig> | undefined): GameConfig {
  const x = i ?? {};
  const spice: Spice = (["mild", "medium", "spicy"] as const).includes(x.spice as Spice) ? (x.spice as Spice) : "medium";
  const len = [90, 120, 150].includes(Number(x.lengthMin)) ? (Number(x.lengthMin) as GameConfig["lengthMin"]) : 120;
  return {
    name: clean(x.name, LIMITS.configName),
    expected: {
      adults: int(x.expected?.adults, 2, LIMITS.expectedAdultsMax, 12),
      kids: int(x.expected?.kids, 0, LIMITS.expectedKidsMax, 6),
      toddlers: int(x.expected?.toddlers, 0, LIMITS.expectedToddlersMax, 1),
    },
    lengthMin: len,
    spice,
    drinking: x.drinking === "none" ? "none" : "adults",
    themePrompt: clean(x.themePrompt, LIMITS.configPrompt),
    settingPrompt: clean(x.settingPrompt, LIMITS.configPrompt),
    tonePrompt: clean(x.tonePrompt, LIMITS.configTone),
    mustInclude: clean(x.mustInclude, LIMITS.configPrompt),
    avoid: clean(x.avoid, LIMITS.configPrompt),
    allowPlayerBackstory: x.allowPlayerBackstory !== false,
    aiMode: x.aiMode === "local" || x.aiMode === "cloud" ? x.aiMode : "auto",
  };
}

export function sanitizePlan(i: Partial<MediaPlan> | undefined, prev?: MediaPlan): MediaPlan {
  const x = i ?? {};
  const base = prev ?? { avatars: false, scenesPerAct: 0, videoClips: 0, quality: "standard", paused: false };
  return {
    avatars: x.avatars ?? base.avatars,
    scenesPerAct: int(x.scenesPerAct ?? base.scenesPerAct, 0, 3, 0) as MediaPlan["scenesPerAct"],
    videoClips: int(x.videoClips ?? base.videoClips, 0, 4, 0) as MediaPlan["videoClips"],
    quality: (x.quality ?? base.quality) === "premium" ? "premium" : "standard",
    paused: x.paused ?? base.paused,
  };
}

export function sanitizeProfile(i: Partial<PlayerProfile> | undefined, allowBackstory: boolean): PlayerProfile {
  const x = i ?? {};
  const mode = allowBackstory && (x.backstoryMode === "hint" || x.backstoryMode === "own") ? x.backstoryMode : "gm";
  const backstory = mode === "gm" ? "" : clean(x.backstory, LIMITS.backstory);
  return {
    backstoryMode: backstory ? mode : "gm",
    backstory,
    consent: x.consent === "self" || x.consent === "guardian" ? x.consent : "none",
  };
}

export const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(500, Math.max(0, Math.round(n * 100) / 100)) : 0;
};
