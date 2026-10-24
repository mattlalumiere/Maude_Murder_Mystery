"use client";
import { useEffect, useRef, useState } from "react";
import type { LaunchView } from "@/lib/launch";
import { LAUNCH_QUIPS } from "@/lib/quips";
import { Card, Progress } from "@/components/kit";

const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };

/**
 * The launch status for guests and the host: a progress bar, the steps, and a rotating joke so the wait is fun.
 * `launch` is the server's view; between polls the elapsed time keeps counting locally.
 */
export function LaunchProgress({ launch, big = false, title = "Setting the stage" }: { launch: LaunchView | null | undefined; big?: boolean; title?: string }) {
  const [tick, setTick] = useState(0);
  const [quip, setQuip] = useState(0);
  const started = useRef<number>(0);
  useEffect(() => { started.current = Date.now(); }, [launch?.elapsedMs]);
  useEffect(() => { setQuip(Math.floor(Math.random() * LAUNCH_QUIPS.length)); }, []);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    const q = setInterval(() => setQuip((n) => (n + 1) % LAUNCH_QUIPS.length), 7000);
    return () => { clearInterval(t); clearInterval(q); };
  }, []);
  void tick;
  if (!launch) return null;
  const elapsed = launch.elapsedMs === null ? null : launch.elapsedMs + (Date.now() - started.current);
  const f = big ? "1.3rem" : undefined;
  return (
    <Card title={launch.done ? "Everything is ready" : title} tone={launch.done ? undefined : "glow"} data-testid="launch-progress" style={{ marginTop: "var(--space-3)" }}>
      <Progress value={launch.percent} max={100} label="Launch progress" data-testid="launch-bar" />
      <ol className="clean" style={{ fontSize: f, margin: "var(--space-3) 0" }} aria-live="polite">
        {launch.steps.map((s) => (
          <li key={s.id} data-state={s.state} style={{ opacity: s.state === "pending" ? 0.55 : 1 }}>
            <span aria-hidden="true">{s.state === "done" ? "✓" : s.state === "active" ? "…" : "·"}</span>{" "}
            <b>{s.label}</b>
            {s.id === "story" && s.state === "active" && elapsed !== null ? <span className="muted"> {fmt(elapsed)} so far</span> : null}
            {s.detail ? <span className="muted"> {s.detail}</span> : null}
          </li>
        ))}
      </ol>
      {!launch.done && <p className="muted" style={{ fontSize: f, margin: 0 }} data-testid="launch-quip">{LAUNCH_QUIPS[quip]}</p>}
      {launch.done && <p style={{ fontSize: f, margin: 0 }}>Open your secret card when you are ready. Nobody peek.</p>}
    </Card>
  );
}
