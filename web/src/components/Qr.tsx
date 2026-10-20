"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function Qr({ text, size = 200 }: { text: string; size?: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => { QRCode.toDataURL(text, { width: size, margin: 1 }).then(setUrl).catch(() => setUrl("")); }, [text, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="QR code to join" width={size} height={size} style={{ background: "#fff", borderRadius: 8 }} /> : null;
}
