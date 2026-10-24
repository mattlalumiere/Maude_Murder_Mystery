"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Media";
import { useBotVoice, VoiceToggle } from "@/components/BotVoice";
import { Button, Card, ErrorNote } from "@/components/kit";
import { chatWithBot, friendlyError, type BotLineView, type BotView, type Creds } from "@/lib/client";

type SR = { start: () => void; stop: () => void; lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const getSR = (): (new () => SR) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Phone panel: chat or talk with the AI guests. Voice input is for grown-ups only (browsers send speech to their maker's service). */
export function TalkToGuests({ code, creds, bots, log, adult, voiceReplies }: {
  code: string; creds: Creds; bots: BotView[]; log: BotLineView[]; adult: boolean; voiceReplies: boolean;
}) {
  const [botId, setBotId] = useState(bots[0]?.id ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [listening, setListening] = useState(false);
  const [mine, setMine] = useState<BotLineView[]>([]);
  const voice = useBotVoice(code);
  const sr = useRef<SR | null>(null);
  const SRClass = adult ? getSR() : null;

  useEffect(() => { if (!botId && bots[0]) setBotId(bots[0].id); }, [bots, botId]);
  const thread = log.filter((l) => l.botId === botId && (l.kind === "chatter" || l.to === undefined || true)).slice(-8);
  const merged = [...thread, ...mine.filter((m) => m.botId === botId && !thread.some((t) => t.id === m.id))].sort((a, b) => a.ts - b.ts).slice(-10);

  async function send(message: string) {
    const m = message.trim();
    if (!m || !botId) return;
    setBusy(true); setErr(""); setText("");
    try {
      const r = await chatWithBot(code, botId, m, creds);
      setMine((prev) => [...prev, r.line].slice(-20));
      if (voiceReplies) voice.speak(r.line);
    } catch (e) { setErr(friendlyError((e as Error).message)); }
    setBusy(false);
  }

  function listen() {
    if (!SRClass) return;
    const rec = new SRClass();
    sr.current = rec;
    rec.lang = "en-US"; rec.interimResults = false;
    rec.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) void send(t); };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); setErr("Could not hear you. Check microphone permission, or type instead."); };
    setListening(true);
    rec.start();
  }

  if (!bots.length) return null;
  return (
    <Card title="Talk to the guests" data-testid="talk-to-guests" style={{ marginTop: "var(--space-3)" }}>
      <div className="sc-actions">
        {bots.map((b) => (
          <Button key={b.id} variant={b.id === botId ? "primary" : "secondary"} onClick={() => setBotId(b.id)} data-testid={`bot-pick-${b.id}`}>
            <Avatar code={code} id={b.avatarId} size={24} alt="" /> {b.characterName}
          </Button>
        ))}
      </div>
      <ul className="clean" aria-live="polite" data-testid="bot-thread" style={{ margin: "var(--space-3) 0" }}>
        {merged.length === 0 && <li className="muted">Ask them where they were, what they saw, or what they are hiding.</li>}
        {merged.map((l) => <li key={l.id}><b>{l.speaker}:</b> {l.text}{l.to ? <span className="muted"> (to {l.to})</span> : null}</li>)}
      </ul>
      {err && <ErrorNote>{err}</ErrorNote>}
      <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="sc-actions">
        <input value={text} maxLength={300} placeholder="Ask a question..." aria-label="Message to the guest" data-testid="bot-input" onChange={(e) => setText(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <Button type="submit" disabled={busy || !text.trim()} data-testid="bot-send">Ask</Button>
        {SRClass && <Button type="button" variant="secondary" disabled={busy || listening} onClick={listen} data-testid="bot-mic">{listening ? "Listening..." : "Speak"}</Button>}
      </form>
      <div className="sc-actions" style={{ marginTop: "var(--space-2)" }}>
        <VoiceToggle enabled={voice.enabled} onToggle={voice.toggle} label="Voices" />
      </div>
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
        These guests are AI characters. {SRClass ? "The Speak button uses your browser's speech service, which may send your voice to its maker. " : ""}Keep it friendly.
      </p>
    </Card>
  );
}
