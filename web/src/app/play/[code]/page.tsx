"use client";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Avatar, MediaView } from "@/components/Media";
import { PhotoPicker, uploadPhoto } from "@/components/PhotoUploader";
import { api, useRoom } from "@/lib/client";
import type { CharacterCard } from "@/lib/types";

function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(to); }, [router, to]);
  return <main><p className="muted">Taking you to the character builder...</p></main>;
}

type Opt = { id: string; text?: string; name?: string };
type PState = {
  version: number; phase: string; phaseTitle: string; paused: boolean; narration?: string; setting?: string; title?: string;
  lobbyNames: string[]; clues: { id: string; text: string }[]; ballotsOpen: boolean;
  ballotOptions?: { suspects: Opt[]; methods: Opt[]; motives: Opt[] };
  roster: { playerName: string; characterName: string; house: string; tease: string }[];
  reveal?: { killer?: string; method?: string; motive?: string; story: string; scores: { name: string; points: number; detail: string }[]; awards: { award: string; to: string }[] };
  media: { id: string; kind: string; phase: string; caption: string; mime?: string }[];
  me: { id: string; name: string; ageGroup: string; ready: boolean; avatarId?: string; profile: { hasPhoto: boolean; consent: string }; ballot?: { killerId: string; methodId: string; motiveId: string };
        character?: { name: string; house: string; tease: string; role: string; card: CharacterCard } };
};

const key = (code: string) => `mm:${code}`;

export default function Play({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const [creds, setCreds] = useState<{ pid: string; tok: string } | null | undefined>(undefined);

  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search);
      if (q.get("pid") && q.get("tok")) {
        localStorage.setItem(key(code), JSON.stringify({ pid: q.get("pid"), tok: q.get("tok") }));
        history.replaceState(null, "", location.pathname);
      }
      const raw = localStorage.getItem(key(code));
      setCreds(raw ? JSON.parse(raw) : null);
    } catch { setCreds(null); }
  }, [code]);

  if (creds === undefined) return <main />;
  if (!creds) return <Redirect to={`/join/${code}`} />;
  return <Game code={code} creds={creds} />;
}

