"use client";
import { use } from "react";
import { Avatar, MediaView } from "@/components/Media";
import { Qr } from "@/components/Qr";
import { useRoom } from "@/lib/client";

type S = {
  version: number; code: string; phase: string; phaseTitle: string; paused: boolean; narration?: string; title?: string; setting?: string;
  lobbyNames: string[]; clues: { id: string; round: number; text: string }[];
  roster: { playerName: string; characterName: string; house: string; tease: string; avatarId?: string }[];
  partyName: string; media: { id: string; kind: string; phase: string; caption: string; mime?: string }[];
  ballotsIn: number; totalPlayers: number; ballotsOpen: boolean;
  reveal?: { killer?: string; method?: string; motive?: string; story: string; scores: { name: string; points: number }[]; awards: { award: string; to: string }[] };
};

export default function Screen({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const { state, error } = useRoom<S>(code, "screen");
  if (!state) return <main className="wide big"><p>{error || "Loading..."}</p></main>;
  const houses = [...new Set(state.roster.map((r) => r.house))];
  const scenes = state.media.filter((m) => m.kind !== "avatar");
  const hero = [...scenes].reverse().find((m) => m.phase === state.phase) ?? scenes[scenes.length - 1];

  return (
    <main className="wide big">
      {state.phase === "lobby" ? (
        <>
          <h1>{state.partyName}</h1>
          <p>Scan to build your character, or go to {typeof location !== "undefined" ? location.host : ""}/join/{state.code}</p>
          {typeof location !== "undefined" && <Qr text={`${location.origin}/join/${state.code}`} size={260} />}
          <div className="code">{state.code}</div>
          <p>{state.lobbyNames.join(" · ") || "Waiting for guests..."}</p>
        </>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>{state.partyName} · Room {state.code} {state.paused && "· PAUSED"}</p>
          <h1>{state.phaseTitle}</h1>
          {state.narration && <p>{state.narration}</p>}
          {state.ballotsOpen && <p>Accusations in: {state.ballotsIn} / {state.totalPlayers}</p>}

          {state.reveal && (
            <div className="card">
              <h1>It was {state.reveal.killer}!</h1>
              <p><b>How:</b> {state.reveal.method}</p><p><b>Why:</b> {state.reveal.motive}</p><p>{state.reveal.story}</p>
              <div className="grid">
                <div><h2>Scores</h2><ul className="clean">{state.reveal.scores.slice(0, 8).map((s) => <li key={s.name}>{s.name}: <b>{s.points}</b></li>)}</ul></div>
                <div><h2>Awards</h2><ul className="clean">{state.reveal.awards.map((a, i) => <li key={i}>🏆 {a.award}: <b>{a.to}</b></li>)}</ul></div>
              </div>
            </div>
          )}

          {hero && (
            <div className="card"><MediaView code={code} m={hero} /></div>
          )}

          {state.clues.length > 0 && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Clues</h2>
              <ul className="clean">{state.clues.map((c) => <li className="clue" key={c.id}>{c.text}</li>)}</ul>
            </div>
          )}

          <h2>The cast</h2>
          <div className="grid">
            {houses.map((h) => (
              <div className="card" key={h}>
                <b>{h}</b>
                <ul className="clean">{state.roster.filter((r) => r.house === h).map((r) => (
                  <li key={r.characterName} className="row"><Avatar code={code} id={r.avatarId} size={48} alt={r.characterName} /><span>{r.characterName}<br /><span className="muted">played by {r.playerName}</span></span></li>
                ))}</ul>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
