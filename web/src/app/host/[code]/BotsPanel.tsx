"use client";
import { useState } from "react";
import type { HostState } from "@/app/_views";
import { Badge, Button, Card, Field } from "@/components/kit";

/** Host controls for AI guests: add them to the lobby, and switch their chatter and voices during the game. */
export function BotsPanel({ state, act, busy }: { state: HostState; act: (b: object) => Promise<unknown>; busy: boolean }) {
  const [count, setCount] = useState(2);
  const lobby = state.phase === "lobby";
  const bots = state.players.filter((p) => p.isBot);
  return (
    <Card title="AI guests" data-testid="host-bots" style={{ marginTop: "var(--space-3)" }}>
      <p className="muted" style={{ marginTop: 0 }}>
        AI guests are extra suspects who chat with players and speak aloud. They count toward the minimum players and never see anyone else&apos;s secrets.
        Voice: <Badge tone="ghost">{state.speech === "server" ? "cloud voices" : "browser voices (free)"}</Badge>
      </p>
      {lobby && (
        <div className="sc-actions">
          <Field label="How many">
            <select value={count} data-testid="host-bot-count" onChange={(e) => setCount(+e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Button variant="secondary" disabled={busy || bots.length >= 8} onClick={() => act({ type: "addBots", count })} data-testid="host-add-bots">Add AI guests</Button>
        </div>
      )}
      {bots.length > 0 && (
        <ul className="clean" data-testid="host-bot-list">
          {bots.map((b) => (
            <li key={b.id}>{b.name} {b.characterName ? <span className="muted">as {b.characterName}</span> : null}{" "}
              {lobby && <Button variant="ghost" disabled={busy} onClick={() => act({ type: "kick", playerId: b.id })}>remove</Button>}
            </li>
          ))}
        </ul>
      )}
      {bots.length > 0 && (
        <div className="sc-actions">
          <Button variant="secondary" onClick={() => act({ type: "setBotConfig", chatter: !state.botConfig.chatter })} data-testid="host-bot-chatter">
            {state.botConfig.chatter ? "Mute story-beat chatter" : "Turn chatter on"}
          </Button>
          <Button variant="secondary" onClick={() => act({ type: "setBotConfig", voice: !state.botConfig.voice })} data-testid="host-bot-voice">
            {state.botConfig.voice ? "Turn cloud voices off" : "Turn cloud voices on"}
          </Button>
        </div>
      )}
    </Card>
  );
}
