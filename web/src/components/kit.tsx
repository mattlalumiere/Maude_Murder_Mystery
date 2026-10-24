"use client";
/**
 * Screen-level imports in one place: the W6 design system plus a few small screen helpers.
 * Screens import from here only.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { ConnectionStatus } from "@/lib/client";
import { Candle } from "@/components/ui";
import "@/app/screens.css";

export { Badge, Button, Candle, Card, Field, Fog, PaperClue, Sheet, Stack, WaxSeal } from "@/components/ui";

export function ButtonLink({ href, variant = "primary", block, lg, children, ...rest }: {
  href: string; variant?: "primary" | "secondary" | "ghost" | "danger"; block?: boolean; lg?: boolean; children: ReactNode;
  "data-testid"?: string; target?: string; rel?: string;
}) {
  const cls = ["mm-btn", variant !== "primary" && `mm-btn--${variant}`, block && "mm-btn--block", lg && "mm-btn--lg"].filter(Boolean).join(" ");
  return <Link href={href} className={cls} {...rest}>{children}</Link>;
}

/** Small corner candle: quiet when live, says "Reconnecting" when the connection drops. Never blocks the screen. */
export function ConnectionCandle({ status }: { status: ConnectionStatus }) {
  const msg = status === "reconnecting" ? "Reconnecting" : status === "failed" ? "Cannot reach the game, still trying" : "";
  return (
    <div className="sc-conn" role="status" aria-live="polite" data-testid="connection-status" data-status={status}>
      {msg && <><Candle scale={0.45} /><span>{msg}</span></>}
    </div>
  );
}

export function Skeleton({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div className="sc-skeleton" role="status" aria-label={label} data-testid="loading-skeleton">
      <div className="sc-skel sc-skel--title" />
      {Array.from({ length: lines }, (_, i) => <div key={i} className="sc-skel" style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}

export function ErrorNote({ children, ...rest }: { children: ReactNode; "data-testid"?: string }) {
  return <p className="sc-error" role="alert" {...rest}>{children}</p>;
}

export function Notice({ children, ...rest }: { children: ReactNode; "data-testid"?: string }) {
  return <p className="sc-notice" role="status" {...rest}>{children}</p>;
}

export function Brand() {
  return <p className="sc-brand"><Candle scale={0.5} /> <span>Murder Mystery Night</span></p>;
}

/** Live progress bar with an accessible name. */
export function Progress({ value, max, label, ...rest }: { value: number; max: number; label: string; "data-testid"?: string }) {
  return (
    <div className="sc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} {...rest}>
      <div className="sc-progress__fill" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}
