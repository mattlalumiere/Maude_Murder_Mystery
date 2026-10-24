"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function Qr({ text, size = 200, className = "sc-qr", testId = "qr-code" }: { text: string; size?: number; className?: string; testId?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { QRCode.toDataURL(text, { width: size * 2, margin: 1, errorCorrectionLevel: "M" }).then(setUrl).catch(() => setUrl("")); }, [text, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className={className} data-testid={testId} src={url} alt="QR code. Scan it with a phone camera to join the game." width={size} height={size} /> : <div style={{ width: size, height: size }} aria-hidden />;
}
