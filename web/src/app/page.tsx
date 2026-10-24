"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink, Candle, Card, Fog } from "@/components/kit";
import { isValidCode, normalizeCode } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const ok = isValidCode(code);
  return (
    <main className="sc-page">
      <header className="sc-hero" data-testid="landing-hero">
        <Fog />
        <div style={{ position: "relative" }}>
          <Candle scale={1.6} />
          <h1>Murder Mystery Night</h1>
          <p>A whodunit for the whole family. A secret-keeping Game Master, and a suspect list with your name on it.</p>
        </div>
      </header>

      <Card title="Join a game" data-testid="landing-join">
        <form onSubmit={(e) => { e.preventDefault(); if (ok) router.push(`/join/${code}`); }}>
          <label htmlFor="room-code" className="sc-block">Room code from the big screen</label>
          <input id="room-code" className="sc-code-input" data-testid="landing-join-code" value={code} inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
            maxLength={6} placeholder="ABCD" aria-describedby="room-code-hint" onChange={(e) => setCode(normalizeCode(e.target.value))} />
          <p id="room-code-hint" className="muted" style={{ fontSize: "var(--text-xs)" }}>4 to 6 letters or numbers.</p>
          <Button type="submit" size="lg" block disabled={!ok} data-testid="landing-join-submit">Join the party</Button>
        </form>
      </Card>

      <Card title="Hosting tonight?" style={{ marginTop: "var(--space-4)" }} data-testid="landing-host">
        <p className="muted">Sign in once to set up a game. Guests never need an account.</p>
        <ButtonLink href="/host/new" variant="secondary" block data-testid="landing-host-link">Host a game</ButtonLink>
        <p style={{ marginBottom: 0 }}><ButtonLink href="/stories" variant="ghost" block data-testid="landing-stories-link">Browse and vote on stories</ButtonLink></p>
      </Card>
    </main>
  );
}
