"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type Headers_ = Record<string, string>;

export async function api<T = unknown>(path: string, body?: unknown, headers: Headers_ = {}): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

/** Polls the room state every `ms`, skipping updates when the version has not changed. */
export function useRoom<T extends { version: number }>(code: string, role: "host" | "player" | "screen", headers: Headers_ = {}, ms = 2000) {
  const [state, setState] = useState<T | null>(null);
  const [error, setError] = useState("");
  const version = useRef(-1);
  const hdr = useRef(headers);
  hdr.current = headers;

  const refresh = useCallback(async (force = false) => {
    try {
      const r = await api<T & { unchanged?: boolean }>(`/api/rooms/${code}/state?role=${role}&v=${force ? -1 : version.current}`, undefined, hdr.current);
      if (!r.unchanged) { version.current = r.version; setState(r); }
      setError("");
    } catch (e) { setError((e as Error).message); }
  }, [code, role]);

  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (!document.hidden) refresh(); }, ms);
    return () => clearInterval(t);
  }, [refresh, ms]);

  return { state, error, refresh };
}
