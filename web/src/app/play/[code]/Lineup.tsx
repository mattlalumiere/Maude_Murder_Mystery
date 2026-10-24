"use client";
import { useState } from "react";
import { Button, Card, Progress } from "@/components/kit";
import { ballotProgress, plainText, type BallotDraft } from "@/lib/client";
import type { PlayerState } from "@/app/_views";

type Opts = NonNullable<PlayerState["ballotOptions"]>;

function Choices({ legend, name, value, onChange, opts, testPrefix }: { legend: string; name: string; value: string; onChange: (v: string) => void; opts: { id: string; text: string }[]; testPrefix: string }) {
  return (
    <fieldset className="sc-choices" style={{ marginTop: "var(--space-4)" }}>
      <legend>{legend}</legend>
      {opts.map((o) => (
        <label key={o.id} className="sc-choice">
          <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} data-testid={`${testPrefix}-${o.id}`} />
          <span className="sc-choice__face"><span className="sc-choice__title">{plainText(o.text)}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

/** Voting as a police lineup: tap the person you accuse, then how and why. */
export function Lineup({ options, initial, onSubmit, busy, submitted }: {
  options: Opts; initial?: BallotDraft; onSubmit: (b: BallotDraft) => void; busy: boolean; submitted: boolean;
}) {
  const [b, setB] = useState<BallotDraft>(initial ?? { killerId: "", methodId: "", motiveId: "" });
  const p = ballotProgress(b);
  return (
    <Card title="Make your accusation" tone="secret" data-testid="ballot">
      <div className="sc-ballot-steps"><span>Your vote is secret.</span><span data-testid="ballot-progress-text">{p.done} of {p.total} chosen</span></div>
      <fieldset className="sc-lineup" data-testid="lineup">
        <legend>Who did it?</legend>
        {options.suspects.map((s, i) => (
          <label key={s.id} className="sc-suspect">
            <input type="radio" name="killer" value={s.id} checked={b.killerId === s.id} onChange={() => setB({ ...b, killerId: s.id })} data-testid={`suspect-${s.id}`} />
            <span className="sc-suspect__face">
              <span className="sc-suspect__mark" aria-hidden>{b.killerId === s.id ? "ACCUSED" : `No. ${i + 1}`}</span>
              <span className="sc-suspect__height" aria-hidden />
              <span className="sc-suspect__name">{plainText(s.name ?? "")}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Choices legend="How?" name="method" value={b.methodId} onChange={(v) => setB({ ...b, methodId: v })} opts={options.methods.map((o) => ({ id: o.id, text: o.text ?? "" }))} testPrefix="method" />
      <Choices legend="Why?" name="motive" value={b.motiveId} onChange={(v) => setB({ ...b, motiveId: v })} opts={options.motives.map((o) => ({ id: o.id, text: o.text ?? "" }))} testPrefix="motive" />
      <div style={{ marginTop: "var(--space-4)" }}><Progress value={p.done} max={p.total} label="Accusation progress" /></div>
      <div className="sc-sticky">
        <Button size="lg" loading={busy} disabled={!p.complete} onClick={() => onSubmit(b)} data-testid="ballot-submit">{submitted ? "Change my accusation" : "Submit accusation"}</Button>
      </div>
      {submitted && <p className="ok" role="status" data-testid="ballot-done">Vote is in. You can change it until time is up.</p>}
    </Card>
  );
}
