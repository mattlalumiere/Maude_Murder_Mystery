"use client";
import { useState } from "react";
import { copyText } from "@/lib/client";
import { Button } from "@/components/kit";

export function CopyButton({ text, label = "Copy link", testId = "copy-link" }: { text: string; label?: string; testId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="secondary" data-testid={testId} onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}>
      {done ? "Copied" : label}
      <span className="sr-only" role="status">{done ? "Link copied" : ""}</span>
    </Button>
  );
}
