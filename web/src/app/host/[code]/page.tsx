import { redirect } from "next/navigation";
import { hostIdFromSession } from "@/auth";
import { HostBar } from "@/components/HostBar";
import HostConsole from "./HostConsole";

export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!(await hostIdFromSession())) redirect(`/login?callbackUrl=/host/${code}`);
  return (<><HostBar /><HostConsole code={code.toUpperCase()} /></>);
}