function Game({ code, creds }: { code: string; creds: { pid: string; tok: string } }) {
  const headers = { "x-player-id": creds.pid, "x-player-token": creds.tok };
  const { state, error, refresh } = useRoom<PState>(code, "player", headers);
  const [shown, setShown] = useState(false);
  const [err, setErr] = useState("");
  const [b, setB] = useState({ killerId: "", methodId: "", motiveId: "" });

  async function act(body: object) {
    setErr("");
    try { await api(`/api/rooms/${code}/action`, body, headers); await refresh(true); } catch (e) { setErr((e as Error).message); }
  }

  if (!state) return <main><p className={error ? "err" : "muted"}>{error || "Loading..."}</p></main>;
  const { me } = state;
  const ch = me.character;

  return (
    <main>
      <p className="muted">Room {code} · {me.name}</p>
      <h1>{state.phaseTitle}</h1>
      {state.paused && <p className="pill">PAUSED</p>}
      {state.narration && <p>{state.narration}</p>}
      {(err || error) && <p className="err">{err || error}</p>}

      {state.phase === "lobby" && (
        <div className="card"><p>Waiting for the host to start. Here so far: {state.lobbyNames.join(", ")}</p></div>
      )}

      {ch && state.phase !== "lobby" && (
        <div className="card secret">
          <div className="row">
            <Avatar code={code} id={me.avatarId} size={72} alt={`Portrait of ${ch.name}`} />
            <h2 style={{ margin: 0 }}>You are: {ch.name}</h2>
          </div>
          <p className="muted">{ch.tease} · {ch.house}</p>
          {!shown ? (
            <button onClick={() => setShown(true)}>Show my secret card</button>
          ) : (
            <>
              <p><b>Your story:</b> {ch.card.story}</p>
              <p><b>Your secret:</b> {ch.card.secret}</p>
              <p><b>Your alibi:</b> {ch.card.alibi}</p>
              <p><b>What you know:</b></p>
              <ul>{ch.card.knows.map((k, i) => <li key={i}>{k}</li>)}</ul>
              {ch.card.extra && <p><b>From you:</b> {ch.card.extra}</p>}
              <p><b>Your goal:</b> {ch.card.goal}</p>
              <p><b>Special move:</b> {ch.card.special}</p>
              <p className="muted">You may always say &quot;Pass&quot;.</p>
              <button className="ghost" onClick={() => setShown(false)}>Hide card</button>
            </>
          )}
          {state.phase === "cards" && !me.ready && <p><button onClick={() => act({ type: "ready" })}>I&apos;ve memorized it</button></p>}
          {me.ready && state.phase === "cards" && <p className="ok">Ready ✓</p>}
        </div>
      )}

      {(state.phase === "lobby" || state.phase === "cards") && (
        <PhotoSection code={code} creds={creds} hasPhoto={me.profile.hasPhoto} adult={me.ageGroup === "adult"} headers={headers} refresh={refresh} />
      )}

      {state.media.filter((m) => m.kind !== "avatar").slice(-3).reverse().map((m) => (
        <div className="card" key={m.id}><MediaView code={code} m={m} /></div>
      ))}

      {state.clues.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Clues so far</h2>
          <ul className="clean">{state.clues.map((c) => <li key={c.id}>{c.text}</li>)}</ul>
        </div>
      )}

      {state.ballotsOpen && state.ballotOptions && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Your secret accusation</h2>
          {me.ballot && <p className="ok">Vote in. You can change it until time is up.</p>}
          <Pick label="Who did it?" value={b.killerId} onChange={(v) => setB({ ...b, killerId: v })} opts={state.ballotOptions.suspects.map((o) => ({ id: o.id, text: o.name ?? "" }))} />
          <Pick label="How?" value={b.methodId} onChange={(v) => setB({ ...b, methodId: v })} opts={state.ballotOptions.methods.map((o) => ({ id: o.id, text: o.text ?? "" }))} />
          <Pick label="Why?" value={b.motiveId} onChange={(v) => setB({ ...b, motiveId: v })} opts={state.ballotOptions.motives.map((o) => ({ id: o.id, text: o.text ?? "" }))} />
          <p><button disabled={!b.killerId || !b.methodId || !b.motiveId} onClick={() => act({ type: "ballot", ballot: b })}>Submit accusation</button></p>
        </div>
      )}

      {state.reveal && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>It was {state.reveal.killer}!</h2>
          <p><b>How:</b> {state.reveal.method}</p><p><b>Why:</b> {state.reveal.motive}</p>
          <p>{state.reveal.story}</p>
          <h2>Scores</h2>
          <ul className="clean">{state.reveal.scores.map((s) => <li key={s.name}>{s.name}: <b>{s.points}</b> <span className="muted">{s.detail}</span></li>)}</ul>
          <h2>Awards</h2>
          <ul className="clean">{state.reveal.awards.map((a, i) => <li key={i}>🏆 {a.award}: <b>{a.to}</b></li>)}</ul>
        </div>
      )}
    </main>
  );
}

function Pick({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: { id: string; text: string }[] }) {
  return (
    <>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose...</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
      </select>
    </>
  );
}

function PhotoSection({ code, creds, hasPhoto, adult, headers, refresh }: {
  code: string; creds: { pid: string; tok: string }; hasPhoto: boolean; adult: boolean; headers: Record<string, string>; refresh: (f?: boolean) => Promise<void>;
}) {
  const [sel, setSel] = useState<{ blob: Blob | null; consent: "self" | "guardian" | null }>({ blob: null, consent: null });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!sel.blob || !sel.consent) return;
    setBusy(true); setMsg("");
    try { await uploadPhoto(code, creds, sel.blob, sel.consent); setMsg("Photo saved."); await refresh(true); }
    catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  return (
    <>
      <PhotoPicker isAdult={adult} onChange={setSel} disabled={busy} />
      <div className="row">
        <button disabled={busy || !sel.blob || !sel.consent} onClick={save}>{hasPhoto ? "Replace photo" : "Save photo"}</button>
        {hasPhoto && <button className="ghost" onClick={async () => { await api(`/api/rooms/${code}/action`, { type: "removePhoto" }, headers); await refresh(true); setMsg("Photo removed."); }}>Remove my photo</button>}
        {msg && <span className="muted">{msg}</span>}
      </div>
    </>
  );
}
