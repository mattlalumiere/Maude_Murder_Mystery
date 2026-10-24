"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Brand, Button, ButtonLink, Card, ErrorNote, Field } from "@/components/kit";
import { api, friendlyError, storyUrl, useDocTitle, type StoryCard } from "@/lib/client";

type Sort = "top" | "new" | "played";
type Mine = { id: string; title: string; kind: "story" | "cast"; visibility: "link" | "public"; savedAt: number };

export default function Stories() {
  useDocTitle("Stories");
  const [tab, setTab] = useState<"gallery" | "mine">("gallery");
  const [sort, setSort] = useState<Sort>("top");
  const [q, setQ] = useState("");
  const [gallery, setGallery] = useState<StoryCard[] | null>(null);
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [err, setErr] = useState("");

  const loadGallery = useCallback(async () => {
    try { setGallery((await api<{ stories: StoryCard[] }>(`/api/stories?scope=gallery&sort=${sort}&q=${encodeURIComponent(q)}`)).stories); setErr(""); }
    catch (e) { setErr(friendlyError((e as Error).message)); }
  }, [sort, q]);
  useEffect(() => { const t = setTimeout(loadGallery, 200); return () => clearTimeout(t); }, [loadGallery]);
  useEffect(() => {
    if (tab !== "mine") return;
    api<{ stories: Mine[] }>("/api/stories?scope=mine").then((r) => setMine(r.stories)).catch((e) => { setMine([]); setErr((e as Error).message.includes("Sign in") ? "Sign in as a host to see your saved stories." : friendlyError((e as Error).message)); });
  }, [tab]);

  return (
    <main className="sc-page" data-testid="stories-page">
      <Brand />
      <h1>Stories</h1>
      <p className="sc-lead">Mysteries other teams have played. Pick one to host, or vote for your favourites.</p>
      <div className="sc-actions">
        <Button variant={tab === "gallery" ? "primary" : "secondary"} onClick={() => setTab("gallery")} data-testid="tab-gallery">Public gallery</Button>
        <Button variant={tab === "mine" ? "primary" : "secondary"} onClick={() => setTab("mine")} data-testid="tab-mine">My stories</Button>
        <ButtonLink href="/host/new" variant="ghost">Host a new game</ButtonLink>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      {tab === "gallery" && (
        <>
          <div className="sc-actions" style={{ marginTop: "var(--space-3)" }}>
            <Field label="Search"><input value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} data-testid="gallery-search" /></Field>
            <Field label="Sort">
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} data-testid="gallery-sort">
                <option value="top">Most voted</option><option value="played">Most played</option><option value="new">Newest</option>
              </select>
            </Field>
          </div>
          {gallery === null ? <p className="muted">Loading...</p> : gallery.length === 0 ? <p className="muted" data-testid="gallery-empty">Nothing here yet. Be the first to share a story from your next game.</p> : (
            <div className="sc-story-grid" data-testid="gallery-list">
              {gallery.map((s) => (
                <Card key={s.id} className="sc-story-card" data-testid={`story-card-${s.id}`}>
                  <Link href={storyUrl(s.id)}>
                    <b>{s.title}</b>
                    <p className="muted" style={{ margin: "4px 0" }}>{s.blurb || "A whodunit for the whole family."}</p>
                    <p style={{ margin: 0 }}>
                      <Badge tone="gold">{s.votes} vote{s.votes === 1 ? "" : "s"}</Badge>{" "}
                      <Badge tone="ghost">{s.plays} play{s.plays === 1 ? "" : "s"}</Badge>{" "}
                      <Badge tone="ghost">{s.kind === "cast" ? "Pick your character" : "Random cast"}</Badge>
                    </p>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "mine" && (
        mine === null ? <p className="muted">Loading...</p> : mine.length === 0 ? <p className="muted" data-testid="mine-empty">You have not saved a story yet. Finish a game and use Save and share on the host page.</p> : (
          <ul className="clean" data-testid="mine-list">
            {mine.map((s) => (
              <li key={s.id}><Link href={storyUrl(s.id)}>{s.title}</Link> <Badge tone="ghost">{s.visibility === "public" ? "Public" : "Link only"}</Badge> <Badge tone="ghost">{s.kind === "cast" ? "With characters" : "Storyline"}</Badge></li>
            ))}
          </ul>
        )
      )}
    </main>
  );
}
