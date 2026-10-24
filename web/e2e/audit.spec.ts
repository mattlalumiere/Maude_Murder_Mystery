import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { axeScan, contrastAudit, measure, parseRgb, ratio, readJson, SHOT_DIR, writeJson, type AxeFinding, type Measure } from "./audit";
import { castBallot, openAndReady, Party } from "./helpers";

/**
 * Walks one complete game and, at every screen and key state, records: axe results (360 and 1920 wide),
 * layout measures (horizontal scroll, 44 px targets, headings, font sizes, primary action position) and
 * screenshots. Later tests in this serial file turn the recorded data into pass/fail assertions.
 */

type Snap = { state: string; role: "host" | "player" | "screen" | "anon"; width: number; m: Measure; axe?: { violations: AxeFinding[]; incomplete: AxeFinding[] }; contrast?: Awaited<ReturnType<typeof contrastAudit>> };

const SIZES = { phone: { width: 360, height: 740 }, desktop: { width: 1280, height: 800 }, tv: { width: 1920, height: 1080 } } as const;
type Shot = keyof typeof SIZES;

let snaps: Snap[] = [];
let consoleErrors: string[] = [];
let walked = false;

test.describe.serial("audit walk", () => {
  test("walk the whole game and record", async ({ browser }, info) => {
    test.setTimeout(900_000);
    const full = info.project.name === "mobile-small"; // two widths + screenshots only once, to bound run time
    const party = new Party(browser, info);
    snaps = [];
    const shotDir = path.join(SHOT_DIR);
    fs.mkdirSync(shotDir, { recursive: true });

    async function settle(page: Page) { await page.waitForTimeout(350); }

    async function snap(state: string, role: Snap["role"], page: Page, shots: Shot[] = []) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await settle(page);
      const native = page.viewportSize()!;
      const widths = full ? [320, 360, 390, 1920] : [native.width];
      for (const w of widths) {
        if (full) { await page.setViewportSize({ width: w, height: w < 500 ? 740 : 1080 }); await settle(page); }
        const m = await measure(page);
        const both = !full || w === 360 || w === 1920;
        const axe = both ? await axeScan(page) : undefined;
        const contrast = role === "screen" && w >= 1900 ? await contrastAudit(page) : undefined;
        snaps.push({ state, role, width: w, m, axe, contrast });
      }
      if (full) {
        for (const s of shots) {
          await page.setViewportSize(SIZES[s]); await settle(page);
          await page.screenshot({ path: path.join(shotDir, `${role}-${state}-${s}.png`), fullPage: s === "phone" });
        }
        await page.setViewportSize(native); await settle(page);
      }
    }

    try {
      await party.openHost();
      const hp = party.host.page;

      // ---- anonymous screens
      await hp.goto("/");
      await expect(hp.getByTestId("landing-hero")).toBeVisible();
      await snap("landing", "anon", hp, ["phone", "desktop"]);
      await hp.goto("/login");
      await expect(hp.getByTestId("login-dev-name")).toBeVisible();
      await snap("login", "anon", hp, ["phone"]);

      await party.hostSignIn();
      await expect(hp.getByTestId("wizard-step-1")).toBeVisible();
      await snap("wizard-1", "host", hp, ["phone", "desktop"]);
      // error state: too few guests
      for (const k of ["adults", "kids", "toddlers"]) {
        const n = Number(await hp.getByTestId(`${k}-value`).textContent());
        for (let i = 0; i < n; i++) await hp.getByTestId(`${k}-minus`).click();
      }
      await hp.getByTestId("wizard-next").click();
      await expect(hp.getByTestId("wizard-error")).toBeVisible();
      await snap("wizard-1-error", "host", hp, ["phone"]);
      await hp.reload();
      await hp.getByTestId("wizard-next").click();
      await expect(hp.getByTestId("wizard-step-2")).toBeVisible();
      await snap("wizard-2", "host", hp, ["phone"]);
      await hp.getByTestId("wizard-next").click();
      await expect(hp.getByTestId("wizard-step-3")).toBeVisible();
      await snap("wizard-3", "host", hp, ["phone"]);
      await hp.getByTestId("wizard-next").click();
      await expect(hp.getByTestId("wizard-step-4")).toBeVisible();
      await hp.getByTestId("field-override").fill("t5-secret-code");
      await snap("wizard-4", "host", hp, ["phone"]);
      await hp.getByTestId("wizard-create").click();
      await hp.waitForURL(/\/host\/[A-Z0-9]{4,6}$/);
      party.code = new URL(hp.url()).pathname.split("/").pop()!;
      await expect(hp.getByTestId("host-room-code")).toHaveText(party.code);
      await snap("host-lobby-empty", "host", hp, ["phone", "desktop"]);

      await party.openTv();
      const tp = party.tv.page;
      await tp.goto(`/screen/${party.code}`);
      await expect(tp.getByTestId("tv-lobby")).toBeVisible({ timeout: 60_000 });
      await snap("tv-lobby-empty", "screen", tp, ["tv"]);

      // join page states with a first player
      const jp = await party.joinPlayerPartial("Alice");
      await snap("join-default", "player", jp, ["phone"]);
      await jp.getByTestId("join-mode-own").locator("xpath=ancestor::label").click();
      await jp.getByTestId("join-text").fill("I am a retired lighthouse keeper who bakes terrible scones.");
      await snap("join-own-backstory", "player", jp, ["phone"]);
      await party.finishJoin(jp, "Alice");
      for (const [i, pr] of [{ name: "Bob", age: "adult" }, { name: "Cleo", age: "kid", wantsVictim: true }, { name: "Dan", age: "adult" }].entries()) {
        await party.joinPlayer(pr as never, i + 1);
      }
      await expect(hp.getByTestId("host-guest")).toHaveCount(4, { timeout: 30_000 });
      await snap("host-lobby", "host", hp, ["phone", "desktop"]);
      await snap("player-lobby", "player", party.players[0].page, ["phone"]);
      await expect(tp.getByTestId("tv-guests")).toContainText("Dan", { timeout: 30_000 });
      await snap("tv-lobby", "screen", tp, ["tv", "desktop"]);

      // ---- cards
      await party.hostStart();
      const pa = party.players[0].page;
      await expect(pa.getByTestId("envelope")).toBeVisible({ timeout: 30_000 });
      await snap("player-envelope", "player", pa, ["phone"]);
      await openAndReady(pa);
      await snap("player-card-open", "player", pa, ["phone"]);
      for (const p of party.players.slice(1)) await openAndReady(p.page);
      await snap("host-cards", "host", hp, ["phone", "desktop"]);
      await snap("tv-cards", "screen", tp, ["tv"]);

      // ---- acts
      await party.hostAdvance("Act I: The Party");
      await snap("host-act1", "host", hp, ["desktop"]);
      await snap("tv-act1", "screen", tp, ["tv"]);
      await party.hostAdvance("The Death");
      await party.hostAdvance("Act II");
      await expect(pa.getByTestId("clue").first()).toBeVisible({ timeout: 20_000 });
      await expect(tp.getByTestId("tv-clues")).toBeVisible();
      await snap("player-clues", "player", pa, ["phone"]);
      await snap("tv-clues", "screen", tp, ["tv"]);
      await party.hostAdvance("Intermission");
      await party.hostAdvance("Act III");
      await expect(pa.getByTestId("clue")).toHaveCount(13, { timeout: 20_000 });
      await snap("player-clues-all", "player", pa, ["phone"]);
      await snap("tv-act3", "screen", tp, ["tv"]);
      await hp.getByTestId("host-override").locator("summary").click();
      await snap("host-override-open", "host", hp, ["phone"]);
      await hp.getByTestId("host-override").locator("summary").click();
      await hp.getByTestId("host-pause").click();
      await expect(pa.getByTestId("player-paused")).toBeVisible({ timeout: 20_000 });
      await snap("player-paused", "player", pa, ["phone"]);
      await snap("tv-paused", "screen", tp, ["tv"]);
      await hp.getByTestId("host-pause").click();

      // ---- voting
      await party.hostAdvance("Act IV");
      await expect(pa.getByTestId("ballot")).toBeVisible({ timeout: 20_000 });
      await snap("player-ballot-empty", "player", pa, ["phone"]);
      await pa.locator('[data-testid^="suspect-"]').first().locator("xpath=ancestor::label").click();
      await snap("player-ballot-partial", "player", pa, ["phone"]);
      await castBallot(pa, { suspect: "carol", method: "m-tonic", motive: "v-pumpkin" });
      await snap("player-ballot-done", "player", pa, ["phone"]);
      for (const p of party.players.slice(1)) await castBallot(p.page);
      await expect(hp.getByTestId("host-ballots")).toContainText("4 of 4", { timeout: 20_000 });
      await snap("host-ballots", "host", hp, ["phone", "desktop"]);
      await snap("tv-ballots", "screen", tp, ["tv"]);

      // ---- reveal
      await party.hostAdvance("Act V");
      await expect(pa.getByTestId("reveal")).toBeVisible({ timeout: 20_000 });
      await expect(tp.getByTestId("tv-reveal")).toBeVisible({ timeout: 20_000 });
      await snap("player-reveal", "player", pa, ["phone"]);
      await snap("tv-reveal", "screen", tp, ["tv"]);
      await snap("host-reveal", "host", hp, ["phone", "desktop"]);
      walked = true;
    } finally {
      consoleErrors = party.errors.slice();
      writeJson(`audit-${info.project.name}.json`, { snaps, consoleErrors });
      await party.closeAll();
    }
  });

  test("axe: zero serious or critical violations on every screen and state", async ({}, info) => {
    const data = readJson<{ snaps: Snap[] }>(`audit-${info.project.name}.json`, { snaps: [] });
    expect(data.snaps.length, "walk must have produced data").toBeGreaterThan(10);
    const minor: string[] = [];
    for (const s of data.snaps) {
      for (const v of s.axe?.violations ?? []) {
        const line = `${s.role}/${s.state}@${s.width}: ${v.id} (${v.impact}) ${v.help} -> ${v.nodes[0]?.target}`;
        if (v.impact === "serious" || v.impact === "critical") expect.soft(false, line).toBe(true);
        else minor.push(line);
      }
    }
    console.log(`[axe minor/moderate: ${minor.length}]\n` + [...new Set(minor)].join("\n"));
  });

  test("layout: no horizontal scroll on any screen", async ({}, info) => {
    const data = readJson<{ snaps: Snap[] }>(`audit-${info.project.name}.json`, { snaps: [] });
    for (const s of data.snaps) expect.soft(s.m.hScroll, `${s.role}/${s.state}@${s.width} overflows by ${s.m.hScroll}px`).toBeLessThanOrEqual(0);
  });

  test("touch targets: interactive controls on phone-width screens are at least 44px", async ({}, info) => {
    const data = readJson<{ snaps: Snap[] }>(`audit-${info.project.name}.json`, { snaps: [] });
    const lines = new Set<string>();
    for (const s of data.snaps.filter((x) => x.width <= 430 && x.role !== "screen")) {
      for (const t of s.m.small.filter((x) => x.kind !== "inline-link")) lines.add(`${s.role}/${s.state}: <${t.tag}> "${t.text}" is ${t.w}x${t.h}`);
    }
    if (lines.size) console.log("[small targets]\n" + [...lines].join("\n"));
    expect.soft([...lines], "controls smaller than 44px").toEqual([]);
  });

  test("headings: one h1 per screen and no skipped levels", async ({}, info) => {
    const data = readJson<{ snaps: Snap[] }>(`audit-${info.project.name}.json`, { snaps: [] });
    for (const s of data.snaps.filter((x) => x.width === data.snaps[0].width || true)) {
      const hs = s.m.headings;
      expect.soft(hs.filter((h) => h.level === 1).length, `${s.role}/${s.state}: needs exactly one h1, has ${JSON.stringify(hs)}`).toBe(1);
      for (let i = 1; i < hs.length; i++) expect.soft(hs[i].level - hs[i - 1].level, `${s.role}/${s.state}: heading jumps ${hs[i - 1].level} to ${hs[i].level} ("${hs[i].text}")`).toBeLessThanOrEqual(1);
    }
  });

  test("document: title, lang and image alt on every screen", async ({}, info) => {
    const data = readJson<{ snaps: Snap[] }>(`audit-${info.project.name}.json`, { snaps: [] });
    for (const s of data.snaps) {
      expect.soft(s.m.title.length, `${s.role}/${s.state}: title`).toBeGreaterThan(3);
      expect.soft(s.m.lang, `${s.role}/${s.state}: html lang`).toMatch(/^en/);
      for (const i of s.m.images) expect.soft(i.alt, `${s.role}/${s.state}: image ${i.src} needs alt`).not.toBeNull();
    }
    const titles = new Set(data.snaps.map((s) => s.m.title));
    expect.soft(titles.size, `distinct titles: ${[...titles].join(" | ")}`).toBeGreaterThan(4);
  });

  test("thumb reach: the primary action on phone screens sits in the lower 60 percent or is sticky", async ({}, info) => {
    const data = readJson<{ snaps: Snap[] }>(`audit-${info.project.name}.json`, { snaps: [] });
    const rows: string[] = [];
    for (const s of data.snaps.filter((x) => x.width <= 430 && x.role !== "screen" && x.m.primary)) {
      const p = s.m.primary!;
      const reach = p.sticky || p.centerY >= p.vh * 0.4;
      rows.push(`${s.role}/${s.state}: "${p.text}" centerY ${p.centerY}/${p.vh} sticky=${p.sticky} h=${p.h}`);
      expect.soft(reach, `${s.role}/${s.state}: primary action "${p.text}" at ${p.centerY}/${p.vh} is in the top 40 percent and not sticky`).toBe(true);
      expect.soft(p.h, `${s.role}/${s.state}: primary action height`).toBeGreaterThanOrEqual(44);
    }
    console.log("[primary actions]\n" + rows.join("\n"));
  });

  test("big screen: type is readable at 3 metres", async ({}, info) => {
    const data = readJson<{ snaps: Snap[] }>(`audit-${info.project.name}.json`, { snaps: [] });
    const tv = data.snaps.filter((s) => s.role === "screen" && s.width >= 1900);
    if (tv.length === 0) test.skip(true, "TV size only recorded in the mobile-small, desktop? run; see audit data");
    const rows: string[] = [];
    for (const s of tv) {
      rows.push(`${s.state}: min ${s.m.minFont}px; under 32px: ${s.m.smallFonts.slice(0, 6).map((f) => `${f.px}px "${f.text}"`).join("; ")}`);
      expect.soft(s.m.minFont, `${s.state}: smallest text ${s.m.minFont}px, ${JSON.stringify(s.m.smallFonts.slice(0, 5))}`).toBeGreaterThanOrEqual(24);
    }
    console.log("[tv fonts]\n" + rows.join("\n"));
  });

  test("big screen: text contrast (computed and sampled from pixels) meets WCAG AA", async ({}, info) => {
    const data = readJson<{ snaps: Snap[] }>(`audit-${info.project.name}.json`, { snaps: [] });
    const tv = data.snaps.filter((s) => s.role === "screen" && s.contrast);
    if (tv.length === 0) test.skip(true, "no 1920 wide big screen data in this project");
    const rows: string[] = [];
    for (const s of tv) {
      const worst = s.contrast!.worst;
      rows.push(`${s.state}: ${s.contrast!.rows.length} text runs, ${worst.length} below AA` + worst.map((w) => `\n    ${w.ratio}:1 ${w.px}px "${w.text}" fg ${w.fg} bg ${w.bg} (${w.source})`).join(""));
      expect.soft(worst.map((w) => `${w.ratio}:1 "${w.text}"`), `${s.state}: low contrast text on the big screen`).toEqual([]);
    }
    console.log("[tv contrast]\n" + rows.join("\n"));
  });

  test("console: no page errors or error logs during the whole game", async ({}, info) => {
    const data = readJson<{ consoleErrors: string[] }>(`audit-${info.project.name}.json`, { consoleErrors: [] });
    expect(data.consoleErrors).toEqual([]);
    void consoleErrors; void walked;
  });
});

export { ratio, parseRgb };
