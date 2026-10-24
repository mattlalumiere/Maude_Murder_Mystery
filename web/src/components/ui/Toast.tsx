"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ToastTone = "info" | "success" | "error";
interface ToastItem { id: number; text: string; tone: ToastTone }
interface ToastApi { show: (text: string, tone?: ToastTone) => void }

const Ctx = createContext<ToastApi>({ show: () => {} });
export const useToast = (): ToastApi => useContext(Ctx);

export function ToastProvider({ children, duration = 5000 }: { children: ReactNode; duration?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const show = useCallback((text: string, tone: ToastTone = "info") => {
    const id = next.current++;
    setItems((xs) => [...xs.slice(-2), { id, text, tone }]);
    timers.current.set(id, setTimeout(() => dismiss(id), duration));
  }, [dismiss, duration]);

  useEffect(() => { const m = timers.current; return () => m.forEach(clearTimeout); }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="mm-toasts" role="region" aria-label="Notifications">
        {items.map((t) => (
          <div key={t.id} className={`mm-toast mm-toast--${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
            <span className="mm-toast__text">{t.text}</span>
            <button type="button" className="mm-toast__close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>x</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
