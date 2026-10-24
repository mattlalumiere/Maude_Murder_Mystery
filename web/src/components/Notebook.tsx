"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/kit";
import { credHeaders, friendlyError, sendAction, type Creds } from "@/lib/client";

const keyOf = (code: string, id: string) => `mm:notes:${code}:${id}`;
const read = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* private window */ } };

/** The detective notebook: private to this player, saved on the server (so it survives a lost tab) and mirrored on this device. */
export function Notebook({ code, creds, playerId, initial, headings }: { code: string; creds: Creds; playerId: string; initial: string; headings: string[] }) {
  const k = keyOf(code, playerId);
  const [text, setText] = useState(() => (typeof window === "undefined" ? initial : (read(k) ?? initial)));
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const last = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (initial && !read(k) && !text) setText(initial); }, [initial, k, text]);

  function change(v: string) {
    setText(v); write(k, v);
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(() => void save(v), 1200);
  }
  async function save(v: string) {
    if (v === last.current) { setStatus("saved"); return; }
    try { await sendAction(code, { type: "saveNotes", notes: v }, credHeaders(creds)); last.current = v; setStatus("saved"); }
    catch (e) { setStatus("error"); void friendlyError((e as Error).message); }
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function addHeading(h: string) {
    const v = `${text}${text && !text.endsWith("\n") ? "\n" : ""}\n${h}:\n`;
    change(v);
    requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(v.length, v.length); });
  }

  return (
    <Card title="My detective notebook" data-testid="notebook" style={{ marginTop: "var(--space-3)" }}>
      <p className="muted" style={{ marginTop: 0 }}>Only you can see this. Jot down who said what, who is acting strangely, and your hunches.</p>
      {headings.length > 0 && (
        <ul className="sc-chips" aria-label="Notebook sections">
          {headings.map((h) => <li key={h}><button type="button" className="mm-btn mm-btn--secondary" onClick={() => addHeading(h)} data-testid="notebook-heading">+ {h}</button></li>)}
        </ul>
      )}
      <textarea ref={area} value={text} rows={8} maxLength={4000} aria-label="Detective notebook" data-testid="notebook-text" onChange={(e) => change(e.target.value)} style={{ width: "100%" }} />
      <p className="muted" role="status" data-testid="notebook-status" style={{ fontSize: "var(--text-xs)" }}>
        {status === "saved" ? "Saved." : status === "saving" ? "Saving..." : "Could not save to the server. It is still kept on this phone."}
      </p>
    </Card>
  );
}
