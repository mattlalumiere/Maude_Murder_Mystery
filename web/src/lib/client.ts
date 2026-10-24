"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* API access. Every network call from the UI goes through here so a   */
/* future mobile shell can reuse this file unchanged.                  */
/* ------------------------------------------------------------------ */

export type Headers_ = Record<string, string>;
export type Creds = { pid: string; tok: string };

export async function api<T = unknown>(path: string, body?: unknown, headers: Headers_ = {}, method?: "GET" | "POST" | "DELETE"): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

export const credHeaders = (c: Creds): Headers_ => ({ "x-player-id": c.pid, "x-player-token": c.tok });

export const createGame = (b: { overrideCode: string; config: unknown; capUsd: number; plan: unknown; storyId?: string; storyMode?: string }) =>
  api<{ code: string }>("/api/rooms", b);
export const joinGame = (code: string, b: unknown) => api<{ playerId: string; token: string }>(`/api/rooms/${code}/join`, b);
export const sendAction = <T = Record<string, unknown>>(code: string, body: object, headers: Headers_ = {}) =>
  api<T>(`/api/rooms/${code}/action`, body, headers);
export const runMedia = (code: string) => api(`/api/rooms/${code}/media/run`, {});
export const runGenerate = (code: string) => api(`/api/rooms/${code}/generate`, {});
export type BotLineView = { id: string; botId: string; speaker: string; text: string; kind: "reply" | "chatter"; to?: string; phase: string; audio: boolean; ts: number };
export type BotView = { id: string; name: string; characterName: string; avatarId?: string };
export const chatWithBot = (code: string, botId: string, message: string, creds: Creds) =>
  api<{ line: BotLineView }>(`/api/rooms/${code}/bots/${botId}/chat`, { message }, credHeaders(creds));
export const runBotTick = (code: string) => api(`/api/rooms/${code}/bots/tick`, {});
export const botAudioUrl = (code: string, id: string) => `/api/rooms/${code}/bots/audio/${id}`;
export type StoryCard = { id: string; title: string; blurb: string; kind: "story" | "cast"; savedAt: number; castCount: number; votes: number; playedVotes: number; plays: number };
export type StoryDetail = {
  story: { id: string; title: string; blurb: string; kind: "story" | "cast"; visibility: "link" | "public"; savedAt: number; setting: string; castCount: number; houses: string[]; characters?: { id: string; name: string; house: string; tease: string; kid: boolean }[]; hasRecap: boolean; recapNames: boolean; recapPictures: boolean };
  engagement: { votes: number; playedVotes: number; plays: number; reports: number }; mine: boolean; signedIn: boolean;
};
export type RecapView = {
  title: string; partyName: string; narration: Record<string, string>; clues: string[];
  reveal?: { killer: string; method: string; motive: string; story: string }; scores: { name: string; points: number }[]; awards: { award: string; to: string }[];
  images: { id: string; kind: string; caption: string; mime: string }[];
};
export const storyUrl = (id: string) => `/stories/${id}`;
export const mediaUrl = (code: string, id: string) => `/api/rooms/${code}/media/${id}`;

export async function uploadPhotoBlob(code: string, creds: Creds, blob: Blob, consent: "self" | "guardian") {
  const r = await fetch(`/api/rooms/${code}/photo`, {
    method: "POST", body: blob,
    headers: { ...credHeaders(creds), "x-consent": consent, "content-type": "image/jpeg" },
  });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Upload failed");
}

/* ------------------------------------------------------------------ */
/* Browser storage wrapper (never throws).                             */
/* ------------------------------------------------------------------ */

export const credsKey = (code: string) => `mm:${code}`;

export function parseCreds(raw: string | null): Creds | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { pid?: unknown; tok?: unknown };
    return typeof v.pid === "string" && typeof v.tok === "string" ? { pid: v.pid, tok: v.tok } : null;
  } catch { return null; }
}

export function loadCreds(code: string): Creds | null {
  try { return parseCreds(localStorage.getItem(credsKey(code))); } catch { return null; }
}
export function saveCreds(code: string, c: Creds) {
  try { localStorage.setItem(credsKey(code), JSON.stringify(c)); } catch { /* private mode: fine */ }
}

/* ------------------------------------------------------------------ */
/* Pure view-model helpers (unit tested in test/unit/ui).              */
/* ------------------------------------------------------------------ */

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
export const isValidCode = (s: string) => /^[A-Z0-9]{4,6}$/.test(s);

export type ConnectionStatus = "loading" | "live" | "reconnecting" | "failed";
export function connectionStatus(i: { failures: number; hasState: boolean }): ConnectionStatus {
  if (i.hasState) return i.failures > 0 ? "reconnecting" : "live";
  return i.failures >= 3 ? "failed" : "loading";
}

/** Poll delay: base when healthy, doubling per failure, capped at 15 s. */
export function backoffDelay(failures: number, base: number): number {
  return Math.min(15000, base * 2 ** Math.max(0, failures));
}

export function friendlyError(msg: string): string {
  const m = (msg || "").trim();
  if (!m) return "Something went wrong. Please try again.";
  if (/not found/i.test(m) && /room/i.test(m)) return "We can't find that room. Check the code and try again.";
  if (/failed to fetch|networkerror|load failed|network request/i.test(m)) return "Check your connection. We will keep trying.";
  if (/sign in/i.test(m)) return "Please sign in to continue.";
  if (/not the host/i.test(m)) return "Only the host can open this page.";
  if (m.length > 160) return "Something went wrong. Please try again.";
  return m;
}

export type WizardInput = { expected: { adults: number; kids: number; toddlers: number }; bots?: number; overrideCode: string; budget: number };
export const WIZARD_STEPS = ["Guests", "Story", "Pictures", "Secret code"] as const;

