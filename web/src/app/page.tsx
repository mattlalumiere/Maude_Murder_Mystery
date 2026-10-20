"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <main>
      <h1>Murder Mystery Night</h1>
      <p className="muted">A family whodunit for grown-ups and kids. The AI Game Master keeps the secrets.</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Join a game</h2>
        <label htmlFor="code">Room code (4 letters)</label>
        <input id="code" value={code} maxLength={4} autoCapitalize="characters" placeholder="ABCD"
          onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <p><button disabled={code.length !== 4} onClick={() => router.push(`/play/${code}`)}>Join</button></p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Host a game</h2>
        <p className="muted">Sign in to create a room. Guests never need an account.</p>
        <Link className="btn" href="/host/new">Host a game</Link>
      </div>
    </main>
  );
}
