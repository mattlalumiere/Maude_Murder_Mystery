"use client";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { PhotoPicker, resizeToJpeg, uploadPhoto } from "@/components/PhotoUploader";
import { api } from "@/lib/client";
import type { AgeGroup } from "@/lib/types";

type Mode = "gm" | "hint" | "own";

export default function JoinBuilder({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const router = useRouter();
  const [name, setName] = useState("");
  const [age, setAge] = useState<AgeGroup>("adult");
  const [wantsVictim, setWV] = useState(false);
  const [mode, setMode] = useState<Mode>("gm");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob | null; consent: "self" | "guardian" | null }>({ blob: null, consent: null });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdult = age === "adult";
  const toddler = age === "little";
  const photoReady = !photo.blob || !!photo.consent;

  async function join() {
    setBusy(true); setErr("");
    try {
      const r = await api<{ playerId: string; token: string }>(`/api/rooms/${code}/join`, {
        name, ageGroup: age, wantsVictim,
        profile: { backstoryMode: mode, backstory: mode === "gm" ? "" : text },
      });
      const creds = { pid: r.playerId, tok: r.token };
      try { localStorage.setItem(`mm:${code}`, JSON.stringify(creds)); } catch {}
      if (photo.blob && photo.consent) {
        try { await uploadPhoto(code, creds, photo.blob, photo.consent); }
        catch (e) { setErr(`You are in, but the photo was not accepted: ${(e as Error).message}`); setBusy(false); router.push(`/play/${code}`); return; }
      }
      router.push(`/play/${code}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <main>
      <p className="muted">Room {code}</p>
      <h1>Build your character</h1>
      <p className="muted">The AI Game Master will cast you as a suspect, witness, or helper. Tell us a little about yourself, or let it surprise you.</p>

      <div className="card">
        <label htmlFor="n">Your name</label>
        <input id="n" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="a">Your age group</label>
        <select id="a" value={age} onChange={(e) => setAge(e.target.value as AgeGroup)}>
          <option value="adult">Grown-up</option><option value="teen">Teen (13-15)</option><option value="kid">Kid (6-12)</option><option value="little">Little kid (1-5), a grown-up joins for them</option>
        </select>
        {(age === "kid" || age === "teen") && (
          <label><input type="checkbox" checked={wantsVictim} onChange={(e) => setWV(e.target.checked)} />I want to be the victim and come back as the Ghost!</label>
        )}
      </div>

      {!toddler && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Your backstory</h2>
          {([
            ["gm", "Surprise me", "The GM invents everything."],
            ["hint", "Give the GM an idea", "Hobbies, quirks, a catchphrase. The GM weaves it in."],
            ["own", "I'll write my own", "Your words go on your card as written."],
          ] as [Mode, string, string][]).map(([m, t, d]) => (
            <label key={m} style={{ color: "var(--fg)" }}>
              <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} /><b>{t}</b> <span className="muted">{d}</span>
            </label>
          ))}
          {mode !== "gm" && (
            <>
              <textarea rows={4} maxLength={600} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={mode === "hint" ? "e.g. I'm obsessed with sourdough and tell everyone about my starter." : "e.g. I'm a retired circus strongman who now runs a bakery."}
                style={{ width: "100%", font: "inherit", padding: 12, borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)", color: "var(--fg)" }} />
              <p className="muted" style={{ fontSize: ".85rem" }}>{text.length}/600. Keep it fun and fictional. Please do not include real secrets about yourself or anyone else.</p>
            </>
          )}
        </div>
      )}

      <PhotoPicker isAdult={isAdult} onChange={setPhoto} />

      {err && <p className="err">{err}</p>}
      <p><button disabled={busy || !name.trim() || !photoReady || (mode !== "gm" && !toddler && !text.trim())} onClick={join}>Join the party</button></p>
    </main>
  );
}
