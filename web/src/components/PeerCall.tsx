"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, ErrorNote } from "@/components/kit";
import { credHeaders, friendlyError, sendAction, type Creds } from "@/lib/client";
import { micProblem } from "@/components/useCall";
import type { CallView } from "@/app/_views";

const ICE: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

/** Waits for the browser to finish finding its network routes so the offer or answer can be sent in one piece. */
async function complete(pc: RTCPeerConnection): Promise<string> {
  if (pc.iceGatheringState !== "complete") {
    await new Promise<void>((res) => {
      const t = setTimeout(res, 3500);
      pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); res(); } });
    });
  }
  return JSON.stringify(pc.localDescription);
}

/**
 * Voice calls between players, wherever they are. The audio travels directly between the two devices; the game server only
 * passes along the call setup. Grown-ups only. (Both devices' network addresses are shared with each other for the call.)
 */
export function PeerCall({ code, creds, calls, people, adult, refresh }: {
  code: string; creds: Creds; calls: CallView[]; people: { id: string; name: string; isBot: boolean; canCall: boolean }[]; adult: boolean; refresh: (f?: boolean) => Promise<void>;
}) {
  const headers = credHeaders(creds);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mineId, setMineId] = useState<string | null>(null);   // the call this device is part of
  const pc = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const applied = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    try { pc.current?.close(); } catch { /* ignore */ }
    pc.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (audio.current) audio.current.srcObject = null;
    applied.current = null; setMineId(null); setMuted(false);
  }, []);

  const connection = useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") throw new Error("insecure");
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    stream.current = mic;
    const conn = new RTCPeerConnection(ICE);
    pc.current = conn;
    mic.getTracks().forEach((t) => conn.addTrack(t, mic));
    conn.ontrack = (e) => { if (audio.current) { audio.current.srcObject = e.streams[0]; void audio.current.play().catch(() => {}); } };
    conn.onconnectionstatechange = () => { if (conn.connectionState === "failed") setErr("The call could not connect. Some networks block direct calls."); };
    return conn;
  }, []);

  async function call(toId: string) {
    setErr(""); setBusy(true);
    try {
      const conn = await connection();
      await conn.setLocalDescription(await conn.createOffer());
      const offer = await complete(conn);
      const r = await sendAction<{ callId: string }>(code, { type: "startCall", to: toId, offer }, headers);
      setMineId(r.callId);
      await refresh(true);
    } catch (e) { cleanup(); setErr((e as Error).message === "insecure" || (e as { name?: string }).name ? micProblem(e) : friendlyError((e as Error).message)); }
    setBusy(false);
  }

  async function accept(c: CallView) {
    setErr(""); setBusy(true);
    try {
      const conn = await connection();
      await conn.setRemoteDescription(JSON.parse(c.offer!));
      await conn.setLocalDescription(await conn.createAnswer());
      const answer = await complete(conn);
      setMineId(c.id);
      await sendAction(code, { type: "answerCall", id: c.id, answer }, headers);
      await refresh(true);
    } catch (e) { cleanup(); setErr((e as Error).message === "insecure" || (e as { name?: string }).name ? micProblem(e) : friendlyError((e as Error).message)); }
    setBusy(false);
  }

  async function end(id: string) {
    setBusy(true);
    try { await sendAction(code, { type: "endCall", id }, headers); await refresh(true); } catch { /* the other side may have hung up */ }
    cleanup(); setBusy(false);
  }

  // The caller finishes the connection when the answer arrives; either side tidies up when the call ends.
  const mine = calls.find((c) => c.id === mineId);
  useEffect(() => {
    if (!mine) return;
    if (mine.state === "ended") { cleanup(); return; }
    if (mine.role === "caller" && mine.state === "active" && mine.answer && pc.current && applied.current !== mine.id) {
      applied.current = mine.id;
      void pc.current.setRemoteDescription(JSON.parse(mine.answer)).catch(() => setErr("The call could not connect."));
    }
  }, [mine, cleanup]);
  useEffect(() => () => cleanup(), [cleanup]);
  // If the page was reloaded mid-call, the old call is dead on this device.
  useEffect(() => { if (!mineId && !pc.current) calls.filter((c) => c.state === "active" || (c.role === "caller" && c.state === "ringing")).forEach((c) => { void sendAction(code, { type: "endCall", id: c.id }, headers).catch(() => {}); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const incoming = calls.find((c) => c.role === "callee" && c.state === "ringing");
  const callable = people.filter((x) => x.canCall);
  const toggleMute = () => { const on = !muted; stream.current?.getAudioTracks().forEach((t) => { t.enabled = !on; }); setMuted(on); };

  if (!adult) return null;
  return (
    <Card title="Call a guest" data-testid="peer-call" style={{ marginTop: "var(--space-3)" }}>
      <audio ref={audio} autoPlay playsInline />
      {incoming && !mineId && (
        <div role="alert" data-testid="incoming-call" style={{ marginBottom: "var(--space-3)" }}>
          <p style={{ marginTop: 0 }}><b>{incoming.withName}</b> is calling you.</p>
          <div className="sc-actions">
            <Button disabled={busy} onClick={() => void accept(incoming)} data-testid="call-accept">Answer</Button>
            <Button variant="secondary" disabled={busy} onClick={() => void end(incoming.id)} data-testid="call-decline">Decline</Button>
          </div>
        </div>
      )}
      {mine && mine.state !== "ended" ? (
        <div data-testid="active-call">
          <p style={{ marginTop: 0 }} role="status">{mine.state === "ringing" ? `Calling ${mine.withName}...` : `On a call with ${mine.withName}`}</p>
          <div className="sc-actions">
            <Button variant="danger" disabled={busy} onClick={() => void end(mine.id)} data-testid="call-hangup">Hang up</Button>
            {mine.state === "active" && <Button variant="secondary" onClick={toggleMute} aria-pressed={muted} data-testid="call-mute">{muted ? "Unmute" : "Mute"}</Button>}
          </div>
        </div>
      ) : callable.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No one else can take a voice call right now. You can still send private messages above.</p>
      ) : (
        <ul className="clean" data-testid="call-list">
          {callable.map((x) => (
            <li key={x.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
              <span>{x.name}</span>
              <Button variant="secondary" disabled={busy || !!incoming} onClick={() => void call(x.id)} data-testid={`call-${x.id}`}>Call</Button>
            </li>
          ))}
        </ul>
      )}
      {err && <ErrorNote data-testid="peer-call-error">{err}</ErrorNote>}
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
        Voice goes directly between your phones, wherever you are. Grown-ups only, and the two of you share network addresses to connect. The game server never hears the call.
      </p>
    </Card>
  );
}
