"use client";
import { Button, Field, Progress } from "@/components/kit";
import { PRICES } from "@/lib/budget";
import { askConfirm, formatUsd } from "@/lib/client";
import type { HostState } from "@/app/_views";

export function BudgetPanel({ state, act, capInput, setCapInput }: {
  state: HostState; act: (b: object) => Promise<unknown>; capInput: string; setCapInput: (v: string) => void;
}) {
  const b = state.budget;
  const used = b.spentUsd + b.reservedUsd;
  const counts = state.jobs.reduce<Record<string, number>>((m, j) => ({ ...m, [j.status]: (m[j.status] ?? 0) + 1 }), {});
  const plan = b.plan;
  const setPlan = (patch: object) => act({ type: "setPlan", plan: patch });
  return (
    <div data-testid="budget-panel">
      <Progress value={Math.min(used, b.capUsd)} max={b.capUsd || 1} label="Budget used" data-testid="budget-progress" />
      <p>Spent <b>{formatUsd(b.spentUsd)}</b>, reserved {formatUsd(b.reservedUsd)}, budget <b>{formatUsd(b.capUsd)}</b>. The server never spends past the budget.</p>
      <label className="sc-check"><input type="checkbox" checked={plan.avatars} data-testid="plan-avatars" onChange={(e) => setPlan({ avatars: e.target.checked })} /><span>Portraits</span></label>
      <Field label="Scene pictures per act">
        <select value={plan.scenesPerAct} data-testid="plan-scenes" onChange={(e) => setPlan({ scenesPerAct: +e.target.value })}>
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n} scene{n === 1 ? "" : "s"} per act</option>)}
        </select>
      </Field>
      <Field label="Video clips">
        <select value={plan.videoClips} data-testid="plan-videos" onChange={(e) => setPlan({ videoClips: +e.target.value })}>
          {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} video clip{n === 1 ? "" : "s"}</option>)}
        </select>
      </Field>
      <Field label="Image quality">
        <select value={plan.quality} data-testid="plan-quality" onChange={(e) => setPlan({ quality: e.target.value })}>
          <option value="standard">Standard</option><option value="premium">Premium</option>
        </select>
      </Field>
      <div className="sc-actions">
        <Button variant="secondary" data-testid="plan-pause" onClick={() => setPlan({ paused: !plan.paused })}>{plan.paused ? "Resume AI media" : "Pause AI media"}</Button>
        <Button variant="danger" data-testid="purge-photos" onClick={() => askConfirm("Delete all uploaded player photos now? Portraits already made are kept.") && act({ type: "purgePhotos" })}>Delete player photos</Button>
      </div>
      <Field label="Change budget (USD)">
        <input type="number" inputMode="decimal" min={0} step={1} placeholder={`Now ${b.capUsd}`} value={capInput} data-testid="budget-input" onChange={(e) => setCapInput(e.target.value)} />
      </Field>
      <Button variant="secondary" disabled={capInput === ""} data-testid="budget-save" onClick={() => { act({ type: "setPlan", capUsd: +capInput }); setCapInput(""); }}>Save budget</Button>
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
        Queue: {Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "empty"}. About {formatUsd(PRICES.imageStandard)} per image and {formatUsd(PRICES.videoSeconds * PRICES.videoPerSecond)} per clip. Over-budget jobs are skipped.
      </p>
      {state.jobs.filter((j) => j.status === "failed" || j.status === "skipped").slice(-4).map((j) => (
        <p key={j.id} className="muted" style={{ fontSize: "var(--text-xs)", margin: 0 }}>{j.kind} ({j.phase}) {j.status}: {j.note}</p>
      ))}
    </div>
  );
}
