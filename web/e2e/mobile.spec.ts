import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { SHOT_DIR } from "./audit";
import { castBallot, DEFAULT_CAST, openAndReady, Party, TV_1080, type Persona } from "./helpers";

/** Phone realities: orientation, flaky networks, odd names, and a full 16 person room on the TV. */

async function overflowers(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" && cs.pointerEvents === "none") return;
      for (let p: Element | null = el.parentElement; p; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(ps.overflowX) && p !== document.body && p !== document.documentElement) return; // contained
      }
      if (r.right > innerWidth + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}.${String(el.className).slice(0, 30)} ${Math.round(r.left)}..${Math.round(r.right)} of ${innerWidth}`);
    });
    return out.slice(0, 8);
  });
}

async function clippedText(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll("body *").forEach((el) => {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())) return;
      const cs = getComputedStyle(el);
      if ((cs.overflow !== "visible" || cs.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 2 && cs.display !== "inline")
        out.push(`${(el.textContent ?? "").trim().slice(0, 30)} (${el.scrollWidth}>${el.clientWidth})`);
    });
    return out.slice(0, 6);
  });
}

test.describe("orientation", () => {
  test("rotating a phone mid vote keeps the choice, avoids horizontal scroll and keeps the sticky bar small", async ({ browser }, info) => {
    test.skip(!/mobile/.test(info.project.name), "phone projects only");
    const party = new Party(browser, info);
    try {
      await party.bootstrap();
      await party.hostStart();
      for (const p of party.players) await openAndReady(p.page);
      for (const t of ["Act I: The Party", "The Death", "Act II", "Intermission", "Act III", "Act IV"]) await party.hostAdvance(t);
      const page = party.players[0].page;
      await expect(page.getByTestId("ballot")).toBeVisible({ timeout: 30_000 });
      await page.locator('[data-testid^="suspect-"]').nth(1).locator("xpath=ancestor::label").click();
      const portrait = page.viewportSize()!;
      await page.setViewportSize({ width: portrait.height, height: portrait.width });
      await page.waitForTimeout(500);
      await expect(page.locator('input[name="killer"]:checked')).toHaveCount(1);
      expect(await overflowers(page), "landscape overflow").toEqual([]);
      const hs = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
      expect(hs).toBeLessThanOrEqual(0);
      const sticky = await page.evaluate(() => {
        const el = document.querySelector(".sc-sticky") as HTMLElement | null;
        if (!el) return null;
        return { h: el.getBoundingClientRect().height, vh: innerHeight };
      });
      console.log(`[orientation] sticky bar in landscape: ${JSON.stringify(sticky)}`);
      if (sticky) expect.soft(sticky.h / sticky.vh, `sticky action bar covers ${(100 * sticky.h / sticky.vh).toFixed(0)} percent of a landscape phone`).toBeLessThan(0.4);
      await page.screenshot({ path: path.join(SHOT_DIR, `player-ballot-landscape-${info.project.name}.png`) });
      await page.setViewportSize(portrait);
      await page.waitForTimeout(300);
      await expect(page.locator('input[name="killer"]:checked')).toHaveCount(1);
    } finally { await party.closeAll(); }
  });
});

test.describe("network", () => {
  test("offline: the Reconnecting candle appears, the last state stays on screen, recovery is automatic", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.bootstrap();
      await party.hostStart();
      for (const p of party.players) await openAndReady(p.page);
      for (const t of ["Act I: The Party", "The Death", "Act II"]) await party.hostAdvance(t);
      const pl = party.players[0];
      const page = pl.page;
      await expect(page.getByTestId("clue").first()).toBeVisible({ timeout: 20_000 });
      const clues = await page.getByTestId("clue").count();
      await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "live");

      await pl.ctx.setOffline(true);
      await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "reconnecting", { timeout: 15_000 });
      await expect(page.getByTestId("connection-status")).toContainText("Reconnecting");
      await page.screenshot({ path: path.join(SHOT_DIR, `player-offline-${info.project.name}.png`) });
      // last state is still there
      await expect(page.getByTestId("clue")).toHaveCount(clues);
      await expect(page.getByTestId("player-screen")).toBeVisible();
      // an action while offline gives a friendly error, not a crash, and does not lose the screen
      await party.host.page.getByTestId("host-advance").click(); // host stays online: game moves to Intermission
      await expect(party.host.page.getByTestId("host-phase")).toContainText("Intermission", { timeout: 20_000 });
      await expect(page.getByTestId("player-phase")).toContainText("Act II"); // player still sees the old act

      const t0 = Date.now();
      await pl.ctx.setOffline(false);
      await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "live", { timeout: 20_000 });
      await expect(page.getByTestId("player-phase")).toContainText("Intermission", { timeout: 20_000 });
      const recovered = Date.now() - t0;
      console.log(`[offline] recovered in ${recovered} ms`);
      expect.soft(recovered, "recovery after the network returns").toBeLessThan(8_000);
    } finally { await party.closeAll(); }
  });

  test("flaky network: a failing server keeps the last state and backs off quietly", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.bootstrap();
      await party.hostStart();
      const pl = party.players[0];
      await openAndReady(pl.page);
      let failing = true;
      await pl.page.route("**/api/rooms/*/state*", (route) => (failing ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"overloaded"}' }) : route.continue()));
      await expect(pl.page.getByTestId("connection-status")).toHaveAttribute("data-status", "reconnecting", { timeout: 20_000 });
      await expect(pl.page.getByTestId("character-card")).toBeVisible();
      // a visible raw error message is allowed but must be friendly (no stack, no JSON)
      const err = await pl.page.getByTestId("player-error").textContent().catch(() => "");
      expect.soft(err ?? "", "error text shown to a child should be friendly").not.toMatch(/\{|\}|503|undefined|TypeError/);
      failing = false;
      await expect(pl.page.getByTestId("connection-status")).toHaveAttribute("data-status", "live", { timeout: 30_000 });
    } finally { await party.closeAll(); }
  });
});

const NAMES: Persona[] = [
  { name: "WWWWWWWWWWWWWWWWWWWWWWWW", age: "adult" },
  { name: "Bartholomew 🎃👻🕯️ Max", age: "adult" },
  { name: "Zażółć gęślą jaźń ŽČŠ", age: "kid", wantsVictim: true },
  { name: "اسم طويل جدا للاعب", age: "adult" },
];

test.describe("long names, emoji, right to left", () => {
  test("every surface copes: no overflow, no clipping, names intact", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.openHost();
      await party.hostSignIn();
      await party.runWizard();
      await party.openTv();
      await party.tv.page.goto(`/screen/${party.code}`);
      await expect(party.tv.page.getByTestId("tv-lobby")).toBeVisible({ timeout: 60_000 });
      await party.joinAll(NAMES);
      const check = async (label: string, page: Page) => {
        expect.soft(await overflowers(page), `${label}: elements past the viewport edge`).toEqual([]);
        expect.soft(await clippedText(page), `${label}: clipped text`).toEqual([]);
        const hs = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
        expect.soft(hs, `${label}: horizontal scroll`).toBeLessThanOrEqual(0);
      };
      await expect(party.host.page.getByTestId("host-guest")).toHaveCount(4, { timeout: 30_000 });
      await expect(party.host.page.getByTestId("host-guests")).toContainText("Bartholomew");
      await check("host lobby", party.host.page);
      await expect(party.tv.page.getByTestId("tv-guests")).toContainText("WWWW", { timeout: 20_000 });
      await check("tv lobby", party.tv.page);
      await check("player lobby", party.players[0].page);
      await party.hostStart();
      for (const p of party.players) await openAndReady(p.page);
      await check("player card", party.players[1].page);
      await party.players[2].page.getByTestId("card-hide").click();
      await check("host cast", party.host.page);
      await check("tv game", party.tv.page);
      for (const t of ["Act I: The Party", "The Death", "Act II", "Intermission", "Act III", "Act IV"]) await party.hostAdvance(t);
      for (const p of party.players) await castBallot(p.page);
      await party.hostAdvance("Act V");
      await expect(party.players[0].page.getByTestId("reveal")).toBeVisible({ timeout: 20_000 });
      await check("player reveal", party.players[0].page);
      await check("tv reveal", party.tv.page);
      await check("host reveal", party.host.page);
      await expect(party.players[0].page.getByTestId("reveal-scores")).toContainText("Bartholomew 🎃👻🕯️ Max");
      await expect(party.players[0].page.getByTestId("reveal-scores")).toContainText("اسم طويل");
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await party.tv.page.screenshot({ path: path.join(SHOT_DIR, `screen-longnames-reveal-${info.project.name}.png`) });
      await party.players[0].page.screenshot({ path: path.join(SHOT_DIR, `player-longnames-reveal-${info.project.name}.png`), fullPage: true });
    } finally { await party.closeAll(); }
  });
});

test.describe("16 players on the big screen", () => {
  test("lobby, game and reveal layouts hold a full 16 person room on 1920x1080", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.openHost();
      await party.hostSignIn();
      await party.runWizard();
      await party.openTv(TV_1080);
      const tp = party.tv.page;
      await tp.goto(`/screen/${party.code}`);
      await expect(tp.getByTestId("tv-lobby")).toBeVisible({ timeout: 60_000 });
      const ages = ["adult", "adult", "adult", "adult", "adult", "adult", "adult", "adult", "adult", "kid", "kid", "kid", "kid", "teen", "teen", "little"];
      for (let i = 0; i < 16; i++) {
        const r = await party.host.ctx.request.post(`/api/rooms/${party.code}/join`, {
          data: { name: `Guest ${String(i + 1).padStart(2, "0")} ${["Ada", "Basil", "Cora", "Dmitri", "Eliza", "Fergus", "Gwen", "Hugo", "Ingrid", "Jules", "Kit", "Lena", "Moe", "Nia", "Otto", "Pia"][i]}`, ageGroup: ages[i] },
          headers: { "x-forwarded-for": party.ip },
        });
        expect(r.ok(), await r.text()).toBe(true);
      }
      await expect(tp.getByTestId("tv-guests").locator("li")).toHaveCount(16, { timeout: 30_000 });
      const fits = async (label: string) => {
        const m = await tp.evaluate(() => ({ sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, vh: innerHeight, vw: innerWidth }));
        console.log(`[tv16 ${label}] ${JSON.stringify(m)}`);
        expect.soft(m.sw, `${label}: horizontal overflow`).toBeLessThanOrEqual(m.vw);
        expect.soft(m.sh, `${label}: the TV page is taller than the screen (${m.sh}px vs ${m.vh}px); nobody can scroll a TV`).toBeLessThanOrEqual(m.vh + 2);
        expect.soft(await overflowers(tp), `${label}: elements off screen`).toEqual([]);
      };
      await tp.waitForTimeout(500);
      await fits("lobby");
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await tp.screenshot({ path: path.join(SHOT_DIR, "screen-16-lobby.png") });

      await party.hostStart();
      await expect(tp.getByTestId("tv-game")).toBeVisible({ timeout: 30_000 });
      await tp.waitForTimeout(500);
      const shown = await tp.getByTestId("tv-cast").locator("li").count();
      expect.soft(shown, `the cast strip shows ${shown} of 16 players`).toBe(16);
      await fits("game");
      await tp.screenshot({ path: path.join(SHOT_DIR, "screen-16-game.png") });
      for (const t of ["Act I: The Party", "The Death", "Act II", "Intermission", "Act III"]) await party.hostAdvance(t);
      await tp.waitForTimeout(500);
      await fits("clues");
      await tp.screenshot({ path: path.join(SHOT_DIR, "screen-16-clues.png") });
      await party.hostAdvance("Act IV");
      await tp.waitForTimeout(400);
      await fits("ballots");
      await party.hostAdvance("Act V");
      await expect(tp.getByTestId("tv-reveal")).toBeVisible({ timeout: 20_000 });
      await tp.waitForTimeout(500);
      await fits("reveal");
      await tp.screenshot({ path: path.join(SHOT_DIR, "screen-16-reveal.png") });
      const scores = await tp.getByTestId("tv-reveal").locator("ol li").count();
      expect.soft(scores, `reveal shows ${scores} of 16 scores`).toBeGreaterThanOrEqual(3);
    } finally { await party.closeAll(); }
  });
});

export { DEFAULT_CAST };
