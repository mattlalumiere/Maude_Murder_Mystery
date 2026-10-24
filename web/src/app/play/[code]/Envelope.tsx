"use client";
import { useState } from "react";
import { Avatar } from "@/components/Media";
import { Button, PaperClue, WaxSeal } from "@/components/kit";
import { plainText } from "@/lib/client";
import type { PlayerState } from "@/app/_views";

type Character = NonNullable<PlayerState["me"]["character"]>;

/** The private character card: a sealed envelope you break open. Hiding it seals it again. */
export function SealedCard({ code, avatarId, ch, canReady, ready, onReady, busy }: {
  code: string; avatarId?: string; ch: Character; canReady: boolean; ready: boolean; onReady: () => void; busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const c = ch.card;
  return (
    <div data-testid="character-card" data-open={open}>
      {!open ? (
        <div className="sc-envelope" data-testid="envelope">
          <p className="sc-envelope__hint">For your eyes only</p>
          <h2>{plainText(ch.name)}</h2>
          <p>{plainText(ch.tease)}</p>
          <WaxSeal mark="?" size={72} label="Break the seal to read your secret card" onPress={() => setOpen(true)} />
          <p style={{ marginTop: "var(--space-3)" }}>Tap the seal. Make sure nobody is peeking.</p>
        </div>
      ) : (
        <div className="sc-card-open" data-testid="card-open">
          <PaperClue title={`You are ${plainText(ch.name)}`} label={plainText(ch.house)} stamp="SECRET" tilt={0}>
            <div className="sc-card-head" style={{ marginBottom: "var(--space-2)" }}>
              <Avatar code={code} id={avatarId} size={64} alt={`Portrait of ${ch.name}`} />
              <span>{plainText(ch.tease)}</span>
            </div>
            <p className="sc-secret-h">Your story</p><p className="sc-secret-p" data-testid="card-story">{plainText(c.story)}</p>
            <p className="sc-secret-h">Your secret</p><p className="sc-secret-p" data-testid="card-secret">{plainText(c.secret)}</p>
            <p className="sc-secret-h">Your alibi</p><p className="sc-secret-p">{plainText(c.alibi)}</p>
            <p className="sc-secret-h">What you know</p>
            <ul className="sc-secret-list">{c.knows.map((k, i) => <li key={i}>{plainText(k)}</li>)}</ul>
            {c.extra && (<><p className="sc-secret-h">From you</p><p className="sc-secret-p">{plainText(c.extra)}</p></>)}
            <p className="sc-secret-h">Your goal</p><p className="sc-secret-p">{plainText(c.goal)}</p>
            <p className="sc-secret-h">Special move</p><p className="sc-secret-p">{plainText(c.special)}</p>
            <p className="sc-secret-p" style={{ marginTop: "var(--space-3)", fontStyle: "italic" }}>You can always say &quot;Pass&quot;.</p>
          </PaperClue>
          <div className="sc-gap" style={{ marginTop: "var(--space-4)" }}>
            {canReady && !ready && <Button size="lg" block loading={busy} onClick={onReady} data-testid="card-ready">I have memorized it</Button>}
            {ready && canReady && <p className="ok" data-testid="card-ready-done">Ready. Waiting for the others.</p>}
            <Button variant="secondary" block onClick={() => setOpen(false)} data-testid="card-hide">Seal it again</Button>
          </div>
        </div>
      )}
      {!open && canReady && ready && <p className="ok" data-testid="card-ready-done">Ready. Waiting for the others.</p>}
    </div>
  );
}
