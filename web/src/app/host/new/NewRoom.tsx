"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { estimate, PRICES, recommend, TIERS } from "@/lib/budget";
import { api } from "@/lib/client";
import type { GameConfig, MediaPlan } from "@/lib/types";

const DEFAULT: GameConfig = {
  name: "", expected: { adults: 12, kids: 6, toddlers: 1 }, lengthMin: 120, spice: "medium", drinking: "adults",
  themePrompt: "", settingPrompt: "", tonePrompt: "", mustInclude: "", avoid: "", allowPlayerBackstory: true,
};

const money = (n: number) => `$${n.toFixed(2)}`;

export default function NewRoom() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [cfg, setCfg] = useState<GameConfig>(DEFAULT);
  const [budget, setBudget] = useState(5);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const players = cfg.expected.adults + cfg.expected.kids + cfg.expected.toddlers;
  const rec = useMemo(() => recommend(budget, players), [budget, players]);
  const activePlan: MediaPlan = plan ?? rec.best?.plan ?? TIERS[0].plan;
  const est = estimate(activePlan, players);
  const over = est.total > budget;
  const set = <K extends keyof GameConfig>(k: K, v: GameConfig[K]) => setCfg({ ...cfg, [k]: v });

  async function create() {
    setBusy(true); setErr("");
    try {
      const r = await api<{ code: string }>("/api/rooms", { overrideCode: code, config: cfg, capUsd: budget, plan: activePlan });
      router.push(`/host/${r.code}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <main>
      <p className="muted">Step {step} of 3</p>
      {step === 1 && (
        <>
          <h1>Set up your game</h1>
          <p className="muted">Leave any prompt blank and the AI Game Master will pick something fun.</p>
          <div className="card">
            <label htmlFor="name">Party name</label>
            <input id="name" value={cfg.name} maxLength={60} placeholder="GM's pick" onChange={(e) => set("name", e.target.value)} />
            <div className="row" style={{ marginTop: 6 }}>
              <div style={{ flex: 1, minWidth: 90 }}><label>Adults</label><input type="number" min={2} max={40} value={cfg.expected.adults} onChange={(e) => set("expected", { ...cfg.expected, adults: +e.target.value })} /></div>
              <div style={{ flex: 1, minWidth: 90 }}><label>Kids (6-15)</label><input type="number" min={0} max={30} value={cfg.expected.kids} onChange={(e) => set("expected", { ...cfg.expected, kids: +e.target.value })} /></div>
              <div style={{ flex: 1, minWidth: 90 }}><label>Toddlers (1-5)</label><input type="number" min={0} max={10} value={cfg.expected.toddlers} onChange={(e) => set("expected", { ...cfg.expected, toddlers: +e.target.value })} /></div>
            </div>
            <div className="row">
              <div style={{ flex: 1, minWidth: 140 }}>
                <label>Length</label>
                <select value={cfg.lengthMin} onChange={(e) => set("lengthMin", +e.target.value as GameConfig["lengthMin"])}>
                  <option value={90}>90 minutes</option><option value={120}>2 hours</option><option value={150}>2.5 hours</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label>Adult spice</label>
                <select value={cfg.spice} onChange={(e) => set("spice", e.target.value as GameConfig["spice"])}>
                  <option value="mild">Mild (cheeky)</option><option value="medium">Medium (innuendo)</option><option value="spicy">Spicy-ish (PG-13+, adult cards only)</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label>Drinking</label>
                <select value={cfg.drinking} onChange={(e) => set("drinking", e.target.value as GameConfig["drinking"])}>
                  <option value="adults">Optional sips for adults</option><option value="none">Alcohol-free game</option>
                </select>
              </div>
            </div>
          </div>
          <div className="card">
            <label htmlFor="theme">Theme or story idea</label>
            <input id="theme" value={cfg.themePrompt} placeholder="GM's pick. e.g. a cruise ship karaoke night" onChange={(e) => set("themePrompt", e.target.value)} />
            <label htmlFor="setting">Setting and environment</label>
            <input id="setting" value={cfg.settingPrompt} placeholder="GM's pick. e.g. a snowed-in 1980s ski lodge" onChange={(e) => set("settingPrompt", e.target.value)} />
            <label htmlFor="tone">Tone</label>
            <input id="tone" value={cfg.tonePrompt} placeholder="GM's pick. e.g. slapstick, over-the-top villains" onChange={(e) => set("tonePrompt", e.target.value)} />
            <label htmlFor="inc">Must include</label>
            <input id="inc" value={cfg.mustInclude} placeholder="Optional. e.g. a talking parrot, Grandpa's famous chili" onChange={(e) => set("mustInclude", e.target.value)} />
            <label htmlFor="avoid">Please avoid</label>
            <input id="avoid" value={cfg.avoid} placeholder="Optional. e.g. clowns, hospitals" onChange={(e) => set("avoid", e.target.value)} />
            <label><input type="checkbox" checked={cfg.allowPlayerBackstory} onChange={(e) => set("allowPlayerBackstory", e.target.checked)} />Let players add their own ideas or backstory</label>
          </div>
          <button onClick={() => setStep(2)}>Next: budget</button>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Pictures and video</h1>
          <p className="muted">The AI can draw your players into the story from their photos, or even make short video clips. Tell us your budget and we will show what it buys. You stay in control and can change it during the game.</p>
          <div className="card">
            <label htmlFor="budget">Most you are willing to spend on AI (USD)</label>
            <input id="budget" type="number" min={0} max={500} step={1} value={budget} onChange={(e) => { setBudget(+e.target.value); setPlan(null); }} />
            <p><b>{rec.summary}</b></p>
          </div>

          <div className="grid">
            {TIERS.map((t) => {
              const cost = estimate(t.plan, players).total;
              const fits = cost <= rec.usable;
              const chosen = JSON.stringify({ ...activePlan, paused: false }) === JSON.stringify({ ...t.plan, paused: false });
              return (
                <div key={t.id} className="card" style={{ opacity: fits ? 1 : 0.55, borderColor: chosen ? "var(--accent)" : undefined, borderWidth: chosen ? 2 : 1 }}>
                  <b>{t.name}</b> {rec.best?.id === t.id && <span className="pill">recommended</span>}
                  <p className="muted" style={{ margin: "4px 0" }}>{t.blurb}</p>
                  <p style={{ margin: "4px 0" }}>about {money(cost)}</p>
                  <button className="ghost" onClick={() => setPlan(t.plan)}>{chosen ? "Selected" : fits ? "Choose" : "Choose anyway"}</button>
                </div>
              );
            })}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Fine-tune</h2>
            <label><input type="checkbox" checked={activePlan.avatars} onChange={(e) => setPlan({ ...activePlan, avatars: e.target.checked })} />Cartoon portrait for every player (uses their photo if they upload one)</label>
            <div className="row">
              <div style={{ flex: 1, minWidth: 150 }}>
                <label>Scene pictures per act</label>
                <select value={activePlan.scenesPerAct} onChange={(e) => setPlan({ ...activePlan, scenesPerAct: +e.target.value as MediaPlan["scenesPerAct"] })}>
                  <option value={0}>None</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label>Video clips (6 seconds each)</label>
                <select value={activePlan.videoClips} onChange={(e) => setPlan({ ...activePlan, videoClips: +e.target.value as MediaPlan["videoClips"] })}>
                  <option value={0}>None</option><option value={1}>1 (the death)</option><option value={2}>2 (+ the reveal)</option><option value={3}>3 (+ the twist)</option><option value={4}>4 (+ the party)</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label>Image quality</label>
                <select value={activePlan.quality} onChange={(e) => setPlan({ ...activePlan, quality: e.target.value as MediaPlan["quality"] })}>
                  <option value="standard">Standard</option><option value="premium">Premium</option>
                </select>
              </div>
            </div>
            <ul className="clean" style={{ marginTop: 12 }}>
              {est.lines.map((l) => <li key={l.label}>{l.label}<span style={{ float: "right" }}>{money(l.usd)}</span></li>)}
              <li><b>Estimated total</b><b style={{ float: "right" }}>{money(est.total)}</b></li>
            </ul>
            {over && <p className="err">This is above your {money(budget)} budget. Extras are skipped automatically once the budget is used up.</p>}
            <p className="muted" style={{ fontSize: ".85rem" }}>
              Estimates only (image about {money(PRICES.imageStandard)}, video about {money(PRICES.videoPerSecond)}/second). Spending is hard-capped at your budget, so the AI can never exceed it.
            </p>
          </div>
          <div className="row"><button className="ghost" onClick={() => setStep(1)}>Back</button><button onClick={() => setStep(3)}>Next: secret code</button></div>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Your secret code</h1>
          <div className="card">
            <label htmlFor="oc">Host Override Code</label>
            <input id="oc" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="at least 4 characters" />
            <p className="muted">Only you can see spoilers, and only with this code: nudges, advanced clues, fast-forward, and the final answer. Don&apos;t say it aloud. It can&apos;t be recovered, and the AI never sees it.</p>
          </div>
          <div className="card">
            <b>Summary</b>
            <ul className="clean">
              <li>{cfg.name || "Party name: GM's pick"} · {cfg.lengthMin} min · {cfg.spice} · {cfg.drinking === "none" ? "alcohol-free" : "optional sips"}</li>
              <li>About {players} players ({cfg.expected.adults} adults, {cfg.expected.kids} kids, {cfg.expected.toddlers} toddlers)</li>
              <li>Budget {money(budget)} · estimate {money(est.total)}</li>
            </ul>
          </div>
          {err && <p className="err">{err}</p>}
          <div className="row">
            <button className="ghost" onClick={() => setStep(2)}>Back</button>
            <button disabled={busy || code.trim().length < 4} onClick={create}>Create game and get invite link</button>
          </div>
        </>
      )}
    </main>
  );
}
