import { redirect } from "next/navigation";
import { hostIdFromSession } from "@/auth";
import { HostBar } from "@/components/HostBar";
import NewRoom from "./NewRoom";

export default async function NewRoomPage() {
  if (!(await hostIdFromSession())) redirect("/login?callbackUrl=/host/new");
  return (<><HostBar /><NewRoom /></>);
}
