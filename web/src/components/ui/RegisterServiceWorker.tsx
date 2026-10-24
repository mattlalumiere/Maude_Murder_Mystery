"use client";
import { useEffect } from "react";

/** Registers /sw.js in production only. Tiny wrapper so the browser API stays out of pages. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