export function wizardProgress(step: number, total: number) {
  return { step, total, percent: Math.round((step / total) * 100) };
}

/** Returns an error message for the given step (1 to 4) or an empty string when fine. */
export function validateWizardStep(step: number, v: WizardInput): string {
  if (step === 1) {
    // AI guests count as players and are cast as grown-ups.
    const bots = v.bots ?? 0;
    const n = v.expected.adults + v.expected.kids + v.expected.toddlers + bots;
    if (!Number.isFinite(n) || n < 4) return "Plan for at least 4 guests so everyone gets a part. AI guests count too.";
    if (v.expected.adults + bots < 2) return "At least 2 grown-ups are needed (AI guests count as grown-ups).";
  }
  if (step === 3 && (!Number.isFinite(v.budget) || v.budget < 0)) return "Enter a budget of 0 or more.";
  if (step === 4 && v.overrideCode.trim().length < 4) return "Your secret code needs at least 4 characters.";
  return "";
}

export type JoinInput = {
  name: string; age: "little" | "kid" | "teen" | "adult"; mode: "gm" | "hint" | "own"; text: string;
  photoBlob: boolean; photoConsent: boolean;
};
export function canJoin(i: JoinInput): boolean {
  if (!i.name.trim()) return false;
  if (i.photoBlob && !i.photoConsent) return false;
  if (i.age !== "little" && i.mode !== "gm" && !i.text.trim()) return false;
  return true;
}

export type BallotDraft = { killerId: string; methodId: string; motiveId: string };
export function ballotProgress(b: BallotDraft) {
  const done = [b.killerId, b.methodId, b.motiveId].filter(Boolean).length;
  return { done, total: 3, complete: done === 3 };
}

export const phaseIndex = (sheet: { phase: string }[], phase: string) => sheet.findIndex((r) => r.phase === phase);
export function nextPhaseTitle(sheet: { phase: string; title: string }[], phase: string): string {
  return sheet[phaseIndex(sheet, phase) + 1]?.title ?? "the end";
}

/** Deterministic small rotation (degrees, -2 to 2) so paper clues look hand-placed but stay stable. */
export function tilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 5) - 2;
}

export function groupByHouse<T extends { house: string }>(items: T[]): { house: string; members: T[] }[] {
  const out: { house: string; members: T[] }[] = [];
  for (const it of items) {
    const g = out.find((x) => x.house === it.house);
    if (g) g.members.push(it); else out.push({ house: it.house, members: [it] });
  }
  return out;
}

export const formatUsd = (n: number) => `$${n.toFixed(2)}`;

export function degradedNotice(s: { aiDegraded?: boolean; caseSource?: string }): string {
  if (s.aiDegraded) return "The storyteller AI is resting, so we are using the sample case. The game still works.";
  if (s.caseSource === "sample") return "Playing the built-in sample case.";
  return "";
}

/** Player text is rendered by React as text nodes; this only removes control characters. */
export function plainText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/**
 * Polls room state. Keeps the last good state on errors, backs off quietly,
 * and resumes at once when the tab becomes visible or the network returns.
 */
export function useRoom<T extends { version: number }>(code: string, role: "host" | "player" | "screen", headers: Headers_ = {}, ms = 2000) {
  const [state, setState] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [failures, setFailures] = useState(0);
  const version = useRef(-1);
  const fails = useRef(0);
  const hdr = useRef(headers);
  hdr.current = headers;

  const refresh = useCallback(async (force = false) => {
    try {
      const r = await api<T & { unchanged?: boolean }>(`/api/rooms/${code}/state?role=${role}&v=${force ? -1 : version.current}`, undefined, hdr.current);
      if (!r.unchanged) { version.current = r.version; setState(r); }
      fails.current = 0; setFailures(0); setError("");
    } catch (e) {
      fails.current += 1; setFailures(fails.current); setError(friendlyError((e as Error).message));
    }
  }, [code, role]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      if (stop) return;
      if (!document.hidden) await refresh();
      if (!stop) timer = setTimeout(loop, backoffDelay(fails.current, ms));
    };
    const wake = () => { if (!document.hidden) { clearTimeout(timer); loop(); } };
    loop();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [refresh, ms]);

  const status = connectionStatus({ failures, hasState: !!state });
  return { state, error, status, refresh };
}

/** Wraps an async action with busy and error state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    setBusy(true); setErr("");
    try { return await fn(); } catch (e) { setErr(friendlyError((e as Error).message)); return undefined; } finally { setBusy(false); }
  }, []);
  return { busy, err, setErr, run };
}

/** Sets the document title for a screen (small wrapper so no page touches document directly). */
export function useDocTitle(title: string) {
  useEffect(() => { document.title = title; }, [title]);
}

/* ------------------------------------------------------------------ */
/* Small browser wrappers (the only place screens touch window APIs).  */
/* ------------------------------------------------------------------ */

export const originUrl = () => (typeof location === "undefined" ? "" : location.origin);
export const hostName = () => (typeof location === "undefined" ? "" : location.host);
export const askConfirm = (msg: string) => (typeof window === "undefined" ? false : window.confirm(msg));
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
export function consumeCredsFromUrl(code: string): void {
  try {
    const q = new URLSearchParams(location.search);
    const pid = q.get("pid"), tok = q.get("tok");
    if (pid && tok) { saveCreds(code, { pid, tok }); history.replaceState(null, "", location.pathname); }
  } catch { /* ignore */ }
}

/** Marks the page as the TV surface (bigger type tokens) while mounted. */
export function useTvSurface() {
  useEffect(() => {
    document.body.dataset.surface = "tv";
    return () => { delete document.body.dataset.surface; };
  }, []);
}
