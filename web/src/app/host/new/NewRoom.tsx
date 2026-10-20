"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export default function NewRoom() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true); setErr("");
    try {
      const r = await api<{ code: string }>("/api/rooms", { overrideCode: code });
      router.push(`/host/${r.code}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <main>
      <h1>New game</h1>
      <div className="card">
        <label htmlFor="oc">Your secret Host Override Code</label>
        <input id="oc" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="at least 4 characters" />
        <p className="muted">Unlocks nudges, advanced clues, fast-forward, and the final answer. Don&apos;t say it aloud. You can&apos;t recover it, and the AI never sees it.</p>
        {err && <p className="err">{err}</p>}
        <button disabled={busy || code.trim().length < 4} onClick={create}>Create room</button>
      </div>
    </main>
  );
}
