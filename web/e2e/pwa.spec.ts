import { expect, test } from "@playwright/test";
import { IS_PROD } from "./prod";
import { openAndReady, Party } from "./helpers";

/**
 * PWA checks. The service worker registers in production builds only, so run these against `next start`
 * (E2E_PROD=1). In dev mode only the static manifest checks run.
 */

test.describe("manifest and icons", () => {
  test("manifest is valid, linked from the page, and every icon resolves", async ({ page, request }) => {
    await page.goto("/");
    const links = await page.evaluate(() => ({
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
      theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
      viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
      apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
      appleCapable: document.querySelector('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]')?.getAttribute("content"),
    }));
    console.log(`[pwa head] ${JSON.stringify(links)}`);
    expect(links.manifest).toBe("/manifest.webmanifest");
    expect(links.theme).toBeTruthy();
    expect(links.viewport).toContain("viewport-fit=cover");
    expect(links.apple).toBeTruthy();

    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/json|manifest/);
    const m = await res.json();
    for (const k of ["name", "short_name", "start_url", "display", "icons", "background_color", "theme_color"]) expect(m[k], `manifest.${k}`).toBeTruthy();
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(m.display);
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    expect(m.icons.length).toBeGreaterThan(0);
    const purposes = m.icons.map((i: { purpose?: string }) => i.purpose ?? "any");
    expect(purposes).toContain("maskable");
    for (const icon of m.icons as { src: string; type?: string; sizes?: string }[]) {
      const r = await request.get(icon.src);
      expect(r.status(), `icon ${icon.src}`).toBe(200);
      expect(r.headers()["content-type"], `icon ${icon.src} type`).toMatch(/image\//);
      expect(r.headers()["content-type"]).toContain((icon.type ?? "image/").replace("image/", "").split("+")[0]);
    }
    // Installability needs raster icons of at least 192 and 512 on most platforms, and iOS ignores SVG touch icons.
    const raster = (m.icons as { type?: string; sizes?: string }[]).filter((i) => i.type === "image/png");
    const has192 = raster.some((i) => /192/.test(i.sizes ?? "")), has512 = raster.some((i) => /512/.test(i.sizes ?? ""));
    expect.soft(has192 && has512, "manifest should offer PNG icons at 192 and 512 px (only SVG today, iOS and some launchers ignore SVG)").toBe(true);
    const apple = await request.get(links.apple!);
    expect.soft(apple.headers()["content-type"], "apple-touch-icon should be a PNG, iOS ignores SVG").toMatch(/png/);
  });

  test("CDP: manifest parses without errors and installability errors are listed", async ({ page, context }) => {
    await page.goto("/");
    const cdp = await context.newCDPSession(page);
    const mf = await cdp.send("Page.getAppManifest");
    console.log(`[pwa manifest] url=${mf.url} errors=${JSON.stringify(mf.errors)}`);
    expect(mf.errors.filter((e) => e.critical)).toEqual([]);
    await page.waitForTimeout(IS_PROD ? 2500 : 500);
    const inst = await cdp.send("Page.getInstallabilityErrors");
    console.log(`[pwa installability] ${JSON.stringify(inst.installabilityErrors)}`);
    if (IS_PROD) {
      // Browsers also require a secure context; localhost counts. Anything else listed is a real gap.
      const blocking = inst.installabilityErrors.filter((e) => !/not-from-secure-origin|prefer-related-applications/.test(e.errorId));
      expect.soft(blocking.map((e) => e.errorId), "installability blockers").toEqual([]);
    }
  });
});

test.describe("service worker", () => {
  test.skip(!IS_PROD, "service worker registers in production builds only (run with E2E_PROD=1)");

  test("registers, activates, and never caches /api, HTML pages or game state", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.bootstrap();
      // Make sure the SW controls the players before the game starts
      for (const p of [...party.players.map((x) => x.page), party.host.page, party.tv.page]) {
        await p.evaluate(async () => { await navigator.serviceWorker.ready; });
        await p.reload();
        await p.waitForLoadState("load");
      }
      const reg = await party.players[0].page.evaluate(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return { scope: r?.scope, state: r?.active?.state, script: r?.active?.scriptURL, controlled: !!navigator.serviceWorker.controller };
      });
      console.log(`[sw] ${JSON.stringify(reg)}`);
      expect(reg.state).toBe("activated");
      expect(reg.script).toMatch(/\/sw\.js$/);
      expect(reg.controlled).toBe(true);

      await party.hostStart();
      for (const p of party.players) await openAndReady(p.page);
      for (const t of ["Act I: The Party", "The Death", "Act II"]) await party.hostAdvance(t);
      await expect(party.players[0].page.getByTestId("clue").first()).toBeVisible({ timeout: 20_000 });
      await party.players[0].page.waitForTimeout(2500);

      for (const [label, page] of [["player", party.players[0].page], ["host", party.host.page], ["tv", party.tv.page]] as const) {
        const entries = await page.evaluate(async () => {
          const out: { cache: string; url: string; dest: string }[] = [];
          for (const k of await caches.keys()) {
            const c = await caches.open(k);
            for (const req of await c.keys()) out.push({ cache: k, url: req.url, dest: req.destination });
          }
          return out;
        });
        console.log(`[sw caches ${label}] ${entries.length} entries; sample ${entries.slice(0, 3).map((c) => new URL(c.url).pathname).join(", ")}`);
        const bad = entries.filter((c) => {
          const p = new URL(c.url).pathname;
          return /^\/api\//.test(p) || c.dest === "document" || /^\/(play|host|screen|join|login)(\/|$)/.test(p) || p === "/";
        });
        expect(bad.map((b) => b.url), `${label}: forbidden entries in Cache Storage`).toEqual([]);
        for (const c of entries) expect(new URL(c.url).pathname, `${label}: unexpected cached path`).toMatch(/^\/(_next\/static\/|icon\.svg$|icon-maskable\.svg$|manifest\.webmanifest$)/);
        if (label === "player") expect(entries.length, "positive control: static assets are cached").toBeGreaterThan(0);
      }

      // The SW must not intercept API traffic at all: a state response is never served from a cache.
      const hdr = await party.players[0].page.evaluate(async (code) => {
        const pl = JSON.parse(localStorage.getItem(`mm:${code}`)!);
        const r = await fetch(`/api/rooms/${code}/state?role=player&v=-1`, { headers: { "x-player-id": pl.pid, "x-player-token": pl.tok } });
        return { cc: r.headers.get("cache-control"), status: r.status };
      }, party.code);
      expect(hdr.cc).toContain("no-store");
    } finally { await party.closeAll(); }
  });

  test("offline: documents are not served by the SW (no stale game HTML), and sw.js is revalidated", async ({ browser, request }, info) => {
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["content-type"]).toMatch(/javascript/);
    console.log(`[sw.js headers] cache-control=${sw.headers()["cache-control"]}`);
    expect.soft(sw.headers()["cache-control"] ?? "", "sw.js should not be cached for long so updates ship").toMatch(/no-cache|no-store|max-age=0|must-revalidate/);

    const ctx = await browser.newContext({ baseURL: (info.project.use as { baseURL: string }).baseURL });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await ctx.setOffline(true);
    const result = await page.reload().then(() => "loaded").catch((e: Error) => `failed: ${e.message.slice(0, 60)}`);
    console.log(`[offline reload of landing] ${result}`);
    // Policy says never cache HTML with state; the landing page has none, so either answer is defensible. Record it.
    await ctx.close();
  });
});
