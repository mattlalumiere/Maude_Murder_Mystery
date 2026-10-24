"use client";
import type { DrinkMe, DrinkPublic } from "@/app/_views";
import { Badge, Button, Card, Notice } from "@/components/kit";
import { plainText } from "@/lib/client";

/** Shared screen: the live drinking round, who it is for, and the standing rules. Never shows anyone's tally. */
export function DrinkBoard({ drink, big = false }: { drink?: DrinkPublic; big?: boolean }) {
  if (!drink) return null;
  const f = big ? "1.3rem" : undefined;
  return (
    <Card title="Drinking round" tone={drink.round ? "glow" : undefined} data-testid="drink-board" style={{ marginTop: "var(--space-3)" }}>
      {drink.stopped ? <Notice>Drinking is over for tonight. Water, snacks, and rides home.</Notice>
        : drink.paused ? <Notice>Drinking is paused. Everyone has some water.</Notice>
        : drink.round ? (
          <div data-testid="drink-round">
            <p style={{ fontSize: big ? "1.8rem" : "1.2rem", margin: "0 0 6px" }}><b>{plainText(drink.round.title)}</b>{" "}
              <Badge tone="gold">{drink.round.units === 0 ? "water" : `${drink.round.units} drink${drink.round.units === 1 ? "" : "s"}`}</Badge></p>
            <p style={{ fontSize: f, margin: "0 0 6px" }}>{plainText(drink.round.text)}</p>
            <p className="muted" style={{ fontSize: f, margin: 0 }}>{drink.round.scope === "all" ? "Everyone taking part" : drink.round.names.map(plainText).join(", ")}: {drink.round.answered} of {drink.round.total} done. Tap out any time.</p>
          </div>
        ) : <p className="muted" style={{ fontSize: f }}>Next round at the next story beat.</p>}
      <ul style={{ margin: "var(--space-3) 0 0", paddingLeft: "1.2em", fontSize: f }}>
        {drink.rules.map((r) => <li key={r}>{plainText(r)}</li>)}
      </ul>
      <p className="muted" style={{ fontSize: big ? "1rem" : "var(--text-xs)", marginBottom: 0 }}>{drink.standardDrink} Drink water, eat something, and never drive after drinking.</p>
    </Card>
  );
}

/** A grown-up's own drinking card on their phone. */
export function DrinkTracker({ me, drink, act, busy }: { me: DrinkMe; drink?: DrinkPublic; act: (b: object) => Promise<unknown>; busy: boolean }) {
  const off = !!drink?.paused || !!drink?.stopped;
  const inn = me.mode === "in";
  const p = me.pending;
  return (
    <Card title="Tonight's drinking" data-testid="drink-tracker" style={{ marginTop: "var(--space-3)" }}>
      <p style={{ marginTop: 0 }}>
        {inn ? <Badge tone="gold" data-testid="drink-count">{me.units} of {me.limit} drinks</Badge> : <Badge tone="ghost">Mocktails and water</Badge>}{" "}
        <span className="muted">Water so far: {me.water}</span>
      </p>
      {off && <Notice>{drink?.stopped ? "Drinking is over for tonight. Water and snacks only." : "Drinking is paused. Have some water."}</Notice>}
      {inn && me.atLimit && <Notice data-testid="drink-limit">You have reached your limit. Water from here, and please do not drive.</Notice>}
      {p && !off && (
        <div data-testid="drink-pending" style={{ margin: "var(--space-3) 0" }}>
          <p style={{ margin: "0 0 4px" }}><b>{plainText(p.title)}</b></p>
          <p style={{ margin: "0 0 8px" }}>{plainText(p.text)}</p>
          <p className="muted" style={{ margin: "0 0 8px" }}>{p.units === 0 ? "Water and a snack." : inn ? `For you: ${p.units} drink${p.units === 1 ? "" : "s"}.` : "For you: a mocktail or water."}</p>
          {inn && me.paceHold && <Notice>Pace check: two drinks in 15 minutes. Have water and wait a few minutes, or tap out.</Notice>}
          <div className="sc-actions">
            <Button disabled={busy || (inn && p.units > 0 && (me.atLimit || me.paceHold))} onClick={() => act({ type: "drink", promptId: p.id, answer: "drank" })} data-testid="drink-drank">{inn && p.units > 0 ? "I drank it" : "Done"}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => act({ type: "drink", promptId: p.id, answer: "tapped" })} data-testid="drink-tap">Tap out, no penalty</Button>
          </div>
        </div>
      )}
      <div className="sc-actions" style={{ marginTop: "var(--space-2)" }}>
        {inn && <Button variant="secondary" disabled={busy || off || me.atLimit || me.paceHold} onClick={() => act({ type: "logDrink" })} data-testid="drink-log">Log a drink</Button>}
        <Button variant="secondary" disabled={busy} onClick={() => act({ type: "water" })} data-testid="drink-water">I had water</Button>
        <Button variant="ghost" disabled={busy || me.atLimit} onClick={() => { if (window.confirm("Stop drinking prompts for you tonight?")) void act({ type: "doneForNight" }); }} data-testid="drink-done">I am done for the night</Button>
      </div>
      <p className="muted" style={{ fontSize: "var(--text-xs)", marginBottom: 0 }}>Your tally is private to you and the host. {drink?.standardDrink}</p>
    </Card>
  );
}
