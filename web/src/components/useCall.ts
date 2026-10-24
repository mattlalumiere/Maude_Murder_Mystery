"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { credHeaders, type Creds } from "@/lib/client";

type SRResult = { isFinal: boolean; 0: { transcript: string } };
type SR = {
  start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<SRResult> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null;
};
const getSR = (): (new () => SR) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Says what actually went wrong instead of one generic "blocked" message. */
export function micProblem(e: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) return "Microphones only work on a secure page. Open this game at http://localhost:3000 on this computer, or over https on a phone.";
  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) return "This browser cannot use a microphone here. Try Chrome or Safari, or type instead.";
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found on this device. Type instead.";
  if (name === "NotReadableError" || name === "AbortError") return "The microphone is busy in another app. Close it and try again.";
  return `This browser did not allow the microphone${name ? ` (${name})` : ""}. In Brave or Chrome, click the lock icon beside the address bar, set Microphone to Allow, and reload. Inside an app's built-in browser (like the Claude app's preview pane), open the game in a normal browser instead.`;
}

/** The microphone works, but the browser's own speech-to-text service refused or could not be reached. */
export const speechServiceProblem = (code: string) =>
  `Your microphone is allowed, but this browser's speech-to-text service is not (${code}). Brave blocks it by default because it sends audio to Google. Use Chrome, Edge or Safari for the voice call, or ask the host to play with Local services, which transcribes on the host's own computer.`;

export type CallState = "off" | "listening" | "thinking" | "speaking";

interface Opts {
  code: string; creds: Creds; stt: "server" | "browser";
  /** Sends the heard words to the table and resolves when the AI guest has answered and its voice has been queued. */
  onHeard: (text: string) => Promise<void>;
  /** True while an AI guest is talking. */
  speaking: boolean;
  /** Cuts the AI guest off mid-sentence. */
  interrupt: () => void;
  /** With headphones the mic stays open while the guest talks, so you can interrupt. Without them it is muted to avoid hearing itself. */
  headphones: boolean;
}

/**
 * Hands-free call with an AI guest: listen, send, speak, listen again. Browser speech recognition is used unless the host's
 * local speech-to-text is on, in which case a loudness detector records each sentence and sends it to the host's own computer.
 * This is turn-taking with barge-in, not true speech-to-speech: the words go through text in both directions.
 */
export function useCall({ code, creds, stt, onHeard, speaking, interrupt, headphones }: Opts) {
  const [state, setState] = useState<CallState>("off");
  const [error, setError] = useState("");
  const active = useRef(false);
  const speakingRef = useRef(speaking);
  const headphonesRef = useRef(headphones);
  const busy = useRef(false);
  const micGranted = useRef(false);
  const rec = useRef<SR | null>(null);
  const vad = useRef<{ stop: () => void } | null>(null);
  const heard = useRef(onHeard);
  const barge = useRef(interrupt);
  speakingRef.current = speaking; headphonesRef.current = headphones; heard.current = onHeard; barge.current = interrupt;

  const supported = typeof window !== "undefined" && (stt === "browser" ? !!getSR() : typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);

  const say = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || busy.current || !active.current) return;
    busy.current = true; setState("thinking");
    try { await heard.current(t); } catch { setError("That one did not go through. Still listening."); }
    busy.current = false;
    if (active.current) setState(speakingRef.current ? "speaking" : "listening");
  }, []);

  const stopAll = useCallback(() => {
    active.current = false;
    try { rec.current?.abort(); } catch { /* ignore */ }
    rec.current = null;
    vad.current?.stop(); vad.current = null;
    setState("off");
  }, []);

  const startBrowser = useCallback(() => {
    const SRClass = getSR();
    if (!SRClass) return;
    const r = new SRClass();
    rec.current = r;
    r.lang = "en-US"; r.interimResults = true; r.continuous = true;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i], text = res[0].transcript;
        if (speakingRef.current) {
          if (!headphonesRef.current) continue;           // the mic would only hear the guest
          if (text.trim().length > 2) barge.current();     // barge-in
        }
        if (res.isFinal) void say(text);
      }
    };
    r.onerror = (e) => {
      if (e.error === "service-not-allowed" || e.error === "network" || e.error === "not-allowed" || e.error === "language-not-supported") {
        // We already asked for the microphone and got it, so a refusal here is the speech service, not the mic.
        setError(micGranted.current ? speechServiceProblem(e.error) : micProblem(e)); stopAll();
      }
    };
    r.onend = () => { if (active.current) { try { r.start(); } catch { /* already running */ } } };  // browsers end sessions on silence; keep the line open
    r.start();
  }, [say, stopAll]);

  const startServer = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let mr: MediaRecorder | null = null, chunks: Blob[] = [], quietSince = 0, startedAt = 0;
    const finish = () => { const m = mr; mr = null; if (m && m.state === "recording") m.stop(); };
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      const loud = peak > 16, now = Date.now();
      if (speakingRef.current && !headphonesRef.current) return;   // muted while the guest talks
      if (loud) {
        quietSince = 0;
        if (speakingRef.current) barge.current();
        if (!mr && !busy.current) {
          chunks = []; startedAt = now;
          const m = new MediaRecorder(stream);
          m.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
          m.onstop = async () => {
            if (Date.now() - startedAt < 500 || !active.current) return;
            const type = (m.mimeType || "audio/webm").split(";")[0];
            try {
              const r = await fetch(`/api/rooms/${code}/bots/transcribe`, { method: "POST", body: new Blob(chunks, { type }), headers: { ...credHeaders(creds), "content-type": type } });
              const j = (await r.json().catch(() => ({}))) as { text?: string };
              if (r.ok && j.text) await say(j.text);
            } catch { setError("Could not hear that. Still listening."); }
          };
          mr = m; m.start();
        }
      } else if (mr) {
        if (!quietSince) quietSince = now;
        if (now - quietSince > 900 || now - startedAt > 12_000) { quietSince = 0; finish(); }
      }
    }, 100);
    vad.current = { stop: () => { clearInterval(timer); finish(); stream.getTracks().forEach((t) => t.stop()); void ctx.close().catch(() => {}); } };
  }, [code, creds, say]);

  const start = useCallback(async () => {
    setError(""); micGranted.current = false;
    if (active.current) return;
    active.current = true; setState("listening");
    try {
      if (stt === "browser") {
        // Ask for the microphone ourselves first, so the browser shows its permission prompt and a refusal is explained.
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("insecure");
        (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
        micGranted.current = true;
        if (active.current) startBrowser();
      } else await startServer();
    } catch (e) { setError(micProblem(e)); stopAll(); }
  }, [stt, startBrowser, startServer, stopAll]);

  useEffect(() => { if (state !== "off" && !busy.current) setState(speaking ? "speaking" : "listening"); }, [speaking, state]);
  useEffect(() => () => { stopAll(); }, [stopAll]);

  return { state, error, supported, start, stop: stopAll };
}
