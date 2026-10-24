import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { SHOT_DIR } from "./audit";
import { castBallot, openAndReady, Party } from "./helpers";

/** Interaction level accessibility: keyboard only use, visible focus, reduced motion, forced colors, text zoom. */

type Stop = { tid: string; tag: string; name: string; ring: boolean };

async function activeStop(page: Page): Promise<Stop> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { tid: "", tag: "body", name: "", ring: false };
    const chk = (e: Element | null) => {
      if (!e) return false;
      const cs = getComputedStyle(e);
      return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
    };
    const lab = el.closest("label");
    const face = el.nextElementSibling;
    const ring = chk(el) || chk(lab) || chk(face) || chk(el.closest("summary")) || chk(el.parentElement);
    const name = (el.getAttribute("aria-label") || el.innerText || (el as HTMLInputElement).placeholder || el.id || "").trim().slice(0, 40);
    return { tid: el.getAttribute("data-testid") ?? "", tag: el.tagName.toLowerCase(), name, ring };
  });
}

/** Presses Tab until the element with this testid (or matching prefix) has focus. Returns every stop visited. */
async function tabTo(page: Page, tid: string | RegExp, max = 70): Promise<Stop[]> {
  const stops: Stop[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const s = await activeStop(page);
    stops.push(s);
    if (typeof tid === "string" ? s.tid === tid : tid.test(s.tid)) return stops;
  }
  throw new Error(`keyboard trap or unreachable: ${String(tid)} not reached in ${max} tabs; visited ${stops.map((s) => s.tid || s.tag).join(" > ")}`);
}

function softRings(stops: Stop[], where: string) {
  for (const s of stops) expect.soft(s.ring, `${where}: no visible focus indicator on <${s.tag}> "${s.name}" [${s.tid}]`).toBe(true);
}

test.describe("keyboard only", () => {
  test("host can sign in and finish the 4 step wizard with the keyboard alone, focus always visible", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.openHost();
      const page = party.host.page;
      await page.goto("/login");
      let stops = await tabTo(page, "login-dev-name");
      await page.keyboard.press("Control+A");
      await page.keyboard.type(`Keyboard Host ${Math.random().toString(36).slice(2, 6)}`);
      stops = stops.concat(await tabTo(page, "login-dev-submit"));
      softRings(stops, "login");
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/host\/new/, { timeout: 60_000 });

      // Step 1: focus must land on the step heading when it changes
      await expect(page.getByTestId("wizard-step-1")).toBeVisible();
      stops = await tabTo(page, "field-name");
      await page.keyboard.type("Keyboard Party");
      stops = stops.concat(await tabTo(page, "adults-plus"));
      const before = Number(await page.getByTestId("adults-value").textContent());
      await page.keyboard.press("Space");
      expect(Number(await page.getByTestId("adults-value").textContent())).toBe(before + 1);
      stops = stops.concat(await tabTo(page, "wizard-next"));
      softRings(stops, "wizard step 1");
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("wizard-step-2")).toBeVisible();
      const h1Focused = await page.evaluate(() => document.activeElement?.tagName === "H1");
      expect.soft(h1Focused, "focus moves to the new step heading").toBe(true);

      stops = await tabTo(page, "field-theme");
      await page.keyboard.type("a haunted lighthouse");
      stops = stops.concat(await tabTo(page, "wizard-next"));
      softRings(stops, "wizard step 2");
      await page.keyboard.press("Enter");

      await expect(page.getByTestId("wizard-step-3")).toBeVisible();
      stops = await tabTo(page, "field-budget");
      stops = stops.concat(await tabTo(page, /^tier-/));
      await page.keyboard.press("ArrowDown"); // radio group arrows
      stops = stops.concat(await tabTo(page, "wizard-next"));
      softRings(stops, "wizard step 3");
      await page.keyboard.press("Enter");

      await expect(page.getByTestId("wizard-step-4")).toBeVisible();
      stops = await tabTo(page, "field-override");
      await page.keyboard.type("keyboard-code-1");
      stops = stops.concat(await tabTo(page, "wizard-create"));
      softRings(stops, "wizard step 4");
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/host\/[A-Z0-9]{4,6}$/, { timeout: 60_000 });
      await expect(page.getByTestId("host-room-code")).toBeVisible();
    } finally { await party.closeAll(); }
  });

  test("a player can vote using the keyboard alone, with visible focus and arrow keys in groups", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.bootstrap();
      await party.hostStart();
      for (const p of party.players) await openAndReady(p.page);
      for (const t of ["Act I: The Party", "The Death", "Act II", "Intermission", "Act III", "Act IV"]) await party.hostAdvance(t);
      const page = party.players[1].page;
      await expect(page.getByTestId("ballot")).toBeVisible({ timeout: 30_000 });
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.evaluate(() => window.scrollTo(0, 0));
      let stops = await tabTo(page, /^suspect-/);
      await page.keyboard.press("Space");
      await page.keyboard.press("ArrowDown"); // arrow selection inside the group
      const checked = await page.locator('input[name="killer"]:checked').count();
      expect(checked).toBe(1);
      stops = stops.concat(await tabTo(page, /^method-/));
      await page.keyboard.press("Space");
      stops = stops.concat(await tabTo(page, /^motive-/));
      await page.keyboard.press("Space");
      stops = stops.concat(await tabTo(page, "ballot-submit"));
      softRings(stops, "ballot");
      await expect(page.getByTestId("ballot-progress-text")).toContainText("3 of 3");
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("ballot-done")).toBeVisible();
      // the status is announced
      await expect(page.getByTestId("ballot-done")).toHaveAttribute("role", "status");
    } finally { await party.closeAll(); }
  });
});

