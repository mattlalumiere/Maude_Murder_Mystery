"use client";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Qr } from "@/components/Qr";
import { PRICES } from "@/lib/budget";
import { api, useRoom } from "@/lib/client";
import type { AgeGroup, BudgetState, GameConfig } from "@/lib/types";

type HostState = {
  version: number; code: string; phase: string; phaseTitle: string; clock: string; paused: boolean; title?: string;
  narration?: string; overrideUsed: boolean; ballotsIn: number; totalPlayers: number; ballotsOpen: boolean;
  runSheet: { phase: string; title: string; clock: string }[];
  players: { id: string; name: string; ageGroup: string; ready: boolean; hasDevice: boolean; ballot: boolean; characterName?: string; hasPhoto: boolean; backstory: string }[];
  clues: { id: string; text: string }[];
  reveal?: { killer?: string; scores: { name: string; points: number }[] };
  config: GameConfig; caseSource?: "sample" | "bedrock"; budget: BudgetState;
  jobs: { id: string; kind: string; phase: string; status: string; note?: string; est: number; caption: string }[];
};
const usd = (n: number) => `$${n.toFixed(2)}`;

export default function HostConsole({ code }: { code: string }) {
  const { state, error, refresh } = useRoom<HostState>(code, "host");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [oc, setOc] = useState("");
  const [np, setNp] = useState({ name: "", ageGroup: "little" as AgeGroup });
  const [handoff, setHandoff] = useState("");
  const [capInput, setCapInput] = useState<string>("");
  const working = useRef(false);

  // Media worker: while jobs are waiting, nudge the server to process one at a time (spend is capped server-side).
  const pending = !!state?.jobs.some((j) => j.status === "queued" || j.status === "polling") && !state?.budget.plan.paused;
  useEffect(() => {
    if (!pending) return;
    let stop = false;
    const tick = async () => {
      if (working.current) return;
      working.current = true;
      try { await api(`/api/rooms/${code}/media/run`, {}); await refresh(true); } catch { /* retried next tick */ }
      working.current = false;
    };
    tick();
    const t = setInterval(() => { if (!stop) tick(); }, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [pending, code, refresh]);

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
  const joinUrl = typeof location === "undefined" ? "" : `${location.origin}/join/${code}`;

  return (
    <main className="wide">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>Room code</p>
          <div className="code">{state.code}</div>
          <p className="muted">Put <a href={`/screen/${code}`} target="_blank">the big screen</a> on the TV. Share the invite link with every player below.</p>
        </div>
        <div>
          <span className="pill">{state.phaseTitle}</span> {state.paused && <span className="pill">PAUSED</span>} {state.overrideUsed && <span className="pill">override used</span>}
        </div>
      </div>
      {(err || error) && <p className="err">{err || error}</p>}

      <div className="card row">
        <div style={{ flex: 1, minWidth: 220 }}>
          <b>Invite link for players</b>
          <p style={{ wordBreak: "break-all", margin: "6px 0" }}>{joinUrl}</p>
          <CopyButton text={joinUrl} />
          <p className="muted" style={{ fontSize: ".85rem" }}>Players use this to build their character: name, backstory ideas, and an optional photo for their cartoon look-alike.</p>
        </div>
        {joinUrl && <Qr text={joinUrl} size={150} />}
      </div>

      {lobby && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Guests ({state.players.length})</h2>
          <p className="muted">Need at least 4 players, 2 adults. Toddlers and anyone without a phone: add them below and hand their adult the link.</p>
          <ul className="clean">{state.players.map((p) => (
            <li key={p.id}>{p.name} <span className="pill">{p.ageGroup}</span> {!p.hasDevice && <span className="pill">no device</span>} {p.hasPhoto && <span className="pill">photo</span>} {p.backstory !== "gm" && <span className="pill">own ideas</span>}{" "}
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
          {state.config.themePrompt && <p className="muted">Your theme prompt is used when the AI story engine is connected (Bedrock). Until then the built-in sample case is played.</p>}
          <p><button disabled={state.players.length < 4} onClick={() => act({ type: "start" })}>Cast the characters and start</button></p>
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

          <BudgetPanel code={code} state={state} act={act} capInput={capInput} setCapInput={setCapInput} />

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

function BudgetPanel({ state, act, capInput, setCapInput }: {
  code: string; state: HostState; act: (b: object) => Promise<unknown>; capInput: string; setCapInput: (v: string) => void;
}) {
  const b = state.budget;
  const used = b.spentUsd + b.reservedUsd;
  const pct = b.capUsd > 0 ? Math.min(100, (used / b.capUsd) * 100) : 0;
  const counts = state.jobs.reduce<Record<string, number>>((m, j) => ({ ...m, [j.status]: (m[j.status] ?? 0) + 1 }), {});
  const plan = b.plan;
  const setPlan = (patch: object) => act({ type: "setPlan", plan: patch });
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>AI pictures and video</h2>
      <div style={{ background: "var(--line)", borderRadius: 999, height: 10, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct > 85 ? "var(--warn)" : "var(--good)" }} />
      </div>
      <p>Spent <b>{usd(b.spentUsd)}</b>, reserved {usd(b.reservedUsd)}, budget <b>{usd(b.capUsd)}</b>. Estimates; the server never spends past the budget.</p>
      <div className="row">
        <label style={{ margin: 0 }}><input type="checkbox" checked={plan.avatars} onChange={(e) => setPlan({ avatars: e.target.checked })} />Portraits</label>
        <select style={{ width: "auto" }} value={plan.scenesPerAct} onChange={(e) => setPlan({ scenesPerAct: +e.target.value })}>
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n} scene{n === 1 ? "" : "s"} per act</option>)}
        </select>
        <select style={{ width: "auto" }} value={plan.videoClips} onChange={(e) => setPlan({ videoClips: +e.target.value })}>
          {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} video clip{n === 1 ? "" : "s"}</option>)}
        </select>
        <select style={{ width: "auto" }} value={plan.quality} onChange={(e) => setPlan({ quality: e.target.value })}>
          <option value="standard">Standard</option><option value="premium">Premium</option>
        </select>
        <button className="ghost" onClick={() => setPlan({ paused: !plan.paused })}>{plan.paused ? "Resume AI media" : "Pause AI media"}</button>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <input style={{ maxWidth: 140 }} type="number" min={0} step={1} placeholder={`Budget ${b.capUsd}`} value={capInput} onChange={(e) => setCapInput(e.target.value)} />
        <button className="ghost" disabled={capInput === ""} onClick={() => { act({ type: "setPlan", capUsd: +capInput }); setCapInput(""); }}>Change budget</button>
        <button className="ghost" onClick={() => window.confirm("Delete all uploaded player photos now? Portraits already made are kept.") && act({ type: "purgePhotos" })}>Delete player photos</button>
      </div>
      <p className="muted" style={{ fontSize: ".85rem" }}>
        Queue: {Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "empty"}. About {usd(PRICES.imageStandard)} per image and {usd(PRICES.videoSeconds * PRICES.videoPerSecond)} per clip. Over-budget jobs are skipped.
        {state.caseSource === "sample" ? " Story source: built-in sample case." : ""}
      </p>
      {state.jobs.filter((j) => j.status === "failed" || j.status === "skipped").slice(-4).map((j) => (
        <p key={j.id} className="muted" style={{ fontSize: ".85rem", margin: 0 }}>{j.kind} ({j.phase}) {j.status}: {j.note}</p>
      ))}
    </div>
  );
}
