"use client";
import { useState } from "react";

/** Downsizes a photo to a JPEG no larger than `max` pixels on its long side. */
export async function resizeToJpeg(file: File, max = 768): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not read photo"))), "image/jpeg", 0.85));
}

export async function uploadPhoto(code: string, creds: { pid: string; tok: string }, blob: Blob, consent: "self" | "guardian") {
  const r = await fetch(`/api/rooms/${code}/photo`, {
    method: "POST", body: blob,
    headers: { "x-player-id": creds.pid, "x-player-token": creds.tok, "x-consent": consent, "content-type": "image/jpeg" },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Upload failed");
}

/** Photo picker with consent. Used while joining (deferred upload) and later from the player page (immediate upload). */
export function PhotoPicker({
  isAdult, onChange, disabled,
}: { isAdult: boolean; onChange: (v: { blob: Blob | null; consent: "self" | "guardian" | null }) => void; disabled?: boolean }) {
  const [preview, setPreview] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [err, setErr] = useState("");
  const consent = isAdult ? "self" : "guardian";

  async function pick(f?: File) {
    setErr("");
    if (!f) return;
    try {
      const b = await resizeToJpeg(f);
      setBlob(b); setPreview(URL.createObjectURL(b));
      onChange({ blob: b, consent: agreed ? consent : null });
    } catch { setErr("That file could not be read as a photo."); }
  }

  return (
    <div className="card">
      <label htmlFor="photo">Optional: a photo to use for your cartoon look-alike</label>
      <input id="photo" type="file" accept="image/*" capture="user" disabled={disabled} onChange={(e) => pick(e.target.files?.[0])} />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <p><img src={preview} alt="Your photo preview" width={120} height={120} style={{ objectFit: "cover", borderRadius: 12 }} /></p>
      )}
      {err && <p className="err">{err}</p>}
      <label style={{ color: "var(--fg)" }}>
        <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); onChange({ blob, consent: e.target.checked ? consent : null }); }} />
        {isAdult
          ? "I agree to my photo being used to create cartoon images of my character in this game."
          : "I am this player's parent or guardian and I agree to their photo being used to create cartoon images of their character in this game."}
      </label>
      <p className="muted" style={{ fontSize: ".85rem" }}>
        Your photo is used only to draw your character in this game, is never shown to other players, and is deleted within 24 hours (the host can delete it sooner). Skip it and the GM draws you without a likeness.
      </p>
    </div>
  );
}
