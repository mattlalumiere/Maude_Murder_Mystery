import { auth, signOut } from "@/auth";
import Link from "next/link";

export async function HostBar() {
  const s = await auth();
  return (
    <header className="sc-hostbar" data-testid="host-bar">
      <Link href="/" className="sc-hostbar__brand">Murder Mystery Night</Link>
      <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }} className="sc-hostbar__who">
        <span className="sc-hostbar__name">{s?.user?.name ?? s?.user?.email}</span>
        <button className="mm-btn mm-btn--ghost" type="submit" data-testid="sign-out">Sign out</button>
      </form>
    </header>
  );
}
