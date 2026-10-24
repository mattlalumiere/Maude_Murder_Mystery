"use client";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Game } from "./Game";
import { Skeleton } from "@/components/kit";
import { consumeCredsFromUrl, loadCreds, normalizeCode, type Creds } from "@/lib/client";

function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(to); }, [router, to]);
  return <main><Skeleton lines={1} label="Taking you to the character builder" /></main>;
}

export default function Play({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode(use(params).code);
  const [creds, setCreds] = useState<Creds | null | undefined>(undefined);

  useEffect(() => {
    consumeCredsFromUrl(code);
    setCreds(loadCreds(code));
  }, [code]);

  if (creds === undefined) return <main><Skeleton lines={3} /></main>;
  if (!creds) return <Redirect to={`/join/${code}`} />;
  return <Game code={code} creds={creds} />;
}
