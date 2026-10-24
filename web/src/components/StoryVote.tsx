"use client";
import { useState } from "react";
import { Button, Card, Notice } from "@/components/kit";
import { api, credHeaders, friendlyError, storyUrl, type Creds } from "@/lib/client";

/** After the reveal, players of a replayed story can vote for it from their own phone (one vote each). */
export function StoryVote({ code, storyId, creds }: { code: string; storyId: string; creds: Creds }) {
  const [voted, setVoted] = useState(false);
  const [votes, setVotes] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const headers = { ...credHeaders(creds), "x-room": code };

  async function toggle() {
    setErr("");
    try {
      const r = await api<{ engagement: { votes: number } }>(`/api/stories/${storyId}/vote`, voted ? undefined : {}, headers, voted ? "DELETE" : "POST");
      setVoted(!voted); setVotes(r.engagement.votes);
    } catch (e) { setErr(friendlyError((e as Error).message)); }
  }
  return (
    <Card title="Did you like this story?" data-testid="story-vote-card" style={{ marginTop: "var(--space-3)" }}>
      <p className="muted" style={{ marginTop: 0 }}>Your vote helps other teams find the best mysteries.</p>
      <div className="sc-actions">
        <Button variant={voted ? "primary" : "secondary"} onClick={toggle} data-testid="player-story-vote">{voted ? "Voted (tap to undo)" : "Vote for this story"}</Button>
        <a className="mm-btn mm-btn--ghost" href={storyUrl(storyId)} target="_blank" rel="noopener">See it in the gallery</a>
      </div>
      {votes !== null && <Notice>{votes} vote{votes === 1 ? "" : "s"} so far.</Notice>}
      {err && <p className="sc-error" role="alert">{err}</p>}
    </Card>
  );
}
