"use client";
import { useState } from "react";
import { Lineup } from "./Lineup";
import { PhotoSection } from "./PhotoSection";
import { SealedCard } from "./Envelope";
import type { PlayerState } from "@/app/_views";
import { MediaView } from "@/components/Media";
import { RulesCard } from "@/components/RulesCard";
import { DrinkTracker } from "@/components/DrinkUi";
import { LaunchProgress } from "@/components/LaunchProgress";
import { StoryVote } from "@/components/StoryVote";
import { TalkToGuests } from "@/components/TalkToGuests";
import { TableTalk } from "@/components/TableTalk";
import { Notebook } from "@/components/Notebook";
import { SelfieBooth } from "@/components/SelfieBooth";
import { Badge, Candle, Card, ConnectionCandle, ErrorNote, Fog, PaperClue, Skeleton } from "@/components/kit";
import { credHeaders, friendlyError, plainText, sendAction, tilt, useDocTitle, useRoom, type BallotDraft, type Creds } from "@/lib/client";

export function Game({ code, creds }: { code: string; creds: Creds }) {
  const headers = credHeaders(creds);
  const { state, error, status, refresh } = useRoom<PlayerState>(code, "player", headers);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useDocTitle(state ? `${state.phaseTitle} - Room ${code}` : `Room ${code}`);

  async function act(body: object) {
    setErr(""); setBusy(true);
    try { await sendAction(code, body, headers); await refresh(true); } catch (e) { setErr(friendlyError((e as Error).message)); }
    finally { setBusy(false); }
  }

  if (!state) {
    return (
      <main className="sc-page" data-testid="player-loading">
        <ConnectionCandle status={status} />
        {status === "failed" && <ErrorNote data-testid="player-error">{error}</ErrorNote>}
        <Skeleton lines={4} label="Opening the case file" />
      </main>
    );
  }
  const { me } = state;
  const ch = me.character;
  const inLobby = state.phase === "lobby";
  const cardsPhase = state.phase === "cards";
  const scenes = state.media.filter((m) => m.kind !== "avatar").slice(-3).reverse();

  return (
    <main className="sc-page" data-testid="player-screen" data-phase={state.phase}>
      <ConnectionCandle status={status} />
      <p className="sc-eyebrow">Room {code} <span className="muted">{plainText(me.name)}</span></p>
      <h1 data-testid="player-phase">{state.phaseTitle}</h1>
      {state.paused && <Badge tone="blood" data-testid="player-paused">Paused. Take a breath.</Badge>}
      {state.narration && <p data-testid="player-narration">{plainText(state.narration)}</p>}
      {(err || (error && state)) && <ErrorNote data-testid="player-error">{err || error}</ErrorNote>}

      {inLobby && (
        <Card title="Waiting for the host" data-testid="player-lobby" style={{ position: "relative", overflow: "hidden" }}>
          <Fog opacity={0.15} />
          <div style={{ position: "relative" }}>
            <p><Candle scale={0.8} /></p>
            <p className="muted">The party starts soon. Guests so far:</p>
            <ul className="sc-chips" aria-label="Guests so far">{state.lobbyNames.map((n, i) => <li key={`${n}-${i}`}>{plainText(n)}</li>)}</ul>
          </div>
        </Card>
      )}

      {(inLobby || cardsPhase) && state.launch && <LaunchProgress launch={state.launch} title={inLobby ? "The host has started the game" : "Setting the stage"} />}

      {(cardsPhase || state.phase === "act1") && <RulesCard drinking={state.drinking} />}

      {me.drink && !inLobby && <DrinkTracker me={me.drink} drink={state.drink} act={act} busy={busy} />}

      {ch && !inLobby && (
        <SealedCard code={code} avatarId={me.avatarId} ch={ch} canReady={cardsPhase} ready={me.ready} busy={busy} onReady={() => act({ type: "ready" })} />
      )}

      {ch && !inLobby && (
        <Notebook code={code} creds={creds} playerId={me.id} initial={me.notes ?? ""} headings={ch.card.opening?.notes ?? []} />
      )}

      {!inLobby && !cardsPhase && (
        <TableTalk code={code} creds={creds} meId={me.id} chat={state.chat ?? []} bots={state.bots} adult={me.ageGroup === "adult"} stt={state.stt ?? "browser"} voiceReplies={state.botConfig.voice} />
      )}

      {!inLobby && !cardsPhase && state.bots.length > 0 && (
        <details className="sc-panel" data-testid="private-ask" style={{ marginTop: "var(--space-3)" }}>
          <summary>Ask a guest privately</summary>
          <div className="sc-panel__body">
            <TalkToGuests code={code} creds={creds} bots={state.bots} log={state.botLog} adult={me.ageGroup === "adult"} voiceReplies={state.botConfig.voice} stt={state.stt} />
          </div>
        </details>
      )}

      {!inLobby && (
        <SelfieBooth code={code} creds={creds} adult={me.ageGroup === "adult"} ok={me.selfieOk !== false} mine={me.selfies ?? []} wall={state.selfies ?? []} refresh={refresh} />
      )}

      {state.reveal && state.storyId && <StoryVote code={code} storyId={state.storyId} creds={creds} />}

      {scenes.map((m) => <Card key={m.id} style={{ marginTop: "var(--space-3)" }}><MediaView code={code} m={m} /></Card>)}

      {state.clues.length > 0 && (
        <section aria-labelledby="clues-h" data-testid="clues" style={{ marginTop: "var(--space-5)" }}>
          <h2 id="clues-h">Evidence board</h2>
          <div className="sc-clues">
            {state.clues.map((c, i) => (
              <div key={c.id} data-testid="clue">
                <PaperClue title={plainText(c.text)} label={`Exhibit ${String.fromCharCode(65 + (i % 26))}`} tilt={tilt(c.id)} animateIn={i === state.clues.length - 1} />
              </div>
            ))}
          </div>
        </section>
      )}

      {state.ballotsOpen && state.ballotOptions && (
        <div style={{ marginTop: "var(--space-5)" }}>
          <Lineup options={state.ballotOptions} initial={me.ballot as BallotDraft | undefined} submitted={!!me.ballot} busy={busy} onSubmit={(b) => act({ type: "ballot", ballot: b })} />
        </div>
      )}

      {state.reveal && (
        <Card tone="glow" style={{ marginTop: "var(--space-5)" }} data-testid="reveal">
          <p className="sc-eyebrow">The mystery is solved</p>
          <p className="sc-reveal-name" data-testid="reveal-killer">It was {plainText(state.reveal.killer ?? "")}!</p>
          <p><b>How:</b> {plainText(state.reveal.method ?? "")}</p>
          <p><b>Why:</b> {plainText(state.reveal.motive ?? "")}</p>
          <p>{plainText(state.reveal.story)}</p>
          <h2>Scores</h2>
          <ol className="sc-list" data-testid="reveal-scores">{state.reveal.scores.map((s) => <li key={s.name}><span className="sc-grow">{plainText(s.name)}</span><b>{s.points}</b><span className="muted">{plainText(s.detail)}</span></li>)}</ol>
          <h2>Awards</h2>
          <ul className="sc-list">{state.reveal.awards.map((a, i) => <li key={i}><span className="sc-grow">{plainText(a.award)}</span><b>{plainText(a.to)}</b></li>)}</ul>
        </Card>
      )}

      {(inLobby || cardsPhase) && (
        <details className="sc-panel" data-testid="photo-panel" style={{ marginTop: "var(--space-5)" }}>
          <summary>Add or change my cartoon photo</summary>
          <div className="sc-panel__body"><PhotoSection code={code} creds={creds} hasPhoto={me.profile.hasPhoto} adult={me.ageGroup === "adult"} refresh={refresh} /></div>
        </details>
      )}
    </main>
  );
}
