"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, ErrorNote, Field, Notice, Progress } from "@/components/kit";
import { estimate, PRICES, recommend, TIERS } from "@/lib/budget";
import { api, createGame, formatUsd, friendlyError, sendAction, useAction, validateWizardStep, WIZARD_STEPS, wizardProgress } from "@/lib/client";
import type { GameConfig, MediaPlan } from "@/lib/types";
import type { StoryDetail } from "@/lib/client";
import { AiModeCard } from "./AiModeCard";

const DEFAULT: GameConfig = {
  name: "", expected: { adults: 12, kids: 6, toddlers: 1 }, lengthMin: 120, spice: "medium", drinking: "adults",
  themePrompt: "", settingPrompt: "", tonePrompt: "", mustInclude: "", avoid: "", allowPlayerBackstory: true,
};

function Counter({ id, label, hint, value, min, max, onChange }: { id: string; label: string; hint: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="sc-count" role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className="sc-count__label">{label}</span>
      <div className="sc-count__row">
        <Button variant="secondary" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} data-testid={`${id}-minus`}>-</Button>
        <output className="sc-count__val" aria-live="polite" data-testid={`${id}-value`}>{value}</output>
        <Button variant="secondary" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} data-testid={`${id}-plus`}>+</Button>
      </div>
      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{hint}</span>
    </div>
  );
}

