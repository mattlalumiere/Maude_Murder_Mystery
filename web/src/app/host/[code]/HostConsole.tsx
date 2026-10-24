"use client";
import { useEffect, useRef, useState } from "react";
import { BotsPanel } from "./BotsPanel";
import { DrinkPanel } from "./DrinkPanel";
import { LaunchProgress } from "@/components/LaunchProgress";
import { BudgetPanel } from "./BudgetPanel";
import { SaveStoryCard } from "./SaveStoryCard";
import type { HostState } from "@/app/_views";
import { CopyButton } from "@/components/CopyButton";
import { Qr } from "@/components/Qr";
import { Badge, Button, Card, ConnectionCandle, ErrorNote, Field, Notice, Skeleton } from "@/components/kit";
import { askConfirm, friendlyError, nextPhaseTitle, originUrl, phaseIndex, runBotTick, runLife, runGenerate, runMedia, sendAction, useDocTitle, useRoom } from "@/lib/client";
import type { AgeGroup } from "@/lib/types";

export default function HostConsole({ code }: { code: string }) {
  const { state, error, status, refresh } = useRoom<HostState>(code, "host");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [oc, setOc] = useState("");
  const [np, setNp] = useState({ name: "", ageGroup: "little" as AgeGroup });
  const [handoff, setHandoff] = useState("");
  const [sampleLinks, setSampleLinks] = useState<{ name: string; url: string }[]>([]);
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

  // AI guest chatter: nudge the server to speak queued story-beat lines, one at a time (spend is capped server-side).
  const botPending = (state?.botQueued ?? 0) > 0 && !!state?.botConfig.chatter;
  const botWorking = useRef(false);
  useEffect(() => {
    if (!botPending) return;
    let stop = false;
    const tick = async () => {
      if (botWorking.current) return;
      botWorking.current = true;
      try { await runBotTick(code); await refresh(true); } catch { /* retried next tick */ }
      botWorking.current = false;
    };
    tick();
    const t = setInterval(() => { if (!stop) tick(); }, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [botPending, code, refresh]);

  // Life stories: while any are still being written, run two writers at a time (the local model handles that comfortably).
  const lifePending = (state?.lifeLeft ?? 0) > 0;
  const lifeWorking = useRef(false);
  useEffect(() => {
    if (!lifePending) return;
    let stop = false;
    const tick = async () => {
      if (lifeWorking.current) return;
      lifeWorking.current = true;
      try { await Promise.all([runLife(code), runLife(code)]); await refresh(true); } catch { /* retried next tick */ }
      lifeWorking.current = false;
    };
    tick();
    const t = setInterval(() => { if (!stop) tick(); }, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [lifePending, code, refresh]);

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
  // Local testing helper: fills the lobby so one person can try the whole game. Hidden in production builds.
  async function addSamples() {
    const roster: [string, AgeGroup][] = [["Alex (test)", "adult"], ["Sam (test)", "adult"], ["Jordan (test)", "adult"], ["Riley (test)", "kid"], ["Pip (test)", "little"]];
    const have = new Set(state?.players.map((p) => p.name) ?? []);
    const links: { name: string; url: string }[] = [];
    for (const [name, ageGroup] of roster) {
      if (have.has(name)) continue;
      const r = await act({ type: "addPlayer", name, ageGroup }) as { playerId?: string; token?: string } | undefined;
      if (r?.playerId) links.push({ name, url: `${originUrl()}/play/${code}?pid=${r.playerId}&tok=${r.token}` });
    }
    setSampleLinks((prev) => [...prev, ...links]);
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
  const adultCount = state.players.filter((p) => p.ageGroup === "adult").length;
  const canStart = state.players.length >= 4 && adultCount >= 2;
  const startNeeds = [
    state.players.length < 4 ? `${4 - state.players.length} more player${4 - state.players.length === 1 ? "" : "s"}` : "",
    adultCount < 2 ? `${2 - adultCount} more grown-up${2 - adultCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" and ");
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
            <p className="muted">Needs at least 4 players, 2 of them grown-ups. The host runs the game and is not counted unless you also join with the invite link.</p>
            {!canStart && (
              <Notice data-testid="host-start-needs">
                Start is waiting for {startNeeds}. {state.players.length} joined so far ({adultCount} grown-up{adultCount === 1 ? "" : "s"}). Share the invite link or QR code below, or add AI guests in the AI guests card to fill the room.
              </Notice>
            )}
            {state.generating && Date.now() - state.generating < (state.generationWindowMs ?? 80_000) ? (
              <LaunchProgress launch={state.launch} title="Writing your mystery" />
            ) : (
              <Button size="lg" block loading={busy} disabled={!canStart} onClick={() => act({ type: "start" })} data-testid="host-start">
                {state.generating ? "That took too long. Start again" : canStart ? "Cast the characters and start" : "Waiting for players..."}
              </Button>
            )}
            {process.env.NODE_ENV !== "production" && (
              <div className="sc-panel__body" data-testid="host-dev-tools" style={{ marginTop: "var(--space-3)" }}>
                <p className="muted" style={{ marginTop: 0 }}>Local testing: fill the lobby with sample players so you can try the whole game alone.</p>
                <Button variant="secondary" disabled={busy} onClick={addSamples} data-testid="host-add-samples">Add 5 sample players</Button>
                {sampleLinks.length > 0 && (
                  <ul className="clean" data-testid="host-sample-links">
                    {sampleLinks.map((l) => <li key={l.name}><a href={l.url} target="_blank" rel="noopener">Open as {l.name}</a></li>)}
                  </ul>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <Button size="lg" block loading={busy} disabled={last || state.paused} onClick={() => act({ type: "advance", intermission: true })} data-testid="host-advance">
              {last ? "The mystery is solved" : state.round?.intermission ? (state.round.intermission.stage === "gm" ? "Skip the GM message" : "Skip the intermission") : `Next: ${nextPhaseTitle(state.runSheet, state.phase)}`}
            </Button>
            <div className="sc-actions" style={{ marginTop: "var(--space-3)" }}>
              <Button variant="secondary" onClick={() => act({ type: state.paused ? "resume" : "pause" })} data-testid="host-pause">{state.paused ? "Resume" : "Pause"}</Button>
              {state.ballotsOpen && <Badge tone="ghost" data-testid="host-ballots">Accusations in: {state.ballotsIn} of {state.totalPlayers}</Badge>}
            </div>
          </>
        )}
      </Card>

      {state.phase === "cards" && <LaunchProgress launch={state.launch} />}

      <DrinkPanel state={state} act={act} busy={busy} />

      <BotsPanel state={state} act={act} busy={busy} />

      {!lobby && !state.generating && <SaveStoryCard code={code} phase={state.phase} defaultTitle={state.title ?? "Our mystery"} />}

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
            {state.round?.canReady && state.round.total > 0 && <p className="muted" data-testid="host-ready" style={{ marginTop: 0 }}>Ready: {state.round.ready} of {state.round.total}{state.round.countdownMs !== null ? ". The rest are on a countdown and the game moves on by itself." : ". Everyone ready (or two thirds plus a countdown) moves the game on."}</p>}
            {state.round?.intermission && <p className="muted" data-testid="host-intermission" style={{ marginTop: 0 }}>Intermission: {state.round.intermission.artLeft} picture(s) still rendering for {state.round.intermission.toTitle}.</p>}
            <div className="sc-cast">{state.players.map((p) => (
              <div key={p.id}><b>{p.characterName}</b><br /><span className="muted">{p.name}{p.isBot ? "" : p.ready ? " ✓ ready" : ""}{p.ballot ? ", voted" : ""}</span></div>
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

      {lobby && (
        <Card title="Ready to begin?" tone="glow" style={{ marginTop: "var(--space-4)" }} data-testid="host-start-bottom-card">
          {state.generating && Date.now() - state.generating < (state.generationWindowMs ?? 80_000) ? (
            <LaunchProgress launch={state.launch} title="Writing your mystery" />
          ) : (
            <>
              {!canStart && <p className="muted" style={{ marginTop: 0 }}>Start is waiting for {startNeeds}. {state.players.length} joined so far.</p>}
              <Button size="lg" block loading={busy} disabled={!canStart} onClick={() => act({ type: "start" })} data-testid="host-start-bottom">
                {state.generating ? "That took too long. Start again" : canStart ? "Cast the characters and start" : "Waiting for players..."}
              </Button>
            </>
          )}
        </Card>
      )}
    </main>
  );
}
