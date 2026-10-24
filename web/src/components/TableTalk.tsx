"use client";
import { useEffect, useRef, useState } from "react";
import { useBotVoice, VoiceToggle } from "@/components/BotVoice";
import { useCall } from "@/components/useCall";
import { Button, Card, ErrorNote } from "@/components/kit";
import { friendlyError, postChatMessage, type BotView, type ChatLineView, type Creds } from "@/lib/client";

/** Group chat for the table. Say an AI guest's name and they answer. Grown-ups can also start a hands-free voice call with a guest. */
export function TableTalk({ code, creds, meId, chat, bots, adult, stt, voiceReplies }: {
  code: string; creds: Creds; meId: string; chat: ChatLineView[]; bots: BotView[]; adult: boolean; stt: "server" | "browser"; voiceReplies: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [botId, setBotId] = useState(bots[0]?.id ?? "");
  const [headphones, setHeadphones] = useState(false);
  const voice = useBotVoice(code);
  const end = useRef<HTMLLIElement>(null);
  const bot = bots.find((b) => b.id === botId) ?? bots[0];

  useEffect(() => { if (!botId && bots[0]) setBotId(bots[0].id); }, [bots, botId]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [chat.length]);

  async function post(message: string, spoken = false) {
    const m = message.trim();
    if (!m) return;
    setBusy(true); setErr("");
    try {
      const r = await postChatMessage(code, m, creds);
      if (r.reply && (spoken || voiceReplies)) voice.speak(r.reply);
    } catch (e) { setErr(friendlyError((e as Error).message)); if (!spoken) setText(m); }
    setBusy(false);
  }

  const call = useCall({
    code, creds, stt, speaking: voice.speaking, interrupt: voice.stop, headphones,
    onHeard: async (heard) => {
      const first = (bot?.characterName ?? "").split(" ")[0];
      const named = bots.some((b) => heard.toLowerCase().includes(b.characterName.split(" ")[0].toLowerCase()));
      await post(named || !first ? heard : `${first}, ${heard}`, true);
    },
  });

  function startCall() { if (!voice.enabled) voice.toggle(); void call.start(); }
  const label = { off: "", listening: "Listening...", thinking: "Thinking...", speaking: "Speaking..." }[call.state];

  return (
    <Card title="Table talk" data-testid="table-talk" style={{ marginTop: "var(--space-3)" }}>
      <ul className="clean" aria-live="polite" data-testid="chat-thread" style={{ maxHeight: 220, overflowY: "auto", margin: "0 0 var(--space-3)" }}>
        {chat.length === 0 && <li className="muted">Nothing yet. {bots.length ? "Say a guest's name to get their attention." : "Say hello to the table."}</li>}
        {chat.map((m) => <li key={m.id} data-testid="chat-line"><b>{m.from === meId ? "You" : m.name}{m.bot && !/\(AI\)\s*$/.test(m.name) ? " (AI)" : ""}:</b> {m.text}</li>)}
        <li ref={end} aria-hidden />
      </ul>
      {err && <ErrorNote>{err}</ErrorNote>}
      <form onSubmit={(e) => { e.preventDefault(); const t = text; setText(""); void post(t); }} className="sc-actions">
        <input value={text} maxLength={240} placeholder="Say something to the table..." aria-label="Message to the table" data-testid="chat-input" onChange={(e) => setText(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <Button type="submit" disabled={busy || !text.trim()} data-testid="chat-send">Send</Button>
      </form>
      {bots.length > 0 && (
        <div className="sc-actions" style={{ marginTop: "var(--space-2)" }}>
          {bots.map((b) => <Button key={b.id} variant="ghost" onClick={() => setText((t) => `${b.characterName.split(" ")[0]}, ${t}`)} data-testid={`chat-mention-${b.id}`}>@{b.characterName.split(" ")[0]}</Button>)}
        </div>
      )}
      {adult && bots.length > 0 && (
        <div style={{ marginTop: "var(--space-3)" }} data-testid="voice-call">
          <p className="sc-eyebrow" style={{ margin: 0 }}>Voice call</p>
          {!call.supported ? (
            <p className="muted">Voice calls need a browser with speech recognition (Chrome, Edge, Safari) or the host&apos;s local speech service.</p>
          ) : (
            <>
              <div className="sc-actions">
                {bots.length > 1 && (
                  <select value={botId} onChange={(e) => setBotId(e.target.value)} aria-label="Who to call" data-testid="call-who">
                    {bots.map((b) => <option key={b.id} value={b.id}>{b.characterName}</option>)}
                  </select>
                )}
                {call.state === "off"
                  ? <Button onClick={startCall} data-testid="call-start">Call {bot?.characterName.split(" ")[0]}</Button>
                  : <Button variant="danger" onClick={call.stop} data-testid="call-stop">Hang up</Button>}
                <VoiceToggle enabled={voice.enabled} onToggle={voice.toggle} label="Voices" />
              </div>
              <label className="sc-check" style={{ marginTop: "var(--space-2)" }}>
                <input type="checkbox" checked={headphones} onChange={(e) => setHeadphones(e.target.checked)} data-testid="call-headphones" />
                <span>I am wearing headphones (lets you interrupt them mid-sentence)</span>
              </label>
              {label && <p role="status" data-testid="call-state" style={{ margin: "var(--space-2) 0 0" }}>{label}</p>}
              {call.error && <ErrorNote>{call.error}</ErrorNote>}
            </>
          )}
        </div>
      )}
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
        Everyone at the table can read this chat. AI guests are characters, and keep it friendly.
        {adult && bots.length > 0 && (stt === "browser" ? " Voice calls use your browser's speech service, which may send your voice to its maker." : " Voice calls send your voice only to the host's own computer.")}
      </p>
    </Card>
  );
}
