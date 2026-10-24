"use client";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { PhotoPicker, uploadPhoto } from "@/components/PhotoUploader";
import { Badge, Brand, Button, Card, ErrorNote, Field, Notice } from "@/components/kit";
import { api, canJoin, joinGame, normalizeCode, saveCreds, useAction, useDocTitle } from "@/lib/client";
import type { AgeGroup } from "@/lib/types";

type Mode = "gm" | "hint" | "own";
const MODES: [Mode, string, string][] = [
  ["gm", "Surprise me", "The Game Master invents everything."],
  ["hint", "Give the GM an idea", "Hobbies, quirks, a catchphrase. It gets woven in."],
  ["own", "I will write my own", "Your words go on your card as written."],
];

export default function JoinBuilder({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode(use(params).code);
  const router = useRouter();
  const [name, setName] = useState("");
  const [age, setAge] = useState<AgeGroup>("adult");
  const [wantsVictim, setWV] = useState(false);
  const [mode, setMode] = useState<Mode>("gm");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob | null; consent: "self" | "guardian" | null }>({ blob: null, consent: null });
  const [photoNote, setPhotoNote] = useState("");
  const { busy, err, run } = useAction();
  useDocTitle(`Join ${code}`);

  // Replaying a saved story where players choose their character.
  type Opt = { id: string; name: string; house: string; tease: string; kid: boolean; taken: boolean };
  const [options, setOptions] = useState<Opt[] | null>(null);
  const [choice, setChoice] = useState("");
  useEffect(() => {
    api<{ characters: Opt[] }>(`/api/rooms/${code}/characters`).then((r) => setOptions(r.characters)).catch(() => setOptions(null));
  }, [code]);

  const toddler = age === "little";
  const ok = canJoin({ name, age, mode, text, photoBlob: !!photo.blob, photoConsent: !!photo.consent });

  async function join() {
    const r = await run(() => joinGame(code, {
      name: name.trim(), ageGroup: age, wantsVictim, ...(choice ? { characterChoice: choice } : {}),
      profile: { backstoryMode: toddler ? "gm" : mode, backstory: mode === "gm" || toddler ? "" : text },
    }));
    if (!r) return;
    const creds = { pid: r.playerId, tok: r.token };
    saveCreds(code, creds);
    if (photo.blob && photo.consent) {
      try { await uploadPhoto(code, creds, photo.blob, photo.consent); }
      catch (e) { setPhotoNote(`You are in! The photo was not accepted (${(e as Error).message}). You can try again from your card.`); }
    }
    router.push(`/play/${code}`);
  }

  return (
    <main className="sc-page" data-testid="join-builder">
      <Brand />
      <p className="sc-badge-room"><Badge tone="gold" data-testid="join-room">Room {code}</Badge></p>
      <h1>Build your character</h1>
      <p className="sc-lead">The Game Master will cast you as a suspect, witness or helper. Tell us a little, or be surprised.</p>

      <div className="sc-gap">
        <Card title="Who are you?">
          <Field label="Your name" required>
            <input value={name} maxLength={24} autoComplete="given-name" data-testid="join-name" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Your age group">
            <select value={age} data-testid="join-age" onChange={(e) => setAge(e.target.value as AgeGroup)}>
              <option value="adult">Grown-up</option><option value="teen">Teen (13 to 15)</option><option value="kid">Kid (6 to 12)</option><option value="little">Little one (1 to 5), a grown-up helps</option>
            </select>
          </Field>
          {(age === "kid" || age === "teen") && (
            <label className="sc-check">
              <input type="checkbox" checked={wantsVictim} data-testid="join-victim" onChange={(e) => setWV(e.target.checked)} />
              <span>I want to be the victim and come back as the Ghost!</span>
            </label>
          )}
        </Card>
        {options && (
          <Card title="Choose your character" data-testid="join-characters">
            <p className="muted" style={{ marginTop: 0 }}>Pick who you want to be, or leave it to the Game Master. Characters other players already asked for are greyed out. {age === "adult" ? "Showing grown-up characters." : "Showing young characters."}</p>
            <div className="sc-actions">
              <Button variant={choice === "" ? "primary" : "secondary"} onClick={() => setChoice("")} data-testid="char-surprise">Surprise me</Button>
            </div>
            <ul className="clean">
              {options.filter((o) => o.kid === (age !== "adult")).map((o) => (
                <li key={o.id}>
                  <Button variant={choice === o.id ? "primary" : "secondary"} className="sc-pick" disabled={o.taken} onClick={() => setChoice(o.id)} data-testid={`char-${o.id}`}>
                    <b>{o.name}</b> <span className="muted">{o.house}</span><br /><span className="muted">{o.tease}</span>{o.taken ? " (taken)" : ""}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {!toddler && (
          <Card title="Your backstory">
            <fieldset className="sc-choices" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="sr-only">How should your backstory be written?</legend>
              {MODES.map(([m, t, d]) => (
                <label key={m} className="sc-choice">
                  <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} data-testid={`join-mode-${m}`} />
                  <span className="sc-choice__face"><span className="sc-choice__title">{t}</span><span className="sc-choice__desc">{d}</span></span>
                </label>
              ))}
            </fieldset>
            {mode !== "gm" && (
              <Field label={mode === "hint" ? "Your idea" : "Your backstory"} hint={`${text.length} of 600. Keep it fun and made up. Please do not share real secrets about anyone.`}>
                <textarea rows={4} maxLength={600} value={text} data-testid="join-text"
                  placeholder={mode === "hint" ? "I am obsessed with sourdough and tell everyone about my starter." : "I am a retired circus strongman who now runs a bakery."}
                  onChange={(e) => setText(e.target.value)} />
              </Field>
            )}
          </Card>
        )}

        <PhotoPicker isAdult={age === "adult"} onChange={setPhoto} />
      </div>

      {err && <ErrorNote data-testid="join-error">{err}</ErrorNote>}
      {photoNote && <Notice data-testid="join-photo-note">{photoNote}</Notice>}
      <div className="sc-sticky">
        <Button size="lg" loading={busy} disabled={!ok} onClick={join} data-testid="join-submit">Join the party</Button>
      </div>
    </main>
  );
}
