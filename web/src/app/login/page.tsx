import { providerIds, signIn } from "@/auth";
import { Brand, Card, Notice } from "@/components/kit";

const LABEL: Record<string, string> = { google: "Continue with Google", apple: "Continue with Apple", facebook: "Continue with Facebook" };

export default async function Login({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const redirectTo = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/host/new";
  return (
    <main className="sc-page">
      <Brand />
      <h1>Sign in to host</h1>
      <p className="sc-lead">Your first sign-in creates your host account. Then you set up the game: story, guests, budget and your secret code. Players never need an account, they just use your invite.</p>
      {providerIds.length === 0 && (
        <Notice data-testid="login-no-providers">No sign-in options are set up yet. Add a provider, or turn on dev login for local use.</Notice>
      )}
      <div className="sc-gap">
        {providerIds.filter((p) => p !== "dev").map((p) => (
          <form key={p} action={async () => { "use server"; await signIn(p, { redirectTo }); }}>
            <button type="submit" className="mm-btn mm-btn--block mm-btn--lg" data-testid={`login-${p}`}>{LABEL[p] ?? p}</button>
          </form>
        ))}
        {providerIds.includes("dev") && (
          <Card title="Dev login (local only)">
            <form action={async (fd: FormData) => { "use server"; await signIn("dev", { name: String(fd.get("name") ?? "Dev Host"), redirectTo }); }}>
              <label htmlFor="dev-name">Name</label>
              <input id="dev-name" name="name" defaultValue="Dev Host" data-testid="login-dev-name" />
              <button type="submit" className="mm-btn mm-btn--secondary mm-btn--block" style={{ marginTop: "var(--space-3)" }} data-testid="login-dev-submit">Dev sign in</button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
