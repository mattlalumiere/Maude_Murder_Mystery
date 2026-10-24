"use client";
import { useRef, useState } from "react";
import { CameraCapture, liveCameraAvailable } from "@/components/CameraCapture";
import { MediaView } from "@/components/Media";
import { resizeToJpeg } from "@/components/PhotoUploader";
import { Button, Card, ErrorNote } from "@/components/kit";
import { friendlyError, uploadSelfie, type Creds } from "@/lib/client";
import { SELFIE_STYLES } from "@/lib/selfie-styles";

type Mine = { id: string; status: string; note?: string }[];
type Wall = { id: string; caption: string }[];

/** Selfie booth: take a photo, pick a style, and the AI turns it into something silly that is shared on the wall. */
export function SelfieBooth({ code, creds, adult, ok, mine, wall, refresh }: {
  code: string; creds: Creds; adult: boolean; ok: boolean; mine: Mine; wall: Wall; refresh: (f?: boolean) => Promise<void>;
}) {
  const [style, setStyle] = useState<string>(SELFIE_STYLES[0].id);
  const [agreed, setAgreed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const native = useRef<HTMLInputElement>(null);
  const pending = mine.filter((m) => m.status === "queued" || m.status === "running").length;

  async function send(blob: Blob) {
    setBusy(true); setErr(""); setMsg("");
    try { await uploadSelfie(code, creds, blob, style, adult ? "self" : "guardian"); setMsg("Developing your picture. It will pop up on everyone's screen in a moment."); await refresh(true); }
    catch (e) { setErr(friendlyError((e as Error).message)); }
    setBusy(false);
  }
  function snap() {
    setErr("");
    if (liveCameraAvailable()) setOpen(true); else native.current?.click();
  }
  async function pick(f?: File) {
    if (!f) return;
    try { await send(await resizeToJpeg(f)); } catch { setErr("That file could not be read as a photo."); }
  }

  return (
    <Card title="Selfie booth" data-testid="selfie-booth" style={{ marginTop: "var(--space-3)" }}>
      {!ok ? (
        <p className="muted" style={{ margin: 0 }}>Selfies are turned off for players under 18 at this event, but you can still enjoy everyone else&apos;s on the wall.</p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Snap a selfie and the AI makes it hilarious. Pick a style first.</p>
          <div className="sc-actions" role="radiogroup" aria-label="Selfie style">
            {SELFIE_STYLES.map((s) => (
              <Button key={s.id} variant={s.id === style ? "primary" : "secondary"} onClick={() => setStyle(s.id)} aria-pressed={s.id === style} data-testid={`selfie-style-${s.id}`}>{s.label}</Button>
            ))}
          </div>
          <label className="sc-check" style={{ marginTop: "var(--space-3)" }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="selfie-consent" />
            <span>
              {adult
                ? "I agree to my selfie being turned into a funny picture that everyone in this game can see."
                : "I am this player's parent or guardian and I agree to their selfie being turned into a funny picture that everyone in this game can see."}
            </span>
          </label>
          <div className="sc-actions" style={{ marginTop: "var(--space-3)" }}>
            <Button disabled={busy || !agreed} onClick={snap} data-testid="selfie-take">{busy ? "Sending..." : "Take a selfie"}</Button>
            <label className="mm-btn mm-btn--secondary" aria-disabled={busy || !agreed} style={{ opacity: busy || !agreed ? 0.5 : 1 }}>
              Choose a photo
              <input type="file" accept="image/*" hidden disabled={busy || !agreed} data-testid="selfie-file" onChange={(e) => void pick(e.target.files?.[0])} />
            </label>
          </div>
          <input ref={native} type="file" accept="image/*" capture="user" hidden data-testid="selfie-camera-input" onChange={(e) => void pick(e.target.files?.[0])} />
          <CameraCapture open={open} onClose={() => setOpen(false)} onCapture={(b) => { setOpen(false); void send(b); }} />
          {pending > 0 && <p className="muted" role="status">Developing {pending} picture{pending > 1 ? "s" : ""}...</p>}
          {msg && <p className="muted" role="status" data-testid="selfie-message">{msg}</p>}
          {err && <ErrorNote data-testid="selfie-error">{err}</ErrorNote>}
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>Your original photo is used once to make the picture and is then deleted. Only the funny picture is shown. Up to three each.</p>
        </>
      )}
      {wall.length > 0 && (
        <div data-testid="selfie-wall" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          {wall.slice().reverse().map((m) => <MediaView key={m.id} code={code} m={{ id: m.id, kind: "selfie", phase: "", caption: m.caption }} />)}
        </div>
      )}
    </Card>
  );
}
