import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { IS_PROD } from "./prod";
import { openAndReady, Party } from "./helpers";

/** LCP, CLS, long tasks and transfer sizes. Only meaningful against a production build (E2E_PROD=1). */

const INIT = `
  window.__perf = { lcp: 0, cls: 0, fcp: 0, longTasks: 0, longMs: 0, shifts: [] };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) { window.__perf.cls += e.value; window.__perf.shifts.push({ v: Math.round(e.value*1000)/1000, t: Math.round(e.startTime), src: (e.sources||[]).map(s => s.node && (s.node.nodeName + (s.node.getAttribute ? '[' + (s.node.getAttribute('data-testid')||'') + ']' : ''))).join(',') }); } } }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__perf.longTasks++; window.__perf.longMs += e.duration; } }).observe({ type: 'longtask', buffered: true });
`;

async function metrics(page: Page) {
  return page.evaluate(() => {
    const p = (window as unknown as { __perf: Record<string, unknown> }).__perf;
    const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const js = res.filter((r) => /\.js(\?|$)/.test(r.name));
    return {
      lcp: Math.round(p.lcp as number), cls: Math.round((p.cls as number) * 1000) / 1000, fcp: Math.round(p.fcp as number),
      longTasks: p.longTasks as number, longMs: Math.round(p.longMs as number), shifts: p.shifts as unknown[],
      jsKb: Math.round(js.reduce((a, r) => a + (r.transferSize || r.encodedBodySize), 0) / 1024),
      totalKb: Math.round(res.reduce((a, r) => a + (r.transferSize || r.encodedBodySize), 0) / 1024) + Math.round(nav.transferSize / 1024),
      requests: res.length, dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd),
    };
  });
}

test.describe("performance", () => {
  test.skip(!IS_PROD, "performance numbers are only meaningful against a production build (E2E_PROD=1)");

  test("landing page: LCP, CLS, JS weight, long tasks (normal network)", async ({ browser }, info) => {
    const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: (info.project.use as { baseURL: string }).baseURL });
    const page = await ctx.newPage();
    await page.addInitScript(INIT);
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const m = await metrics(page);
    console.log(`[perf landing ${info.project.name}] ${JSON.stringify(m)}`);
    expect.soft(m.lcp, "LCP under 2.5 s").toBeLessThan(2500);
    expect.soft(m.cls, "CLS under 0.1").toBeLessThan(0.1);
    expect.soft(m.jsKb, "first load JS under 250 kB").toBeLessThan(250);
    await ctx.close();
  });

  test("landing page on Slow 3G with 4x CPU slowdown", async ({ browser }, info) => {
    test.skip(info.project.name !== "mobile-small", "one project is enough for throttled runs");
    const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: (info.project.use as { baseURL: string }).baseURL });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(INIT);
    const t0 = Date.now();
    await page.goto("/", { waitUntil: "load", timeout: 120_000 });
    await page.getByTestId("landing-join-code").fill("ABCD");
    await expect(page.getByTestId("landing-join-submit")).toBeEnabled();
    const interactive = Date.now() - t0;
    await page.waitForTimeout(1500);
    const m = await metrics(page);
    console.log(`[perf landing slow3g] interactive after ${interactive} ms ${JSON.stringify(m)}`);
    await page.screenshot({ path: "/tmp/mm-slow3g.png" });
    expect.soft(m.lcp, "LCP on Slow 3G").toBeLessThan(8000);
    expect.soft(interactive, "usable on Slow 3G").toBeLessThan(15000);
    await ctx.close();
  });

  test("play page and big screen: LCP and CLS on load, CLS while clues arrive, chrome trace summary", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.bootstrap();
      await party.hostStart();
      for (const p of party.players) await openAndReady(p.page);
      const pl = party.players[0];
      await pl.page.addInitScript(INIT);
      await party.tv.page.addInitScript(INIT);

      const tracePath = "/tmp/mm-play-trace.json";
      await browser.startTracing(pl.page, { path: tracePath, categories: ["devtools.timeline", "loading", "v8.execute", "blink.user_timing"] });
      await pl.page.reload({ waitUntil: "load" });
      await expect(pl.page.getByTestId("player-screen")).toBeVisible({ timeout: 20_000 });
      await pl.page.waitForTimeout(2000);
      await browser.stopTracing();
      const mp = await metrics(pl.page);
      console.log(`[perf play ${info.project.name}] ${JSON.stringify(mp)}`);

      const events = (JSON.parse(fs.readFileSync(tracePath, "utf8")).traceEvents ?? []) as { name: string; dur?: number; ph: string }[];
      const tasks = events.filter((e) => e.name === "RunTask" && e.dur).map((e) => e.dur! / 1000);
      const scripts = events.filter((e) => e.name === "EvaluateScript" && e.dur).reduce((a, e) => a + e.dur! / 1000, 0);
      console.log(`[trace play] events=${events.length} tasks>50ms=${tasks.filter((t) => t > 50).length} longest=${Math.round(Math.max(0, ...tasks))}ms scriptEval=${Math.round(scripts)}ms`);

      // layout shift while the evidence board fills up
      await party.hostAdvance("Act I: The Party");
      await party.hostAdvance("The Death");
      const before = (await metrics(pl.page)).cls;
      await party.hostAdvance("Act II");
      await expect(pl.page.getByTestId("clue").first()).toBeVisible({ timeout: 20_000 });
      await pl.page.waitForTimeout(1500);
      const after = await metrics(pl.page);
      console.log(`[perf play clues arriving] CLS ${before} -> ${after.cls}; shifts ${JSON.stringify(after.shifts)}`);

      await party.tv.page.reload({ waitUntil: "load" });
      await expect(party.tv.page.getByTestId("tv-game")).toBeVisible({ timeout: 20_000 });
      await party.tv.page.waitForTimeout(2000);
      const mt = await metrics(party.tv.page);
      console.log(`[perf tv] ${JSON.stringify(mt)}`);

      expect.soft(mp.lcp, "play page LCP").toBeLessThan(2500);
      expect.soft(mp.cls, "play page CLS on load").toBeLessThan(0.1);
      expect.soft(after.cls - before, "CLS added when clues arrive").toBeLessThan(0.1);
      expect.soft(mt.lcp, "big screen LCP").toBeLessThan(2500);
      expect.soft(mt.cls, "big screen CLS").toBeLessThan(0.1);
    } finally { await party.closeAll(); }
  });
});
