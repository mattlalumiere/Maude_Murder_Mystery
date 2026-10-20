import { redirect } from "next/navigation";
import { hostIdFromSession } from "@/auth";
import HostConsole from "./HostConsole";

export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!(await hostIdFromSession())) redirect(`/login?callbackUrl=/host/${code}`);
  return <HostConsole code={code.toUpperCase()} />;
}
