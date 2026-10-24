"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { botAudioUrl, type BotLineView } from "@/lib/client";
import { Button } from "@/components/kit";

const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Speaks AI guest lines: cloud audio when the server made it, otherwise the browser's own speech. Needs one tap to enable (browsers block autoplay). */
export function useBotVoice(code: string) {
  const [enabled, setEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const queue = useRef<BotLineView[]>([]);
  const busy = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const supported = typeof window !== "undefined" && ("speechSynthesis" in window || typeof Audio !== "undefined");

  const next = useCallback(async () => {
    if (busy.current) return;
    const line = queue.current.shift();
    if (!line) { setSpeaking(false); return; }
    busy.current = true; setSpeaking(true);
    const done = () => { busy.current = false; void next(); };
    try {
      if (line.audio) {
        const a = new Audio(botAudioUrl(code, line.id));
        audio.current = a;
        a.onended = done; a.onerror = done;
        await a.play().catch(done);
      } else if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(line.text);
        const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
        if (voices.length) u.voice = voices[hash(line.botId) % voices.length];
        u.rate = 1; u.pitch = 0.8 + (hash(line.botId) % 5) * 0.1;
        u.onend = done; u.onerror = done;
        window.speechSynthesis.speak(u);
      } else done();
    } catch { done(); }
  }, [code]);

  const speak = useCallback((line: BotLineView) => {
    if (!enabled || seen.current.has(line.id)) return;
    seen.current.add(line.id);
    queue.current.push(line);
    void next();
  }, [enabled, next]);

  /** Barge-in: cuts off whatever is being said and drops anything waiting. */
  const stop = useCallback(() => {
    queue.current = [];
    try { audio.current?.pause(); } catch { /* ignore */ }
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    busy.current = false; setSpeaking(false);
  }, []);

  const markSeen = useCallback((lines: BotLineView[]) => { lines.forEach((l) => seen.current.add(l.id)); }, []);

  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }, []);
  const toggle = () => {
    if (enabled) { queue.current = []; try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
    setEnabled(!enabled);
  };
  return { enabled, toggle, speak, markSeen, supported, stop, speaking };
}

export function VoiceToggle({ enabled, onToggle, label = "Voices" }: { enabled: boolean; onToggle: () => void; label?: string }) {
  return (
    <Button variant="secondary" onClick={onToggle} aria-pressed={enabled} data-testid="voice-toggle">
      {enabled ? `${label}: on (tap to mute)` : `Enable ${label.toLowerCase()}`}
    </Button>
  );
}
