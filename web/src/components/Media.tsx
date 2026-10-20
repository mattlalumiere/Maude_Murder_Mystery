"use client";

export type MediaRef = { id: string; kind: string; phase: string; caption: string; mime?: string };

export function MediaView({ code, m, className }: { code: string; m: MediaRef; className?: string }) {
  const src = `/api/rooms/${code}/media/${m.id}`;
  return (
    <figure style={{ margin: 0 }} className={className}>
      {m.mime?.startsWith("video") ? (
        <video src={src} controls autoPlay muted loop playsInline style={{ width: "100%", borderRadius: 12 }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={m.caption} style={{ width: "100%", borderRadius: 12, display: "block" }} />
      )}
      <figcaption className="muted" style={{ fontSize: ".85rem" }}>{m.caption}</figcaption>
    </figure>
  );
}

export function Avatar({ code, id, size = 64, alt }: { code: string; id?: string; size?: number; alt: string }) {
  if (!id) return <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--line)" }} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/rooms/${code}/media/${id}`} alt={alt} width={size} height={size} style={{ borderRadius: "50%", objectFit: "cover" }} />;
}
