"use client";
import type { HostState } from "@/app/_views";
import { Badge, Button, Card, Notice } from "@/components/kit";

/** Host view of the heavy drinking night: who is where against their limit, plus the stop and pause controls. */
export function DrinkPanel({ state, act, busy }: { state: HostState; act: (b: object) => Promise<unknown>; busy: boolean }) {
  const d = state.drinks;
  if (state.drinking !== "heavy" || !d) return null;
  const ctl = (op: string) => act({ type: "drinkControl", op });
  return (
    <Card title="Heavy drinking night" data-testid="host-drinks" style={{ marginTop: "var(--space-3)" }}>
      <p className="muted" style={{ marginTop: 0 }}>Self-reported tallies, private to the host. The game stops prompting each person at their own limit.</p>
      {d.stopped ? <Notice>Drinking is stopped for tonight.</Notice> : d.paused ? <Notice>Drinking is paused.</Notice> : null}
      {d.players.length === 0 ? <p className="muted">No grown-up has joined the drinking game yet.</p> : (
        <ul className="clean" data-testid="host-drink-list">
          {d.players.map((p) => (
            <li key={p.id}>{p.name}{" "}
              {p.mode === "in" ? <Badge tone={p.done ? "blood" : "ghost"}>{p.units} of {p.limit}{p.done ? ", done" : ""}</Badge> : <Badge tone="ghost">mocktails</Badge>}
              <span className="muted"> water {p.water}</span></li>
          ))}
        </ul>
      )}
      <div className="sc-actions">
        <Button variant="secondary" disabled={busy || d.stopped} onClick={() => ctl("water")} data-testid="host-drink-water">Water round now</Button>
        <Button variant="secondary" disabled={busy || d.stopped} onClick={() => ctl(d.paused ? "resume" : "pause")} data-testid="host-drink-pause">{d.paused ? "Resume drinking" : "Pause drinking"}</Button>
        <Button variant="ghost" disabled={busy || d.stopped} onClick={() => { if (window.confirm("Stop all drinking prompts for tonight? This cannot be undone.")) void ctl("stop"); }} data-testid="host-drink-stop">Stop drinking for tonight</Button>
      </div>
      <p className="muted" style={{ fontSize: "var(--text-xs)", marginBottom: 0 }}>Before the first toast: has everyone arranged a ride, and is there food out?</p>
    </Card>
  );
}