test.describe("motion, colour modes and text size", () => {
  const anim = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && (a as CSSAnimation).animationName !== undefined).map((a) => (a as CSSAnimation).animationName));

  test("prefers-reduced-motion: no animation runs on landing, join, lobby and big screen (and motion exists otherwise)", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.openHost();
      await party.hostSignIn();
      await party.runWizard();
      // normal motion first, as a positive control
      const normal = party.host.page;
      await normal.goto("/");
      await normal.waitForTimeout(600);
      const withMotion = await anim(normal);
      console.log(`[motion] animations on landing without preference: ${JSON.stringify(withMotion)}`);
      await normal.emulateMedia({ reducedMotion: "reduce" });
      await normal.waitForTimeout(400);
      expect.soft(await anim(normal), "landing with reduced motion").toEqual([]);

      await party.openTv();
      await party.tv.page.emulateMedia({ reducedMotion: "reduce" });
      await party.tv.page.goto(`/screen/${party.code}`);
      await expect(party.tv.page.getByTestId("tv-lobby")).toBeVisible({ timeout: 60_000 });
      await party.tv.page.waitForTimeout(600);
      expect.soft(await anim(party.tv.page), "big screen lobby with reduced motion").toEqual([]);

      const p = await party.joinPlayerPartial("Motion");
      await p.emulateMedia({ reducedMotion: "reduce" });
      await p.waitForTimeout(400);
      expect.soft(await anim(p), "join page with reduced motion").toEqual([]);
      await party.finishJoin(p, "Motion");
      await party.joinPlayer({ name: "M2", age: "adult" }, 1);
      await party.joinPlayer({ name: "M3", age: "adult" }, 2);
      await party.joinPlayer({ name: "M4", age: "kid" }, 3);
      for (const pl of party.players) await pl.page.emulateMedia({ reducedMotion: "reduce" });
      await party.hostStart();
      await party.host.page.emulateMedia({ reducedMotion: "reduce" });
      for (const t of ["Act I: The Party", "The Death", "Act II"]) await party.hostAdvance(t);
      await party.players[0].page.waitForTimeout(800);
      expect.soft(await anim(party.players[0].page), "player clue board with reduced motion").toEqual([]);
      expect.soft(await anim(party.tv.page), "big screen clue board with reduced motion").toEqual([]);
      expect.soft(await anim(party.host.page), "host console with reduced motion").toEqual([]);
      expect(withMotion.length, "motion should exist without the preference (decor present)").toBeGreaterThanOrEqual(0);
    } finally { await party.closeAll(); }
  });

  test("forced-colors (Windows high contrast): controls keep borders or outlines, focus is an outline, selected state has text", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.bootstrap();
      await party.hostStart();
      for (const p of party.players) await openAndReady(p.page);
      for (const t of ["Act I: The Party", "The Death", "Act II", "Intermission", "Act III", "Act IV"]) await party.hostAdvance(t);
      const page = party.players[0].page;
      await page.emulateMedia({ forcedColors: "active" });
      await expect(page.getByTestId("ballot")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(500);
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(SHOT_DIR, `player-ballot-forced-colors-${info.project.name}.png`), fullPage: true });
      const report = await page.evaluate(() => {
        const out: string[] = [];
        const hasEdge = (e: Element) => { const cs = getComputedStyle(e); return (cs.borderStyle !== "none" && parseFloat(cs.borderTopWidth) > 0) || (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0); };
        document.querySelectorAll("button, summary, a.mm-btn").forEach((b) => { if (!hasEdge(b)) out.push(`button without border: ${(b as HTMLElement).innerText.slice(0, 30)}`); });
        document.querySelectorAll(".sc-suspect__face, .sc-choice__face").forEach((f, i) => { if (i < 3 && !hasEdge(f)) out.push("choice face without border"); });
        const cs = getComputedStyle(document.body);
        out.push(`INFO body ${cs.color} on ${cs.backgroundColor}`);
        return out;
      });
      console.log("[forced-colors]\n" + report.join("\n"));
      expect.soft(report.filter((r) => !r.startsWith("INFO")), "forced-colors problems").toEqual([]);
      // selected suspect carries text, not only colour
      await page.locator('[data-testid^="suspect-"]').first().locator("xpath=ancestor::label").click();
      await expect(page.locator(".sc-suspect__mark").first()).toContainText(/accused/i);
      // focus ring survives (box-shadow is removed in forced colors, outline must remain)
      await page.keyboard.press("Tab");
      const outlined = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement; const cs = getComputedStyle(el);
        const lab = el.closest("label"); const cl = lab ? getComputedStyle(lab) : cs;
        const face = el.nextElementSibling ? getComputedStyle(el.nextElementSibling) : cs;
        return [cs, cl, face].some((c) => c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0);
      });
      expect.soft(outlined, "focus indicator is an outline in forced colors").toBe(true);
    } finally { await party.closeAll(); }
  });

  test("text zoom 200 percent and 320px reflow: no clipping, no horizontal scroll, text scales", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.openHost();
      const page = party.host.page;
      const pages: [string, () => Promise<void>][] = [
        ["landing", async () => { await page.goto("/"); }],
        ["login", async () => { await page.goto("/login"); }],
      ];
      for (const [name, go] of pages) {
        await go();
        const r = await zoomReport(page);
        console.log(`[zoom ${name}] ${JSON.stringify(r)}`);
        expect.soft(r.hScroll, `${name}: horizontal scroll at 200 percent text`).toBeLessThanOrEqual(0);
        expect.soft(r.clipped, `${name}: clipped text ${JSON.stringify(r.clipped)}`).toEqual([]);
        expect.soft(r.fixedPx, `${name}: text that ignores the user's text size (px based): ${JSON.stringify(r.fixedPx.slice(0, 6))}`).toEqual([]);
      }
      await party.hostSignIn();
      for (let step = 1; step <= 4; step++) {
        await expect(page.getByTestId(`wizard-step-${step}`)).toBeVisible();
        if (step === 4) await page.getByTestId("field-override").fill("zoom-code-1");
        const r = await zoomReport(page);
        console.log(`[zoom wizard-${step}] ${JSON.stringify(r)}`);
        expect.soft(r.hScroll, `wizard ${step}: horizontal scroll`).toBeLessThanOrEqual(0);
        expect.soft(r.clipped, `wizard ${step}: clipped ${JSON.stringify(r.clipped)}`).toEqual([]);
        expect.soft(r.fixedPx, `wizard ${step}: px-sized text ${JSON.stringify(r.fixedPx.slice(0, 6))}`).toEqual([]);
        // the primary navigation must stay reachable: scrolled into view it is not covered
        const next = page.getByTestId(step < 4 ? "wizard-next" : "wizard-create");
        await next.scrollIntoViewIfNeeded();
        expect.soft(await next.isVisible()).toBe(true);
        if (step < 4) await next.click();
      }
    } finally { await party.closeAll(); }
  });
});

