"use client";
import { useEffect } from "react";
import { Avatar } from "@/components/Media";
import { useBotVoice, VoiceToggle } from "@/components/BotVoice";
import { Card } from "@/components/kit";
import { plainText, type BotLineView, type BotView } from "@/lib/client";

/** Shared-screen ticker of what the AI guests say, spoken aloud once someone taps Enable voices. */
export function BotChatter({ code, lines, bots, big = false }: { code: string; lines: BotLineView[]; bots: BotView[]; big?: boolean }) {
  const voice = useBotVoice(code);
  // Lines already on screen when voices are switched on are not read out.
  useEffect(() => { if (!voice.enabled) voice.markSeen(lines); }, [lines, voice]);
  useEffect(() => { if (voice.enabled) lines.forEach((l) => voice.speak(l)); }, [lines, voice]);
  if (!bots.length) return null;
  const shown = lines.slice(-4);
  const avatarOf = (botId: string) => bots.find((b) => b.id === botId)?.avatarId;
  return (
    <Card title="The guests are talking" data-testid="bot-chatter" style={{ marginTop: "var(--space-3)" }}>
      <ul className="clean" aria-live="polite" style={{ fontSize: big ? "1.3rem" : undefined }}>
        {shown.length === 0 && <li className="muted">The AI guests are mingling...</li>}
        {shown.map((l) => (
          <li key={l.id} className="row" style={{ alignItems: "center", gap: 8 }}>
            <Avatar code={code} id={avatarOf(l.botId)} size={big ? 48 : 32} alt="" />
            <span><b>{plainText(l.speaker)}:</b> {plainText(l.text)}</span>
          </li>
        ))}
      </ul>
      <VoiceToggle enabled={voice.enabled} onToggle={voice.toggle} label="voices" />
    </Card>
  );
}
