"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Sheet } from "@/components/kit";

/** True when the browser can open a live camera here (needs a secure context: https or localhost). */
export function liveCameraAvailable(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

export function cameraErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera access was blocked. Allow the camera for this site in your browser or phone settings and try again, or choose a photo instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device. Choose a photo instead.";
  if (name === "NotReadableError" || name === "AbortError") return "The camera is busy in another app. Close it and try again.";
  if (name === "SecurityError") return "Live camera needs a secure (https) page. Use your phone's camera app instead.";
  return "The camera could not be started. Choose a photo instead.";
}

/** Draws the current video frame to a JPEG no larger than `max` pixels on its long side. */
export function frameToJpeg(video: HTMLVideoElement, mirror: boolean, max = 768): Promise<Blob> {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return Promise.reject(new Error("Camera is not ready yet"));
  const scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const ctx = c.getContext("2d")!;
  if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not capture photo"))), "image/jpeg", 0.85));
}

/**
 * Live camera in a sheet: asks the browser for camera permission when opened, shows a preview,
 * and returns a JPEG when the player taps Take photo. Tracks are always stopped on close.
 */
export function CameraCapture({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (b: Blob) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [status, setStatus] = useState<"idle" | "asking" | "live" | "error">("idle");
  const [error, setError] = useState("");
  const [multiple, setMultiple] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) { stop(); setStatus("idle"); return; }
    let cancelled = false;
    setStatus("asking"); setError("");
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        stop();
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
        setStatus("live");
        try { setMultiple((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").length > 1); } catch { /* optional */ }
      } catch (e) {
        if (!cancelled) { setError(cameraErrorMessage(e)); setStatus("error"); }
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [open, facing, stop]);

  async function snap() {
    if (!videoRef.current) return;
    try {
      const b = await frameToJpeg(videoRef.current, facing === "user");
      stop(); onCapture(b); onClose();
    } catch (e) { setError((e as Error).message); setStatus("error"); }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Take a photo">
      <div data-testid="camera-sheet">
        {status === "asking" && <p role="status">Your browser will ask to use the camera. Choose Allow.</p>}
        {status === "error" && <p className="sc-error" role="alert" data-testid="camera-error">{error}</p>}
        <video
          ref={videoRef} playsInline muted autoPlay data-testid="camera-video" aria-label="Camera preview"
          style={{ width: "100%", maxHeight: "50vh", borderRadius: "var(--radius)", background: "#000", display: status === "live" ? "block" : "none", transform: facing === "user" ? "scaleX(-1)" : undefined }}
        />
        <div className="sc-actions" style={{ marginTop: "var(--space-3)" }}>
          <Button disabled={status !== "live"} onClick={snap} data-testid="camera-snap">Take photo</Button>
          {multiple && <Button variant="secondary" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} data-testid="camera-flip">Switch camera</Button>}
          <Button variant="secondary" onClick={onClose} data-testid="camera-cancel">Cancel</Button>
        </div>
        <p className="muted" style={{ fontSize: "var(--text-xs)" }}>The camera turns off as soon as you take the photo or close this.</p>
      </div>
    </Sheet>
  );
}
