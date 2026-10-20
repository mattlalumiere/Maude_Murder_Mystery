"use client";
import { useState } from "react";
import { api, useRoom } from "@/lib/client";
import type { AgeGroup } from "@/lib/types";

type HostState = {
  version: number; code: string; phase: string; phaseTitle: string; clock: string; paused: boolean; title?: string;
  narration?: string; overrideUsed: boolean; ballotsIn: number; totalPlayers: number; ballotsOpen: boolean;
  runSheet: { phase: string; title: string; clock: string }[];
  players: { id: string; name: string; ageGroup: string; ready: boolean; hasDevice: boolean; ballot: boolean; characterName?: string }[];
  clues: { id: string; text: string }[];
  reveal?: { killer?: string; scores: { name: string; points: number }[] };
};

export default function HostConsole({ code }: { code: string }) {
  const { state, error, refresh } = useRoom<HostState>(code, "host");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [oc, setOc] = useState("");
  const [theme, setTheme] = useState("");
  const [np, setNp] = useState({ name: "", ageGroup: "little" as AgeGroup });
  const [handoff, setHandoff] = useState("");

  async function act(body: object) {
    setErr(""); setMsg("");
    try { const r = await api<Record<string, unknown>>(`/api/rooms/${code}/action`, body); await refresh(true); return r; }
    catch (e) { setErr((e as Error).message); await refresh(true); }
  }
  async function override(cmd: string, confirm = false) {
    const r = await act({ type: "override", code: oc, cmd, confirm }) as { message?: string; needsConfirm?: boolean } | undefined;
    if (r?.message) setMsg(r.message);
    if (r?.needsConfirm && window.confirm(r.message)) await override(cmd, true);
  }
  async function add() {
    const r = await act({ type: "addPlayer", ...np }) as { playerId?: string; token?: string } | undefined;
    if (r?.playerId) setHandoff(`${location.origin}/play/${code}?pid=${r.playerId}&tok=${r.token}`);
    setNp({ ...np, name: "" });
  }

  if (!state) return <main><p className="muted">{error || "Loading..."}</p></main>;
  const lobby = state.phase === "lobby";
  const joinUrl = typeof location === "undefined" ? "" : `${location.origin}/play/${code}`;

  return (
    <main className="wide">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>Room code</p>
          <div className="code">{state.code}</div>
          <p className="muted">Guests open <b>{joinUrl}</b> or enter the code on the home page. Put <a href={`/screen/${code}`} target="_blank">the big screen</a> on the TV.</p>
        </div>
        <div>
          <span className="pill">{state.phaseTitle}</span> {state.paused && <span className="pill">PAUSED</span>} {state.overrideUsed && <span className="pill">override used</span>}
        </div>
      </div>
      {(err || error) && <p className="err">{err || error}</p>}

      {lobby && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Guests ({state.players.length})</h2>
          <p className="muted">Need at least 4 players, 2 adults. Toddlers and anyone without a phone: add them below and hand their adult the link.</p>
          <ul className="clean">{state.players.map((p) => (
            <li key={p.id}>{p.name} <span className="pill">{p.ageGroup}</span> {!p.hasDevice && <span className="pill">no device</span>}{" "}
              <button className="ghost" onClick={() => act({ type: "kick", playerId: p.id })}>remove</button></li>
          ))}</ul>
          <div className="row" style={{ marginTop: 12 }}>
            <input style={{ maxWidth: 220 }} placeholder="Add player w/o phone" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
            <select style={{ maxWidth: 160 }} value={np.ageGroup} onChange={(e) => setNp({ ...np, ageGroup: e.target.value as AgeGroup })}>
              <option value="little">1-5</option><option value="kid">6-12</option><option value="teen">13-15</option><option value="adult">Adult</option>
            </select>
            <button className="ghost" disabled={!np.name.trim()} onClick={add}>Add</button>
          </div>
          {handoff && <p className="muted">Give this link to their handler (it contains their private token): <br /><code style={{ wordBreak: "break-all" }}>{handoff}</code></p>}
          <label htmlFor="theme">Theme (optional, used when Bedrock is on)</label>
          <input id="theme" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="surprise me" />
          <p><button disabled={state.players.length < 4} onClick={() => act({ type: "start", theme: theme || undefined })}>Cast the characters and start</button></p>
        </div>
      )}

      {!lobby && (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>{state.phaseTitle}</h2>
            {state.narration && <p>{state.narration}</p>}
            <div className="row">
              <button disabled={state.phase === "reveal" || state.paused} onClick={() => act({ type: "advance" })}>Next: {nextTitle(state)}</button>
              <button className="ghost" onClick={() => act({ type: state.paused ? "resume" : "pause" })}>{state.paused ? "Resume" : "Pause"}</button>
              {state.ballotsOpen && <span className="pill">Ballots in: {state.ballotsIn}/{state.totalPlayers}</span>}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Cast</h2>
            <div className="grid">{state.players.map((p) => (
              <div key={p.id}><b>{p.characterName}</b><br /><span className="muted">{p.name}{p.ready ? " ✓ ready" : ""}{p.ballot ? " 🗳" : ""}</span></div>
            ))}</div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Run sheet</h2>
            <ul className="clean">{state.runSheet.filter((r) => r.phase !== "lobby").map((r) => (
              <li key={r.phase} style={{ fontWeight: r.phase === state.phase ? 700 : 400 }}>{r.clock} &nbsp; {r.title}</li>
            ))}</ul>
            <p className="muted">Running long? Use your override code below to ACCELERATE.</p>
          </div>

          <div className="card secret">
            <h2 style={{ marginTop: 0 }}>Host Override</h2>
            <p className="muted">Type your code privately. Using any override takes you out of the Detective award.</p>
            <input type="password" autoComplete="off" placeholder="Override code" value={oc} onChange={(e) => setOc(e.target.value)} />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="ghost" disabled={!oc} onClick={() => override("NUDGE")}>Nudge</button>
              <button className="ghost" disabled={!oc} onClick={() => override("ADVANCED")}>Advanced clue</button>
              <button className="ghost" disabled={!oc} onClick={() => override("ACCELERATE")}>Accelerate</button>
              <button className="ghost" disabled={!oc} onClick={() => override("FINAL")}>Final answer (private)</button>
              <button className="ghost" disabled={!oc} onClick={() => override("FINAL_REVEAL")}>Jump to Reveal</button>
            </div>
            {msg && <p style={{ whiteSpace: "pre-wrap" }}><b>{msg}</b></p>}
          </div>
        </>
      )}
    </main>
  );
}

function nextTitle(s: HostState) {
  const i = s.runSheet.findIndex((r) => r.phase === s.phase);
  return s.runSheet[i + 1]?.title ?? "the end";
}
