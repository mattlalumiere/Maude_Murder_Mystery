"use client";
import { useState } from "react";
import { PhotoPicker, uploadPhoto } from "@/components/PhotoUploader";
import { Button } from "@/components/kit";
import { sendAction, type Creds, credHeaders } from "@/lib/client";

export function PhotoSection({ code, creds, hasPhoto, adult, refresh }: {
  code: string; creds: Creds; hasPhoto: boolean; adult: boolean; refresh: (f?: boolean) => Promise<void>;
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
  async function remove() {
    setBusy(true);
    try { await sendAction(code, { type: "removePhoto" }, credHeaders(creds)); await refresh(true); setMsg("Photo removed."); }
    catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  return (
    <div data-testid="photo-section">
      <PhotoPicker isAdult={adult} onChange={setSel} disabled={busy} />
      <div className="sc-actions" style={{ marginTop: "var(--space-3)" }}>
        <Button disabled={busy || !sel.blob || !sel.consent} onClick={save} data-testid="photo-save">{hasPhoto ? "Replace photo" : "Save photo"}</Button>
        {hasPhoto && <Button variant="secondary" disabled={busy} onClick={remove} data-testid="photo-remove">Remove my photo</Button>}
      </div>
      {msg && <p className="muted" role="status" data-testid="photo-message">{msg}</p>}
      <p className="muted" style={{ fontSize: ".85rem" }}><a href="/privacy" target="_blank" rel="noopener">How photos are used and deleted</a></p>
    </div>
  );
}
