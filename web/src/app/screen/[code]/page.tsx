"use client";
import { RulesCard } from "@/components/RulesCard";
import { use } from "react";
import type { ScreenState } from "@/app/_views";
import { Avatar, MediaView } from "@/components/Media";
import { BotChatter } from "@/components/BotChatter";
import { Qr } from "@/components/Qr";
import { Badge, Candle, ConnectionCandle, ErrorNote, Fog, PaperClue, Skeleton } from "@/components/kit";
import { groupByHouse, hostName, normalizeCode, originUrl, plainText, tilt, useDocTitle, useRoom, useTvSurface } from "@/lib/client";

export default function Screen({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode(use(params).code);
  const { state, error, status } = useRoom<ScreenState>(code, "screen");
  useTvSurface();
  useDocTitle(`Big screen ${code}`);

  if (!state) {
    return (
      <main className="sc-tv" data-testid="tv-loading">
        <ConnectionCandle status={status} />
        <Fog />
        <div><Skeleton lines={2} label="Lighting the candles" />{status === "failed" && <ErrorNote>{error}</ErrorNote>}</div>
      </main>
    );
  }

  const lobby = state.phase === "lobby";
  const joinUrl = `${originUrl()}/join/${state.code}`;
  const scenes = state.media.filter((m) => m.kind !== "avatar");
  const hero = [...scenes].reverse().find((m) => m.phase === state.phase) ?? scenes[scenes.length - 1];
  const recent = state.clues.slice(-4);

  if (lobby) {
    return (
      <main className="sc-tv" data-testid="tv-lobby">
        <ConnectionCandle status={status} />
        <Fog opacity={0.18} />
        <div className="sc-tv-top"><strong>{plainText(state.partyName)}</strong><span><Candle scale={1} /></span></div>
        <div className="sc-tv-lobby">
          <div>
            <h1 className="sc-tv-title">Join the mystery</h1>
            <p className="sc-tv-narr">Scan the picture with your phone camera, or visit</p>
            <p className="sc-tv-url" data-testid="tv-url">{hostName()}/join/{state.code}</p>
            <p className="sc-tv-code" data-testid="tv-code" aria-label={`Room code ${state.code.split("").join(" ")}`}>{state.code}</p>
          </div>
          <Qr text={joinUrl} size={380} className="sc-tv-qr" testId="tv-qr" />
        </div>
        <section aria-label="Guests who have arrived" data-testid="tv-guests">
          <ul className="sc-tv-names">{state.lobbyNames.map((n, i) => <li key={`${n}-${i}`}>{plainText(n)}</li>)}</ul>
          {state.lobbyNames.length === 0 && <p className="sc-tv-url">Waiting for the first guest...</p>}
        </section>
      </main>
    );
  }

  const houses = groupByHouse(state.roster);
  return (
    <main className="sc-tv" data-testid="tv-game" data-phase={state.phase}>
      <ConnectionCandle status={status} />
      <Fog opacity={0.14} />
      <div className="sc-tv-top">
        <strong>{plainText(state.partyName)}</strong>
        <span>Room {state.code} {state.paused && <Badge tone="blood" data-testid="tv-paused">Paused</Badge>}</span>
      </div>

      <div className="sc-tv-main">
        <div>
          <h1 className="sc-tv-title" data-testid="tv-phase">{state.phaseTitle}</h1>
          {state.narration && <p className="sc-tv-narr" data-testid="tv-narration">{plainText(state.narration)}</p>}
          {(state.phase === "cards" || state.phase === "act1") && <RulesCard drinking={state.drinking} big />}
          {state.ballotsOpen && <p className="sc-tv-votes" data-testid="tv-ballots" role="status">Accusations in: {state.ballotsIn} of {state.totalPlayers}</p>}
          <BotChatter code={code} lines={state.botLog} bots={state.bots} big />
          {hero && !state.reveal && <div className="sc-tv-hero" style={{ marginTop: "var(--space-4)" }}><MediaView code={code} m={hero} /></div>}
        </div>

        {state.reveal ? (
          <div className="sc-tv-reveal" data-testid="tv-reveal">
            <p className="sc-reveal-name" style={{ fontSize: "clamp(3rem,5vw,5rem)" }}>It was {plainText(state.reveal.killer ?? "")}!</p>
            <p className="sc-tv-narr"><b>How:</b> {plainText(state.reveal.method ?? "")}<br /><b>Why:</b> {plainText(state.reveal.motive ?? "")}</p>
            <h2>Scores</h2>
            <ol className="sc-list">{state.reveal.scores.slice(0, 6).map((s) => <li key={s.name}><span className="sc-grow">{plainText(s.name)}</span><b>{s.points}</b></li>)}</ol>
            <h2>Awards</h2>
            <ul className="sc-list">{state.reveal.awards.slice(0, 5).map((a, i) => <li key={i}><span className="sc-grow">{plainText(a.award)}</span><b>{plainText(a.to)}</b></li>)}</ul>
          </div>
        ) : (
          <section className="sc-tv-clues" aria-label="Clues" data-testid="tv-clues">
            {recent.map((c, i) => <PaperClue key={c.id} title={plainText(c.text)} label={`Exhibit ${String.fromCharCode(65 + ((state.clues.length - recent.length + i) % 26))}`} tilt={tilt(c.id)} animateIn={i === recent.length - 1} />)}
          </section>
        )}
      </div>

      <section aria-label="The cast" data-testid="tv-cast">
        <ul className="sc-tv-cast">
          {houses.flatMap((h) => h.members).slice(0, 12).map((r) => (
            <li key={r.characterName}><Avatar code={code} id={r.avatarId} size={64} alt={r.characterName} /><span>{plainText(r.characterName)}<small>{plainText(r.playerName)}</small></span></li>
          ))}
        </ul>
      </section>
    </main>
  );
}
