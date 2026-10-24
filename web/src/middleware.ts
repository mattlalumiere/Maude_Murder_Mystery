import type { NextRequest } from "next/server";
import { createPolicy } from "@/lib/security/edge";

// Runs on the Edge runtime: only import edge-safe modules from lib/security (no node:crypto here).
const policy = createPolicy({
  dev: process.env.NODE_ENV !== "production",
  tls: process.env.ENABLE_HSTS === "true",
  rateLimit: process.env.RATE_LIMIT !== "off",
  trustedProxyHops: Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1),
});

export function middleware(req: NextRequest) {
  return policy.handle(req);
}

// Skip static assets and the image optimizer; health probes pass through classifyRoute as unlimited.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js).*)"],
};
