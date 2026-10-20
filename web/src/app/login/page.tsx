import { providerIds, signIn } from "@/auth";

const LABEL: Record<string, string> = { google: "Continue with Google", apple: "Continue with Apple", facebook: "Continue with Facebook" };

export default async function Login({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const redirectTo = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/host/new";
  return (
    <main>
      <h1>Sign in to host</h1>
      <p className="muted">Only the host signs in. Guests join with a room code.</p>
      {providerIds.length === 0 && (
        <p className="err">No sign-in providers are configured. Set AUTH_GOOGLE_ID/SECRET (and optionally Apple/Facebook) or ALLOW_DEV_LOGIN=true for local development.</p>
      )}
      {providerIds.filter((p) => p !== "dev").map((p) => (
        <form key={p} action={async () => { "use server"; await signIn(p, { redirectTo }); }}>
          <p><button type="submit">{LABEL[p] ?? p}</button></p>
        </form>
      ))}
      {providerIds.includes("dev") && (
        <form action={async (fd: FormData) => { "use server"; await signIn("dev", { name: String(fd.get("name") ?? "Dev Host"), redirectTo }); }} className="card">
          <label htmlFor="name">Dev login (local only)</label>
          <input id="name" name="name" defaultValue="Dev Host" />
          <p><button type="submit" className="ghost">Dev sign in</button></p>
        </form>
      )}
    </main>
  );
}
