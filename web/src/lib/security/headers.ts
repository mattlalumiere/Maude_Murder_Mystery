export interface HeaderOptions {
  path: string;
  dev: boolean;
  /** True only when TLS is terminated in front of the app (HSTS and upgrade-insecure-requests). */
  tls: boolean;
  nonce?: string;
}

export function buildCsp(o: { dev: boolean; tls: boolean; nonce?: string }): string {
  // Next.js emits small inline bootstrap scripts. Without a nonce we must allow 'unsafe-inline' for scripts.
  // With a nonce (strict mode) inline scripts are only allowed when they carry it.
  const script = o.nonce
    ? `script-src 'self' 'nonce-${o.nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ""}`
    : `script-src 'self' 'unsafe-inline'${o.dev ? " 'unsafe-eval'" : ""}`;
  const d = [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (o.tls) d.push("upgrade-insecure-requests");
  return d.join("; ");
}

/** Pages where a player may take a photo. Everything else denies the camera. */
const CAMERA_PATHS = [/^\/play(\/|$)/, /^\/join(\/|$)/];

export function securityHeaders(o: HeaderOptions): Record<string, string> {
  const camera = CAMERA_PATHS.some((re) => re.test(o.path)) ? "camera=(self)" : "camera=()";
  const h: Record<string, string> = {
    "Content-Security-Policy": buildCsp(o),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": `${camera}, microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (o.tls) h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  if (o.path.startsWith("/api/")) h["Cache-Control"] = "no-store";
  return h;
}
