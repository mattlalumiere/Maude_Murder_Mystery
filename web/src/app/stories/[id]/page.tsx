"use client";
import { use, useEffect, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Badge, Brand, Button, ButtonLink, Card, ErrorNote, Notice } from "@/components/kit";
import { api, friendlyError, originUrl, plainText, storyUrl, useDocTitle, type RecapView, type StoryDetail } from "@/lib/client";

export default function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<StoryDetail | null>(null);
  const [err, setErr] = useState("");
  const [recap, setRecap] = useState<RecapView | null>(null);
  const [voted, setVoted] = useState(false);
  const [note, setNote] = useState("");
  useDocTitle(d?.story.title ?? "Story");

  const load = () => api<StoryDetail>(`/api/stories/${id}`).then(setD).catch((e) => setErr(friendlyError((e as Error).message)));
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function vote(on: boolean) {
    setNote("");
    try {
      const r = await api<{ engagement: StoryDetail["engagement"] }>(`/api/stories/${id}/vote`, on ? {} : undefined, {}, on ? "POST" : "DELETE");
      setVoted(on); setD((p) => (p ? { ...p, engagement: r.engagement } : p));
    } catch (e) { setNote((e as Error).message.includes("Sign in") ? "Sign in as a host to vote, or vote from your phone after the reveal." : friendlyError((e as Error).message)); }
  }
  async function report() {
    try { await api(`/api/stories/${id}/report`, {}); setNote("Thanks. Reported for review."); }
    catch (e) { setNote((e as Error).message.includes("Sign in") ? "Sign in as a host to report a story." : friendlyError((e as Error).message)); }
  }
  async function del() {
    if (!window.confirm("Delete this saved story for everyone?")) return;
    try { await api(`/api/stories/${id}`, undefined, {}, "DELETE"); location.href = "/stories"; } catch (e) { setNote(friendlyError((e as Error).message)); }
  }

  if (err) return <main className="sc-page"><Brand /><ErrorNote>{err}</ErrorNote><ButtonLink href="/stories" variant="secondary">Back to stories</ButtonLink></main>;
  if (!d) return <main className="sc-page"><Brand /><p className="muted">Loading...</p></main>;
  const s = d.story, e = d.engagement;
  const url = `${originUrl()}${storyUrl(s.id)}`;

  return (
    <main className="sc-page" data-testid="story-page">
      <Brand />
      <h1>{plainText(s.title)}</h1>
      <p className="sc-lead">{plainText(s.blurb || s.setting)}</p>
      <p>
        <Badge tone="gold" data-testid="story-votes">{e.votes} vote{e.votes === 1 ? "" : "s"}{e.playedVotes ? ` (${e.playedVotes} from players)` : ""}</Badge>{" "}
        <Badge tone="ghost">{e.plays} play{e.plays === 1 ? "" : "s"}</Badge>{" "}
        <Badge tone="ghost">{s.kind === "cast" ? "Pick your character" : "Random cast"}</Badge>{" "}
        <Badge tone="ghost">{s.visibility === "public" ? "Public" : "Link only"}</Badge>
      </p>

      <Card title="Play this story" data-testid="story-play">
        <p className="muted" style={{ marginTop: 0 }}>You host it. The Game Master keeps the solution sealed, so you play too. {s.kind === "cast" ? "Your players will choose their characters." : "Your players are cast at random."}</p>
        <ButtonLink href={`/host/new?story=${s.id}`} lg block data-testid="story-play-link">Host a game with this story</ButtonLink>
        <p className="muted" style={{ fontSize: "var(--text-xs)" }}>Heads up: if you want to be surprised, do not open the recap below.</p>
      </Card>

      {s.characters && (
        <Card title="The cast" style={{ marginTop: "var(--space-3)" }} data-testid="story-cast">
          <ul className="clean">{s.characters.map((c) => <li key={c.id}><b>{plainText(c.name)}</b> <span className="muted">({plainText(c.house)}{c.kid ? ", young player" : ""})</span><br /><span className="muted">{plainText(c.tease)}</span></li>)}</ul>
        </Card>
      )}
      {!s.characters && <p className="muted">{s.castCount} characters in {s.houses.length} houses: {s.houses.map(plainText).join(", ")}.</p>}

      <div className="sc-actions" style={{ marginTop: "var(--space-3)" }}>
        <Button variant={voted ? "primary" : "secondary"} onClick={() => vote(!voted)} data-testid="story-vote">{voted ? "Voted (tap to undo)" : "Vote for this story"}</Button>
        <CopyButton text={url} />
        <Button variant="ghost" onClick={report} data-testid="story-report">Report</Button>
        {d.mine && <Button variant="ghost" onClick={del} data-testid="story-delete">Delete</Button>}
      </div>
      {note && <Notice>{note}</Notice>}

      {s.hasRecap && (
        <Card title="How one night went" style={{ marginTop: "var(--space-4)" }} data-testid="story-recap-card">
          {!recap ? (
            <>
              <p><b>Spoilers ahead.</b> This recap gives away the ending.</p>
              <Button variant="secondary" onClick={() => api<{ recap: RecapView }>(`/api/stories/${id}/recap`).then((r) => setRecap(r.recap)).catch((x) => setNote(friendlyError((x as Error).message)))} data-testid="story-recap-open">Show me the recap</Button>
            </>
          ) : (
            <div data-testid="story-recap">
              {recap.reveal && <p><b>It was {plainText(recap.reveal.killer)}.</b> {plainText(recap.reveal.method)}. {plainText(recap.reveal.motive)}.<br />{plainText(recap.reveal.story)}</p>}
              <h3>Clues</h3>
              <ul>{recap.clues.map((c, i) => <li key={i}>{plainText(c)}</li>)}</ul>
              <h3>Scores</h3>
              <ol>{recap.scores.slice(0, 10).map((x, i) => <li key={i}>{plainText(x.name)}: <b>{x.points}</b></li>)}</ol>
              <h3>Awards</h3>
              <ul>{recap.awards.map((a, i) => <li key={i}>{plainText(a.award)}: <b>{plainText(a.to)}</b></li>)}</ul>
              {recap.images.length > 0 && (
                <div className="sc-story-grid">
                  {recap.images.map((im) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <figure key={im.id} style={{ margin: 0 }}><img src={`/api/stories/${id}/img/${im.id}`} alt={plainText(im.caption)} style={{ width: "100%", borderRadius: 8 }} /><figcaption className="muted">{plainText(im.caption)}</figcaption></figure>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </main>
  );
}
