"use client";
import { useState } from "react";
import { mediaUrl } from "@/lib/client";

export type MediaRef = { id: string; kind: string; phase: string; caption: string; mime?: string };

export function MediaView({ code, m, className }: { code: string; m: MediaRef; className?: string }) {
  const src = mediaUrl(code, m.id);
  return (
    <figure style={{ margin: 0 }} className={className} data-testid="media-item">
      {m.mime?.startsWith("video") ? (
        <video src={src} controls muted loop playsInline style={{ width: "100%", borderRadius: "var(--radius)" }} aria-label={m.caption} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={m.caption} loading="lazy" style={{ width: "100%", borderRadius: "var(--radius)", display: "block" }} />
      )}
      <figcaption className="muted" style={{ fontSize: "var(--text-sm)" }}>{m.caption}</figcaption>
    </figure>
  );
}

export function Avatar({ code, id, size = 64, alt }: { code: string; id?: string; size?: number; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!id || failed) return <div className="sc-avatar" style={{ width: size, height: size }} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="sc-avatar" src={mediaUrl(code, id)} alt={alt} width={size} height={size} onError={() => setFailed(true)} />;
}
