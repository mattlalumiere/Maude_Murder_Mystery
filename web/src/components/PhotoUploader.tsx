"use client";
import { useRef, useState } from "react";
import { CameraCapture, liveCameraAvailable } from "@/components/CameraCapture";
import { Button, Card, Field } from "@/components/kit";
import { uploadPhotoBlob, type Creds } from "@/lib/client";

/** Downsizes a photo to a JPEG no larger than `max` pixels on its long side. */
export async function resizeToJpeg(file: File, max = 768): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not read photo"))), "image/jpeg", 0.85));
}

export const uploadPhoto = (code: string, creds: Creds, blob: Blob, consent: "self" | "guardian") => uploadPhotoBlob(code, creds, blob, consent);

/** Photo picker with consent. Used while joining (deferred upload) and later from the player page (immediate upload). */
export function PhotoPicker({
  isAdult, onChange, disabled,
}: { isAdult: boolean; onChange: (v: { blob: Blob | null; consent: "self" | "guardian" | null }) => void; disabled?: boolean }) {
  const [preview, setPreview] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [err, setErr] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const nativeCamera = useRef<HTMLInputElement>(null);
  const consent = isAdult ? "self" : "guardian";

  function takePhoto() {
    setErr("");
    // Live in-browser camera when the page is secure; otherwise hand off to the phone's own camera app.
    if (liveCameraAvailable()) setCameraOpen(true);
    else nativeCamera.current?.click();
  }
  function accept(b: Blob) {
    setErr("");
    setBlob(b); setPreview(URL.createObjectURL(b));
    onChange({ blob: b, consent: agreed ? consent : null });
  }

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
    <Card title="A cartoon look-alike (optional)" data-testid="photo-picker">
      <p className="muted" style={{ marginTop: 0 }}>Take a selfie now or pick one you already have. Skip it and the GM draws you without a likeness.</p>
      <div className="sc-actions">
        <Button type="button" disabled={disabled} onClick={takePhoto} data-testid="photo-take">{blob ? "Retake photo" : "Take a photo"}</Button>
        <Field label="Or choose a photo">
          <input type="file" accept="image/*" disabled={disabled} data-testid="photo-input" onChange={(e) => pick(e.target.files?.[0])} />
        </Field>
      </div>
      {/* Fallback that opens the phone's own camera app (works on http pages, where live camera is blocked). */}
      <input ref={nativeCamera} type="file" accept="image/*" capture="user" hidden disabled={disabled} data-testid="photo-camera-input" onChange={(e) => pick(e.target.files?.[0])} />
      <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={accept} />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <p><img src={preview} alt="Your photo preview" width={120} height={120} style={{ objectFit: "cover", borderRadius: "var(--radius)" }} /></p>
      )}
      {err && <p className="sc-error" role="alert">{err}</p>}
      <label className="sc-check">
        <input type="checkbox" checked={agreed} data-testid="photo-consent" onChange={(e) => { setAgreed(e.target.checked); onChange({ blob, consent: e.target.checked ? consent : null }); }} />
        <span>
          {isAdult
            ? "I agree to my photo being used to create cartoon images of my character in this game."
            : "I am this player's parent or guardian and I agree to their photo being used to create cartoon images of their character in this game."}
        </span>
      </label>
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
        Your photo is used only to draw your character, is never shown to other players, and is deleted within 24 hours (the host can delete it sooner).
      </p>
    </Card>
  );
}
