"use client";
import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/kit";
import { api } from "@/lib/client";

type Status = {
  local: { configured: boolean; reachable: boolean; ok?: boolean; backends?: Record<string, { ok: boolean; mode?: string }> };
  cloud: { text: string | null; speech: string; image: string };
};
export type AiMode = "auto" | "cloud" | "local";

/** Choose where this game's conversations, voices, pictures and video come from. */
export function AiModeCard({ value, onChange }: { value: AiMode; onChange: (m: AiMode) => void }) {
  const [st, setSt] = useState<Status | null>(null);
  useEffect(() => { api<Status>("/api/ai/status").then(setSt).catch(() => setSt(null)); }, []);
  const localOk = !!st?.local.configured && st.local.reachable;
  const mock = st?.local.backends && Object.values(st.local.backends).some((b) => b.mode === "mock");
  return (
    <Card title="Where should the AI run?" data-testid="ai-mode-card">
      <label className="sc-check"><input type="radio" name="aimode" checked={value === "auto"} onChange={() => onChange("auto")} data-testid="aimode-auto" />
        <span><b>Automatic.</b> Use the cloud services this server is set up with, or the built-in story if there are none.</span></label>
      <label className="sc-check"><input type="radio" name="aimode" checked={value === "cloud"} onChange={() => onChange("cloud")} data-testid="aimode-cloud" />
        <span><b>Cloud only.</b> Never use local services.</span></label>
      <label className="sc-check" style={{ opacity: localOk ? 1 : 0.6 }}><input type="radio" name="aimode" disabled={!localOk} checked={value === "local"} onChange={() => onChange("local")} data-testid="aimode-local" />
        <span><b>Local services on my own computer.</b> Chat, voices, pictures and video run in containers connected through MCP. No per-picture cost, and voices and photos stay on your network.{" "}
          {st && (localOk
            ? <Badge tone="gold" data-testid="aimode-local-status">{mock ? "Running (test models)" : "Running"}</Badge>
            : <Badge tone="ghost" data-testid="aimode-local-status">{st.local.configured ? "Not reachable" : "Not set up"}</Badge>)}
        </span></label>
      {value === "local" && <p className="muted" style={{ fontSize: "var(--text-xs)" }}>Local models can be slow on a laptop, so pictures and clips may take longer to appear. Text-only play never waits for them.</p>}
      {!localOk && st && <p className="muted" style={{ fontSize: "var(--text-xs)" }}>To use local services, start <code>services/local-ai</code> and set <code>LOCAL_AI_MCP_URL</code> (see its README).</p>}
    </Card>
  );
}
