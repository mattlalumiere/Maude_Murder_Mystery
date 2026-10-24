import type { BrowserContext } from "@playwright/test";

/**
 * Production builds disable dev login (src/auth.ts), so the host session cookie is minted with the
 * same AUTH_SECRET the test server uses. This is the same JWE Auth.js issues after a real sign-in.
 */
export async function mintHostSession(ctx: BrowserContext, baseURL: string, hostName: string) {
  const { encode } = await import("@auth/core/jwt");
  const name = "authjs.session-token";
  const id = `dev:${hostName}`;
  const value = await encode({
    token: { name: hostName, email: `${hostName.replace(/\W+/g, "").toLowerCase()}@dev.local`, sub: id, hostId: id },
    secret: process.env.AUTH_SECRET ?? "test-secret",
    salt: name,
    maxAge: 60 * 60,
  });
  await ctx.addCookies([{ name, value, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}

export const IS_PROD = process.env.E2E_PROD === "1";
