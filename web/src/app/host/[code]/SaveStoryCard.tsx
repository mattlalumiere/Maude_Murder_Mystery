"use client";
import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Qr } from "@/components/Qr";
import { Badge, Button, Card, ErrorNote, Field } from "@/components/kit";
import { api, friendlyError, originUrl, storyUrl } from "@/lib/client";

type Saved = { id: string; title: string; visibility: "link" | "public"; kind: "story" | "cast"; hasRecap: boolean };

/** Save this night's mystery so others can play it, optionally with its characters, a recap, and a spot in the public gallery. */
export function SaveStoryCard({ code, phase, defaultTitle }: { code: string; phase: string; defaultTitle: string }) {
  const [kind, setKind] = useState<"story" | "cast">("cast");
  const [visibility, setVisibility] = useState<"link" | "public">("link");
  const [title, setTitle] = useState(defaultTitle);
  const [blurb, setBlurb] = useState("");
  const [recap, setRecap] = useState(true);
  const [names, setNames] = useState(false);
  const [pictures, setPictures] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const revealed = phase === "reveal";
  const pub = visibility === "public";
  const url = saved ? `${originUrl()}${storyUrl(saved.id)}` : "";

  async function save() {
    setBusy(true); setErr("");
    try {
      setSaved(await api<Saved>(`/api/rooms/${code}/story`, {
        kind, visibility, title, blurb, includeRecap: revealed && recap, recapNames: names && !pub, recapPictures: pictures && !pub,
      }));
    } catch (e) { setErr(friendlyError((e as Error).message)); }
    setBusy(false);
  }

  return (
    <Card title="Save and share this story" tone={revealed ? "glow" : undefined} style={{ marginTop: "var(--space-3)" }} data-testid="save-story">
      {saved ? (
        <div data-testid="save-story-done">
          <p><Badge tone="gold">{saved.visibility === "public" ? "In the public gallery" : "Link only"}</Badge> <b>{saved.title}</b> is saved.</p>
          <p style={{ wordBreak: "break-all" }}>{url}</p>
          <div className="sc-actions"><CopyButton text={url} /><a className="mm-btn mm-btn--secondary" href={storyUrl(saved.id)} target="_blank" rel="noopener">Open story page</a></div>
          <Qr text={url} size={140} />
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>Anyone with this link can start a game from it. The solution stays sealed on the server, even from you.</p>
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Let other teams play the same mystery. The solution is sealed: nobody who replays it can read it in the app.</p>
          <fieldset className="sc-fieldset"><legend>What to save</legend>
            <label className="sc-check"><input type="radio" name="kind" checked={kind === "story"} onChange={() => setKind("story")} data-testid="save-kind-story" /><span><b>Storyline only.</b> The plot and clues. New players are cast at random.</span></label>
            <label className="sc-check"><input type="radio" name="kind" checked={kind === "cast"} onChange={() => setKind("cast")} data-testid="save-kind-cast" /><span><b>Storyline and characters.</b> New players choose which character to be.</span></label>
          </fieldset>
          <Field label="Name"><input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} data-testid="save-title" /></Field>
          <Field label="Short description (optional)"><input value={blurb} maxLength={280} onChange={(e) => setBlurb(e.target.value)} data-testid="save-blurb" /></Field>
          <fieldset className="sc-fieldset"><legend>Who can find it</legend>
            <label className="sc-check"><input type="radio" name="vis" checked={visibility === "link"} onChange={() => setVisibility("link")} data-testid="save-vis-link" /><span><b>Link only.</b> Only people you send the link to.</span></label>
            <label className="sc-check"><input type="radio" name="vis" checked={visibility === "public"} onChange={() => setVisibility("public")} data-testid="save-vis-public" /><span><b>Public gallery.</b> Anyone can find it, try it, and vote for it.</span></label>
          </fieldset>
          <label className="sc-check"><input type="checkbox" checked={revealed && recap} disabled={!revealed} onChange={(e) => setRecap(e.target.checked)} data-testid="save-recap" /><span>Also share a recap of tonight{revealed ? "" : " (available after the reveal)"}. Readers see it behind a spoiler warning.</span></label>
          {revealed && recap && (
            <div style={{ marginLeft: "var(--space-4)" }}>
              <label className="sc-check"><input type="checkbox" checked={names && !pub} disabled={pub} onChange={(e) => setNames(e.target.checked)} /><span>Use players&apos; real names</span></label>
              <label className="sc-check"><input type="checkbox" checked={pictures && !pub} disabled={pub} onChange={(e) => setPictures(e.target.checked)} /><span>Include the game&apos;s pictures (cartoon likenesses)</span></label>
              {pub && <p className="muted" style={{ fontSize: "var(--text-xs)" }}>Public stories never include real names or pictures of players.</p>}
            </div>
          )}
          {err && <ErrorNote>{err}</ErrorNote>}
          <Button block loading={busy} disabled={!title.trim() || phase === "lobby"} onClick={save} data-testid="save-story-submit">Save story</Button>
        </>
      )}
    </Card>
  );
}
