"use client";
import { useEffect, useRef, useState } from "react";
import { BudgetPanel } from "./BudgetPanel";
import type { HostState } from "@/app/_views";
import { CopyButton } from "@/components/CopyButton";
import { Qr } from "@/components/Qr";
import { Badge, Button, Card, ConnectionCandle, ErrorNote, Field, Notice, Skeleton } from "@/components/kit";
import { askConfirm, friendlyError, nextPhaseTitle, originUrl, phaseIndex, runGenerate, runMedia, sendAction, useDocTitle, useRoom } from "@/lib/client";
import type { AgeGroup } from "@/lib/types";

export default function HostConsole({ code }: { code: string }) {
  const { state, error, status, refresh } = useRoom<HostState>(code, "host");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [oc, setOc] = useState("");
  const [np, setNp] = useState({ name: "", ageGroup: "little" as AgeGroup });
  const [handoff, setHandoff] = useState("");
  const [capInput, setCapInput] = useState("");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  useDocTitle(`Host ${code}`);

  // Media worker: while jobs are waiting, nudge the server to process one at a time (spend is capped server-side).
  const pending = !!state?.jobs.some((j) => j.status === "queued" || j.status === "polling") && !state?.budget.plan.paused;
  useEffect(() => {
    if (!pending) return;
    let stop = false;
    const tick = async () => {
      if (working.current) return;
      working.current = true;
      try { await runMedia(code); await refresh(true); } catch { /* retried next tick */ }
      working.current = false;
    };
    tick();
    const t = setInterval(() => { if (!stop) tick(); }, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [pending, code, refresh]);

  // Start is two steps: the server claims the room (fast), then this tab asks it to write the mystery (slow, up to ~50 s).
  const genRef = useRef<number | null>(null);
  useEffect(() => {
    const g = state?.generating ?? null;
    if (!g || genRef.current === g) return;
    genRef.current = g;
    (async () => {
      try { await runGenerate(code); } catch (e) { setErr(friendlyError((e as Error).message)); }
      await refresh(true);
    })();
  }, [state?.generating, code, refresh]);

  async function act(body: object) {
    setErr(""); setMsg(""); setBusy(true);
    try { const r = await sendAction(code, body); await refresh(true); return r; }
    catch (e) { setErr(friendlyError((e as Error).message)); await refresh(true); }
    finally { setBusy(false); }
  }
  async function override(cmd: string, confirm = false) {
    const r = await act({ type: "override", code: oc, cmd, confirm }) as { message?: string; needsConfirm?: boolean } | undefined;
    if (r?.message) setMsg(r.message);
    if (r?.needsConfirm && askConfirm(r.message ?? "Are you sure?")) await override(cmd, true);
  }
  async function add() {
    const r = await act({ type: "addPlayer", ...np }) as { playerId?: string; token?: string } | undefined;
    if (r?.playerId) setHandoff(`${originUrl()}/play/${code}?pid=${r.playerId}&tok=${r.token}`);
    setNp({ ...np, name: "" });
  }

  if (!state) {
    return (
      <main className="sc-page" data-testid="host-console">
        <ConnectionCandle status={status} />
        {status === "failed" ? <ErrorNote>{error}</ErrorNote> : null}
        <Skeleton lines={4} label="Loading your game" />
      </main>
    );
  }
  const lobby = state.phase === "lobby";
  const joinUrl = `${originUrl()}/join/${code}`;
  const last = state.phase === "reveal";
  const notice = state.aiDegraded
    ? "The storyteller AI is resting, so this game is using the sample case. Everything still works."
    : state.caseSource === "sample" ? "Playing the built-in sample case." : "";
  const idx = phaseIndex(state.runSheet, state.phase);

  return (
    <main className="wide sc-page" data-testid="host-console">
      <ConnectionCandle status={status} />
      <div className="sc-host-head">
        <div>
          <p className="sc-eyebrow">Room code</p>
          <p className="sc-code" data-testid="host-room-code" aria-label={`Room code ${state.code.split("").join(" ")}`}>{state.code}</p>
        </div>
        <div className="sc-actions" style={{ flex: "0 1 auto" }}>
          <Badge tone="gold" data-testid="host-phase">{state.phaseTitle}</Badge>
          {state.paused && <Badge tone="blood" data-testid="host-paused">Paused</Badge>}
          {state.overrideUsed && <Badge>Override used</Badge>}
        </div>
      </div>
      {notice && <Notice data-testid="host-ai-notice">{notice}</Notice>}
      {(err || error) && <ErrorNote data-testid="host-error">{err || error}</ErrorNote>}

      <Card title={lobby ? "Gather the guests" : state.phaseTitle} tone="glow" style={{ marginTop: "var(--space-3)" }} data-testid="host-main-card">
        {!lobby && state.narration && <p>{state.narration}</p>}
        {lobby ? (
          <>
            <p className="muted">Needs at least 4 players and 2 grown-ups. {state.players.length} so far.</p>
            {state.generating && Date.now() - state.generating < 80_000 ? (
              <Notice data-testid="host-writing">The Game Master is writing your mystery and casting everyone. This can take up to a minute. Keep this tab open.</Notice>
            ) : (
              <Button size="lg" block loading={busy} disabled={state.players.length < 4} onClick={() => act({ type: "start" })} data-testid="host-start">
                {state.generating ? "That took too long. Start again" : "Cast the characters and start"}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button size="lg" block loading={busy} disabled={last || state.paused} onClick={() => act({ type: "advance" })} data-testid="host-advance">
              {last ? "The mystery is solved" : `Next: ${nextPhaseTitle(state.runSheet, state.phase)}`}
            </Button>
            <div className="sc-actions" style={{ marginTop: "var(--space-3)" }}>
              <Button variant="secondary" onClick={() => act({ type: state.paused ? "resume" : "pause" })} data-testid="host-pause">{state.paused ? "Resume" : "Pause"}</Button>
              {state.ballotsOpen && <Badge tone="ghost" data-testid="host-ballots">Accusations in: {state.ballotsIn} of {state.totalPlayers}</Badge>}
            </div>
          </>
        )}
      </Card>

      <Card title="Invite players" style={{ marginTop: "var(--space-3)" }} data-testid="host-invite">
        <div className="sc-invite">
          <div>
            <p className="sc-invite__url" data-testid="host-invite-url">{joinUrl}</p>
            <div className="sc-actions">
              <CopyButton text={joinUrl} testId="host-copy-invite" />
              <a className="mm-btn mm-btn--ghost" href={`/screen/${code}`} target="_blank" rel="noreferrer" data-testid="host-open-screen">Open big screen</a>
            </div>
          </div>
          {joinUrl && <Qr text={joinUrl} size={140} testId="host-qr" />}
        </div>
      </Card>

      {lobby && (
        <Card title={`Guests (${state.players.length})`} style={{ marginTop: "var(--space-3)" }} data-testid="host-guests">
          {state.players.length === 0 && <p className="muted">Nobody yet. Share the link or the QR code.</p>}
          <ul className="sc-list">
            {state.players.map((p) => (
              <li key={p.id} data-testid="host-guest">
                <span className="sc-grow">{p.name}</span>
                <Badge>{p.ageGroup}</Badge>
                {!p.hasDevice && <Badge>no phone</Badge>}
                {p.hasPhoto && <Badge tone="ghost">photo</Badge>}
                {p.backstory !== "gm" && <Badge tone="gold">own ideas</Badge>}
                <Button variant="ghost" aria-label={`Remove ${p.name}`} onClick={() => act({ type: "kick", playerId: p.id })} data-testid="host-remove">Remove</Button>
              </li>
            ))}
          </ul>
          <details className="sc-panel" style={{ marginTop: "var(--space-3)" }}>
            <summary>Add someone without a phone</summary>
            <div className="sc-panel__body">
              <Field label="Name"><input value={np.name} maxLength={24} data-testid="host-add-name" onChange={(e) => setNp({ ...np, name: e.target.value })} /></Field>
              <Field label="Age">
                <select value={np.ageGroup} data-testid="host-add-age" onChange={(e) => setNp({ ...np, ageGroup: e.target.value as AgeGroup })}>
                  <option value="little">1 to 5</option><option value="kid">6 to 12</option><option value="teen">13 to 15</option><option value="adult">Grown-up</option>
                </select>
              </Field>
              <Button variant="secondary" disabled={!np.name.trim()} onClick={add} data-testid="host-add-submit">Add player</Button>
              {handoff && <p className="muted">Give this private link to their helper: <br /><code style={{ overflowWrap: "anywhere" }} data-testid="host-handoff">{handoff}</code></p>}
            </div>
          </details>
        </Card>
      )}

      {!lobby && (
        <>
          <Card title="The cast" style={{ marginTop: "var(--space-3)" }} data-testid="host-cast">
            <div className="sc-cast">{state.players.map((p) => (
              <div key={p.id}><b>{p.characterName}</b><br /><span className="muted">{p.name}{p.ready ? ", ready" : ""}{p.ballot ? ", voted" : ""}</span></div>
            ))}</div>
          </Card>
          <details className="sc-panel" data-testid="host-runsheet">
            <summary>Run sheet</summary>
            <div className="sc-panel__body">
              <ol className="sc-runsheet">{state.runSheet.filter((r) => r.phase !== "lobby").map((r) => {
                const i = phaseIndex(state.runSheet, r.phase);
                return <li key={r.phase} aria-current={r.phase === state.phase ? "step" : undefined} data-past={i < idx}>{r.clock} {r.title}</li>;
              })}</ol>
              <p className="muted">Running long? Use your override code below to accelerate.</p>
            </div>
          </details>
        </>
      )}

      <details className="sc-panel" data-testid="host-budget">
        <summary>AI pictures and video</summary>
        <div className="sc-panel__body"><BudgetPanel state={state} act={act} capInput={capInput} setCapInput={setCapInput} /></div>
      </details>

      {!lobby && (
        <details className="sc-panel sc-panel--secret" data-testid="host-override">
          <summary>Host override (secret)</summary>
          <div className="sc-panel__body">
            <p className="muted">Type your code privately. Any override takes you out of the Detective award.</p>
            <Field label="Override code">
              <input type="password" autoComplete="off" value={oc} data-testid="host-override-code" onChange={(e) => setOc(e.target.value)} />
            </Field>
            <div className="sc-actions">
              {[["NUDGE", "Nudge"], ["ADVANCED", "Advanced clue"], ["ACCELERATE", "Accelerate"], ["FINAL", "Final answer (private)"], ["FINAL_REVEAL", "Jump to reveal"]].map(([cmd, label]) => (
                <Button key={cmd} variant="secondary" disabled={!oc || busy} onClick={() => override(cmd)} data-testid={`override-${cmd.toLowerCase()}`}>{label}</Button>
              ))}
            </div>
            {msg && <p style={{ whiteSpace: "pre-wrap" }} role="status" data-testid="override-message"><b>{msg}</b></p>}
          </div>
        </details>
      )}
    </main>
  );
}
