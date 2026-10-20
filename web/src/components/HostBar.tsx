import { auth, signOut } from "@/auth";
import Link from "next/link";

export async function HostBar() {
  const s = await auth();
  return (
    <div className="row" style={{ justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
      <Link href="/" style={{ color: "inherit", fontWeight: 700, textDecoration: "none" }}>Murder Mystery Night</Link>
      <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }} className="row">
        <span className="muted">{s?.user?.name ?? s?.user?.email}</span>
        <button className="ghost" type="submit">Sign out</button>
      </form>
    </div>
  );
}
