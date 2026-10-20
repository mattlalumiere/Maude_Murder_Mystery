import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Facebook from "next-auth/providers/facebook";
import Google from "next-auth/providers/google";

const providers: Provider[] = [];
if (process.env.AUTH_GOOGLE_ID) providers.push(Google);
if (process.env.AUTH_APPLE_ID) providers.push(Apple);
if (process.env.AUTH_FACEBOOK_ID) providers.push(Facebook);

// Passwordless dev login, never available in production unless explicitly allowed.
if (process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { name: { label: "Name" } },
      authorize: async (c) => {
        const name = String(c?.name ?? "Dev Host").slice(0, 40);
        return { id: `dev:${name}`, name, email: `${name.replace(/\W+/g, "").toLowerCase()}@dev.local` };
      },
    }),
  );
}

export const providerIds: string[] = [
  ...(process.env.AUTH_GOOGLE_ID ? ["google"] : []),
  ...(process.env.AUTH_APPLE_ID ? ["apple"] : []),
  ...(process.env.AUTH_FACEBOOK_ID ? ["facebook"] : []),
  ...(process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production" ? ["dev"] : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.hostId = user.id ?? user.email ?? token.sub;
      return token;
    },
    session({ session, token }) {
      (session.user as { id?: string }).id = String(token.hostId ?? token.sub ?? "");
      return session;
    },
  },
});

export async function hostIdFromSession(): Promise<string | null> {
  const s = await auth();
  const id = (s?.user as { id?: string } | undefined)?.id;
  return id || null;
}