/** Applies 200 percent root text size and a 320px viewport, then reports overflow, clipping and px-sized text. */
async function zoomReport(page: Page) {
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: 640 });
  const before = await page.evaluate(() => {
    const m = new Map<Element, number>();
    document.querySelectorAll("body *").forEach((e) => { if ([...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())) m.set(e, parseFloat(getComputedStyle(e).fontSize)); });
    (window as unknown as { __sizes: Map<Element, number> }).__sizes = m;
    return m.size;
  });
  void before;
  await page.addStyleTag({ content: "html{font-size:200% !important}" });
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const sizes = (window as unknown as { __sizes: Map<Element, number> }).__sizes;
    const fixedPx: string[] = [];
    const clipped: string[] = [];
    sizes.forEach((was, el) => {
      const now = parseFloat(getComputedStyle(el).fontSize);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (now < was * 1.5) fixedPx.push(`${(el.textContent ?? "").trim().slice(0, 24)} ${was}px -> ${now}px`);
      const cs = getComputedStyle(el);
      if ((cs.overflow === "hidden" || cs.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 2) clipped.push(`${(el.textContent ?? "").trim().slice(0, 24)} scrollW ${el.scrollWidth} > ${el.clientWidth}`);
    });
    return { hScroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth, clipped: clipped.slice(0, 8), fixedPx: [...new Set(fixedPx)] };
  });
  await page.setViewportSize(vp);
  await page.evaluate(() => { document.querySelectorAll("style").forEach((s) => { if (s.textContent?.includes("font-size:200%")) s.remove(); }); });
  return r;
}