export default function NewRoom() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [cfg, setCfg] = useState<GameConfig>(DEFAULT);
  const [budget, setBudget] = useState(5);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [code, setCode] = useState("");
  const [stepErr, setStepErr] = useState("");
  const { busy, err, run } = useAction();
  const heading = useRef<HTMLHeadingElement>(null);
  // Replaying a saved story: ?story=ID. The story is fixed, so theme prompts do not apply.
  const [story, setStory] = useState<StoryDetail["story"] | null>(null);
  const [storyMode, setStoryMode] = useState<"random" | "choose">("random");
  const [storyErr, setStoryErr] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("story");
    if (!id) return;
    api<StoryDetail>(`/api/stories/${encodeURIComponent(id)}`)
      .then((d) => { setStory(d.story); setStoryMode(d.story.kind === "cast" ? "choose" : "random"); })
      .catch(() => setStoryErr("That saved story could not be found. You can still set up a new game."));
  }, []);

  const [botCount, setBotCount] = useState(0);
  const players = cfg.expected.adults + cfg.expected.kids + cfg.expected.toddlers + botCount;
  const rec = useMemo(() => recommend(budget, players), [budget, players]);
  const localAi = cfg.aiMode === "local";
  const activePlan: MediaPlan = plan ?? (localAi ? TIERS[4].plan : rec.best?.plan ?? TIERS[0].plan);
  const est = localAi ? { lines: [{ label: "Local services (no per-picture cost)", usd: 0 }], total: 0 } : estimate(activePlan, players);
  const over = est.total > budget;
  const set = <K extends keyof GameConfig>(k: K, v: GameConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const input = { expected: cfg.expected, bots: botCount, drinking: cfg.drinking, attested: cfg.drinkingAttested === true, adultsOnly: cfg.adultsOnly === true, adultsAttested: cfg.adultsAttested === true, overrideCode: code, budget };
  const total = WIZARD_STEPS.length;
  const prog = wizardProgress(step, total);

  useEffect(() => { heading.current?.focus(); }, [step]);

  function go(to: number) {
    if (to > step) { const m = validateWizardStep(step, input); if (m) { setStepErr(m); return; } }
    setStepErr(""); setStep(to);
  }
  async function create() {
    const m = validateWizardStep(4, input) || validateWizardStep(3, input);
    if (m) { setStepErr(m); return; }
    const r = await run(() => createGame({ overrideCode: code, config: cfg, capUsd: budget, plan: activePlan, ...(story ? { storyId: story.id, storyMode } : {}) }));
    if (r) {
      // AI guests are added right after the room exists, so the lobby already has them.
      if (botCount > 0) { try { await sendAction(r.code, { type: "addBots", count: botCount }); } catch { /* the host can add them from the lobby */ } }
      router.push(`/host/${r.code}`);
    }
  }

  return (
    <main className="sc-page" data-testid="wizard">
      <nav aria-label="Progress">
        <ol className="sc-steps" data-testid="wizard-steps">
          {WIZARD_STEPS.map((n, i) => (
            <li key={n} aria-current={i + 1 === step ? "step" : undefined} data-done={i + 1 < step}>{i + 1}. {n}</li>
          ))}
        </ol>
      </nav>
      <Progress value={prog.step} max={prog.total} label={`Step ${prog.step} of ${prog.total}`} data-testid="wizard-progress" />

      {step === 1 && (
        <div className="sc-gap" data-testid="wizard-step-1" style={{ marginTop: "var(--space-4)" }}>
          <div>
            <h1 ref={heading} tabIndex={-1}>Who is coming?</h1>
            <p className="sc-lead">A rough head count is enough. People can still join later.</p>
          </div>
          {storyErr && <ErrorNote>{storyErr}</ErrorNote>}
          {story ? (
            <Card title="Replaying a saved story" tone="glow" data-testid="wizard-story">
              <p style={{ marginTop: 0 }}><b>{story.title}</b><br /><span className="muted">{story.blurb || story.setting}</span></p>
              {story.kind === "cast" ? (
                <>
                  <label className="sc-check"><input type="radio" name="smode" checked={storyMode === "choose"} onChange={() => setStoryMode("choose")} data-testid="story-mode-choose" /><span><b>Players choose their character</b> when they join.</span></label>
                  <label className="sc-check"><input type="radio" name="smode" checked={storyMode === "random"} onChange={() => setStoryMode("random")} data-testid="story-mode-random" /><span>Cast players at random.</span></label>
                </>
              ) : <p className="muted">Players are cast at random.</p>}
              <p className="muted" style={{ fontSize: "var(--text-xs)", marginBottom: 0 }}>The plot and solution are fixed and sealed, so you can play too. <a href="/host/new">Start a brand new story instead</a>.</p>
            </Card>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Want a mystery someone else already played? <a href="/stories">Browse saved stories</a>.</p>
          )}
          <Card>
            <Field label="Party name" hint="Leave it blank and the Game Master will pick one.">
              <input value={cfg.name} maxLength={60} placeholder="GM's pick" data-testid="field-name" onChange={(e) => set("name", e.target.value)} />
            </Field>
            <div className="sc-counts">
              <Counter id="adults" label="Grown-ups" hint="At least 2" value={cfg.expected.adults} min={0} max={40} onChange={(n) => set("expected", { ...cfg.expected, adults: n })} />
              {cfg.adultsOnly !== true && <Counter id="kids" label="Kids 6 to 15" hint="Welcome!" value={cfg.expected.kids} min={0} max={30} onChange={(n) => set("expected", { ...cfg.expected, kids: n })} />}
              {cfg.adultsOnly !== true && <Counter id="toddlers" label="Little ones 1 to 5" hint="A grown-up helps" value={cfg.expected.toddlers} min={0} max={10} onChange={(n) => set("expected", { ...cfg.expected, toddlers: n })} />}
            </div>
            <div className="sc-counts" style={{ marginTop: "var(--space-3)" }} data-testid="wizard-bots">
              <Counter id="bots" label="AI guests" hint="Extra suspects that chat and speak. They count as grown-ups." value={botCount} min={0} max={8} onChange={setBotCount} />
            </div>
          </Card>
          <Card title="Who is playing?">
            <label className="sc-check">
              <input type="checkbox" checked={cfg.adultsOnly === true} data-testid="field-adults-only"
                onChange={(e) => setCfg((c) => ({ ...c, adultsOnly: e.target.checked, adultsAttested: e.target.checked ? c.adultsAttested : false, expected: e.target.checked ? { ...c.expected, kids: 0, toddlers: 0 } : c.expected }))} />
              <span><b>Adults only (unfiltered).</b> Dark, taboo, Cards Against Humanity style humor, with scandalous characters like escorts, swingers, dealers and cult leaders. No kids, teens or little ones can join.</span>
            </label>
            {cfg.adultsOnly === true && (
              <div data-testid="adults-warning">
                <Notice>
                  Expect crude jokes, profanity and shameless secrets. It is still fiction and a mystery game: there is never sexual abuse or violence, nothing involving minors, no slurs, no real people, and anyone can say &quot;Pass&quot;. Pictures and the TV stay tame.
                </Notice>
                <label className="sc-check">
                  <input type="checkbox" checked={cfg.adultsAttested === true} onChange={(e) => set("adultsAttested", e.target.checked)} data-testid="adults-attest" />
                  <span>I confirm everyone playing is 18 or older, nobody under 18 is in the room, and everyone chose this kind of game.</span>
                </label>
              </div>
            )}
          </Card>
          <Card>
            <Field label="Length">
              <select value={cfg.lengthMin} data-testid="field-length" onChange={(e) => set("lengthMin", +e.target.value as GameConfig["lengthMin"])}>
                <option value={90}>90 minutes</option><option value={120}>2 hours</option><option value={150}>2.5 hours</option>
              </select>
            </Field>
            <Field label="Grown-up spice" hint="Kids always get a family-friendly version.">
              <select value={cfg.spice} data-testid="field-spice" onChange={(e) => set("spice", e.target.value as GameConfig["spice"])}>
                <option value="mild">Mild (cheeky)</option><option value="medium">Medium (innuendo)</option><option value="spicy">Spicy-ish (PG-13+, adult cards only)</option>
              </select>
            </Field>
            <Field label="Drinking" hint={cfg.drinking === "heavy" ? "Grown-ups opt in and set their own limit. Kids never take part." : "Always optional, with a non-alcohol swap."}>
              <select value={cfg.drinking} data-testid="field-drinking" onChange={(e) => set("drinking", e.target.value as GameConfig["drinking"])}>
                <option value="adults">Optional sips for grown-ups</option><option value="heavy">Heavy drinking night (grown-ups only)</option><option value="none">Alcohol-free game</option>
              </select>
            </Field>
            {cfg.drinking === "heavy" && (
              <div data-testid="heavy-warning">
                <Notice>
                  Heavy night: drink prompts are real drinks, every round of the game, for grown-ups who opt in. Each person picks a personal limit (2 to 6 standard drinks for the night) and the game stops prompting them at it. They can tap out any time with no penalty, mocktails count the same, there is a water and snack break, a pace guard, and a host stop button. Children, teens and AI guests are never part of it.
                </Notice>
                <label className="sc-check">
                  <input type="checkbox" checked={cfg.drinkingAttested === true} onChange={(e) => set("drinkingAttested", e.target.checked)} data-testid="heavy-attest" />
                  <span>I confirm everyone who will drink is of legal drinking age where we are and chooses to take part, and that we will arrange safe rides home.</span>
                </label>
              </div>
            )}
          </Card>
        </div>
      )}

      {step === 2 && (
        <div className="sc-gap" data-testid="wizard-step-2" style={{ marginTop: "var(--space-4)" }}>
          <div>
            <h1 ref={heading} tabIndex={-1}>What is the story?</h1>
            <p className="sc-lead">Every box is optional. Blank means the Game Master surprises you.</p>
          </div>
          {story && <Notice data-testid="wizard-story-note">You are replaying &quot;{story.title}&quot;, so the story is already written. These boxes are ignored; spice and drinking still apply.</Notice>}
          <Card>
            <Field label="Theme or story idea"><input value={cfg.themePrompt} placeholder="e.g. a cruise ship karaoke night" data-testid="field-theme" onChange={(e) => set("themePrompt", e.target.value)} /></Field>
            <Field label="Setting"><input value={cfg.settingPrompt} placeholder="e.g. a snowed-in ski lodge" data-testid="field-setting" onChange={(e) => set("settingPrompt", e.target.value)} /></Field>
            <Field label="Tone"><input value={cfg.tonePrompt} placeholder="e.g. slapstick, over-the-top villains" data-testid="field-tone" onChange={(e) => set("tonePrompt", e.target.value)} /></Field>
            <Field label="Must include"><input value={cfg.mustInclude} placeholder="e.g. a talking parrot" data-testid="field-include" onChange={(e) => set("mustInclude", e.target.value)} /></Field>
            <Field label="Please avoid"><input value={cfg.avoid} placeholder="e.g. clowns" data-testid="field-avoid" onChange={(e) => set("avoid", e.target.value)} /></Field>
            <label className="sc-check">
              <input type="checkbox" checked={cfg.allowPlayerBackstory} data-testid="field-backstory" onChange={(e) => set("allowPlayerBackstory", e.target.checked)} />
              <span>Let players add their own ideas or backstory</span>
            </label>
          </Card>
        </div>
      )}

      {step === 3 && (
        <div className="sc-gap" data-testid="wizard-step-3" style={{ marginTop: "var(--space-4)" }}>
          <div>
            <h1 ref={heading} tabIndex={-1}>Pictures and video</h1>
            <p className="sc-lead">The AI can draw your guests into the story. Pick a budget and see what it buys. The server never spends past it.</p>
          </div>
          <AiModeCard value={cfg.aiMode ?? "auto"} onChange={(m) => set("aiMode", m)} />
          <Card>
            <Field label="Most you want to spend on AI (USD)" hint={rec.summary} error={validateWizardStep(3, input)}>
              <input type="number" inputMode="decimal" min={0} max={500} step={1} value={Number.isNaN(budget) ? "" : budget} data-testid="field-budget"
                onChange={(e) => { setBudget(e.target.value === "" ? Number.NaN : +e.target.value); setPlan(null); }} />
            </Field>
          </Card>
          <fieldset className="sc-choices" data-testid="tier-list">
            <legend>Choose a package</legend>
            {TIERS.map((t) => {
              const cost = estimate(t.plan, players).total;
              const fits = cost <= rec.usable;
              const chosen = JSON.stringify({ ...activePlan, paused: false }) === JSON.stringify({ ...t.plan, paused: false });
              return (
                <label key={t.id} className="sc-choice" data-dim={!fits}>
                  <input type="radio" name="tier" checked={chosen} onChange={() => setPlan(t.plan)} data-testid={`tier-${t.id}`} />
                  <span className="sc-choice__face">
                    <span className="sc-choice__title">{t.name} {rec.best?.id === t.id && <Badge tone="gold">recommended</Badge>}</span>
                    <span className="sc-choice__desc">{t.blurb}</span>
                    <span className="sc-choice__desc">About {formatUsd(cost)}{fits ? "" : " (over budget)"}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <details className="sc-panel" data-testid="finetune">
            <summary>Fine-tune</summary>
            <div className="sc-panel__body">
              <label className="sc-check">
                <input type="checkbox" checked={activePlan.avatars} onChange={(e) => setPlan({ ...activePlan, avatars: e.target.checked })} />
                <span>Cartoon portrait for every player</span>
              </label>
              <Field label="Scene pictures per act">
                <select value={activePlan.scenesPerAct} onChange={(e) => setPlan({ ...activePlan, scenesPerAct: +e.target.value as MediaPlan["scenesPerAct"] })}>
                  <option value={0}>None</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                </select>
              </Field>
              <Field label="Video clips (6 seconds each)">
                <select value={activePlan.videoClips} onChange={(e) => setPlan({ ...activePlan, videoClips: +e.target.value as MediaPlan["videoClips"] })}>
                  <option value={0}>None</option><option value={1}>1 (the death)</option><option value={2}>2 (+ the reveal)</option><option value={3}>3 (+ the twist)</option><option value={4}>4 (+ the party)</option>
                </select>
              </Field>
              <Field label="Image quality">
                <select value={activePlan.quality} onChange={(e) => setPlan({ ...activePlan, quality: e.target.value as MediaPlan["quality"] })}>
                  <option value="standard">Standard</option><option value="premium">Premium</option>
                </select>
              </Field>
            </div>
          </details>
          <Card title="Estimate" data-testid="estimate">
            <dl className="sc-dl">
              {est.lines.map((l) => (<div key={l.label} style={{ display: "contents" }}><dt>{l.label}</dt><dd>{formatUsd(l.usd)}</dd></div>))}
              <dt><b>Total</b></dt><dd data-testid="estimate-total">{formatUsd(est.total)}</dd>
            </dl>
            {over && <ErrorNote>Above your {formatUsd(budget)} budget. Extras are skipped automatically once it is used up.</ErrorNote>}
            <p className="muted" style={{ fontSize: "var(--text-xs)" }}>Estimates only (image about {formatUsd(PRICES.imageStandard)}, video about {formatUsd(PRICES.videoPerSecond)} per second).</p>
          </Card>
        </div>
      )}

      {step === 4 && (
        <div className="sc-gap" data-testid="wizard-step-4" style={{ marginTop: "var(--space-4)" }}>
          <div>
            <h1 ref={heading} tabIndex={-1}>Your secret code</h1>
            <p className="sc-lead">Only you can peek at spoilers, and only with this code. Do not say it out loud. It cannot be recovered, and the AI never sees it.</p>
          </div>
          <Card tone="secret">
            <Field label="Host override code" hint="At least 4 characters." required>
              <input type="password" autoComplete="off" value={code} placeholder="your secret" data-testid="field-override" onChange={(e) => setCode(e.target.value)} />
            </Field>
          </Card>
          <Card title="Summary" data-testid="summary">
            <ul className="clean">
              <li>{cfg.name || "Party name: GM's pick"}, {cfg.lengthMin} min, {cfg.adultsOnly ? "adults only, unfiltered" : cfg.spice}, {cfg.drinking === "none" ? "alcohol-free" : cfg.drinking === "heavy" ? "heavy drinking night" : "optional sips"}</li>
              <li>About {players} players ({cfg.expected.adults} grown-ups, {cfg.expected.kids} kids, {cfg.expected.toddlers} little ones{botCount ? `, ${botCount} AI guest${botCount === 1 ? "" : "s"}` : ""})</li>
              <li>Budget {formatUsd(budget || 0)}, estimate {formatUsd(est.total)}</li>
            </ul>
          </Card>
        </div>
      )}

      {stepErr && <ErrorNote data-testid="wizard-error">{stepErr}</ErrorNote>}
      {err && <ErrorNote data-testid="wizard-create-error">{friendlyError(err)}</ErrorNote>}

      <div className="sc-sticky">
        {step > 1 && <Button variant="secondary" onClick={() => go(step - 1)} data-testid="wizard-back">Back</Button>}
        {step < total
          ? <Button size="lg" onClick={() => go(step + 1)} data-testid="wizard-next">Next: {WIZARD_STEPS[step]}</Button>
          : <Button size="lg" loading={busy} disabled={code.trim().length < 4} onClick={create} data-testid="wizard-create">Create game</Button>}
      </div>
    </main>
  );
}
