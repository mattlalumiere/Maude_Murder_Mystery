"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Progress } from "@/components/kit";
import { botAudioUrl } from "@/lib/client";
import { LAUNCH_QUIPS } from "@/lib/quips";
import type { RecapLine, RoundView } from "@/app/_views";

const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Counts down to a moment the server named as "ms from now". Keyed on the state object, so each fresh poll re-bases it. */
export function useRemaining(ms: number | null | undefined, basis: unknown): number | null {
  const base = useMemo(() => (typeof ms === "number" ? Date.now() + ms : null), [ms, basis]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, setTick] = useState(0);
  useEffect(() => { if (base === null) return; const t = setInterval(() => setTick((n) => n + 1), 500); return () => clearInterval(t); }, [base]);
  return base === null ? null : Math.max(0, base - Date.now());
}

type Rosterish = { playerName: string; ready?: boolean; isBot?: boolean };

/** Who is ready: a check mark next to each name. */
export function ReadyNames({ roster, big = false }: { roster: Rosterish[]; big?: boolean }) {
  return (
    <ul className="sc-chips" aria-label="Who is ready" data-testid="ready-names" style={big ? { fontSize: "1.4rem" } : undefined}>
      {roster.filter((r) => !r.isBot).map((r) => (
        <li key={r.playerName} data-ready={r.ready ? "true" : "false"} style={{ opacity: r.ready ? 1 : 0.6 }}>{r.playerName} {r.ready ? "✓" : "…"}</li>
      ))}
    </ul>
  );
}

/** Ready button and status for a player's phone. */
export function ReadyBar({ round, roster, ready, canUndo, tracked, busy, onReady, basis }: {
  round: RoundView; roster: Rosterish[]; ready: boolean; canUndo: boolean; tracked: boolean; busy: boolean; onReady: (on: boolean) => void; basis: unknown;
}) {
  const left = useRemaining(round.countdownMs, basis);
  if (!round.canReady || !tracked) return null;
  return (
    <Card title="Ready for the next round?" data-testid="ready-bar" style={{ marginTop: "var(--space-3)" }}>
      <p className="muted" style={{ marginTop: 0 }} data-testid="ready-count">{round.ready} of {round.total} ready</p>
      {!ready ? (
        <Button size="lg" block disabled={busy} onClick={() => onReady(true)} data-testid="ready-button">I am ready</Button>
      ) : (
        <>
          <p style={{ margin: "0 0 var(--space-2)" }} role="status" data-testid="ready-status"><b>You are ready ✓</b> Waiting for the others.</p>
          <Button variant="secondary" disabled={busy || !canUndo} onClick={() => onReady(false)} data-testid="unready-button">
            {canUndo ? "Not yet (you can do this once)" : "You already took it back once"}
          </Button>
        </>
      )}
      {left !== null && (
        <p role="timer" data-testid="ready-countdown" style={{ margin: "var(--space-3) 0 0" }}>
          Moving on in <b>{clock(left)}</b> whether or not everyone is ready.
        </p>
      )}
      <ReadyNames roster={roster} />
    </Card>
  );
}

/** Speaks the recap lines one after another (guest audio when the server made it, otherwise the browser's voice). */
function usePlayRecap(code: string, lines: RecapLine[]) {
  const [playing, setPlaying] = useState(false);
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }, []);
  async function play() {
    if (playing) { stop.current = true; try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } return; }
    stop.current = false; setPlaying(true);
    for (const l of lines) {
      if (stop.current) break;
      await new Promise<void>((done) => {
        try {
          if (l.audio) { const a = new Audio(botAudioUrl(code, l.id)); a.onended = () => done(); a.onerror = () => done(); void a.play().catch(() => done()); }
          else if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(`${l.who} said: ${l.text}`); u.onend = () => done(); u.onerror = () => done(); window.speechSynthesis.speak(u); }
          else done();
        } catch { done(); }
      });
    }
    setPlaying(false);
  }
  return { playing, play };
}

/** The break between rounds: next round's pictures render while the table looks back at what was said. */
export function Intermission({ code, round, recap, big = false, basis }: { code: string; round: RoundView; recap: RecapLine[]; big?: boolean; basis: unknown }) {
  const it = round.intermission;
  const left = useRemaining(it?.minMs, basis);
  const [quip, setQuip] = useState(0);
  const { playing, play } = usePlayRecap(code, recap);
  useEffect(() => { setQuip(Math.floor(Math.random() * LAUNCH_QUIPS.length)); const q = setInterval(() => setQuip((n) => (n + 1) % LAUNCH_QUIPS.length), 6000); return () => clearInterval(q); }, []);
  if (!it) return null;
  const done = it.artTotal - it.artLeft, f = big ? "1.4rem" : undefined;
  return (
    <Card title="Intermission" tone="glow" data-testid="intermission" style={{ marginTop: "var(--space-3)" }}>
      <p style={{ fontSize: f, marginTop: 0 }}>Next up: <b>{it.toTitle}</b>. {it.artLeft > 0 ? "The artists are painting the next scene." : "The scene is ready."}</p>
      {it.artTotal > 0 && <Progress value={done} max={Math.max(1, it.artTotal)} label="Rendering the next round" data-testid="intermission-bar" />}
      <p className="muted" style={{ fontSize: f }} data-testid="intermission-timer">{left && left > 0 ? `Back in about ${clock(left)} at the least.` : it.artLeft > 0 ? "Just finishing the pictures..." : "Starting..."}</p>
      <p style={{ fontSize: f }} aria-live="polite"><i>{LAUNCH_QUIPS[quip]}</i></p>
      {recap.length > 0 && (
        <div data-testid="recap" style={{ marginTop: "var(--space-3)" }}>
          <p className="sc-eyebrow" style={{ margin: 0 }}>Previously, at the table</p>
          <ul className="clean" style={{ fontSize: f }}>
            {recap.map((l) => <li key={l.id}><b>{l.who}{l.bot ? " (AI)" : ""}:</b> {l.text}</li>)}
          </ul>
          <Button variant="secondary" onClick={() => void play()} data-testid="recap-play">{playing ? "Stop the recap" : "Play the recap aloud"}</Button>
        </div>
      )}
    </Card>
  );
}
