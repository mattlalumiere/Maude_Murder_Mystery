import { mintHostSession, IS_PROD } from "./prod";
import { devices, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

/* ------------------------------------------------------------------ */
/* Shared helpers for the T5 end to end suite.                         */
/* Everything talks to the real UI through data-testid hooks listed in */
/* docs/platform/design/testids.md.                                    */
/* ------------------------------------------------------------------ */

export const OVERRIDE_CODE = "t5-secret-code";

type CtxOpts = Parameters<Browser["newContext"]>[0];

function strip(d: (typeof devices)[string]): CtxOpts {
  const { defaultBrowserType: _d, ...rest } = d as Record<string, unknown>;
  void _d;
  return rest as CtxOpts;
}

export const PHONE_360: CtxOpts = strip({ ...devices["Pixel 5"], viewport: { width: 360, height: 640 } } as (typeof devices)[string]);
export const PHONE_IPHONE13: CtxOpts = strip(devices["iPhone 13"]);
export const TV_1080: CtxOpts = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 };
export const DESKTOP: CtxOpts = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

let ipCounter = Math.floor(Math.random() * 200) + 10;
/** A unique client IP per party (sent as X-Forwarded-For) so per-IP rate limits stay on but do not trip between tests. */
export function nextIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.${Math.floor(Math.random() * 200) + 1}`;
}

/* ------------------------------------------------------------------ */
/* Network recorder                                                    */
/* ------------------------------------------------------------------ */

export type Rec = {
  role: string;
  at: number;
  url: string;
  method: string;
  status: number;
  type: string;
  body: string;
  reqBody?: string;
};

export class Recorder {
  all: Rec[] = [];
  private pending: Promise<void>[] = [];
  constructor(public role: string) {}

  attach(ctx: BrowserContext) {
    ctx.on("response", (res) => {
      const p = (async () => {
        try {
          const ct = res.headers()["content-type"] ?? "";
          const textual = /json|text|javascript|html|xml|svg/.test(ct);
          let body = "";
          if (textual) {
            const buf = await res.body().catch(() => Buffer.alloc(0));
            if (buf.length < 4_000_000) body = buf.toString("utf8");
          }
          let reqBody: string | undefined;
          try { reqBody = res.request().postData() ?? undefined; } catch { /* binary */ }
          this.all.push({ role: this.role, at: Date.now(), url: res.url(), method: res.request().method(), status: res.status(), type: ct, body, reqBody });
        } catch { /* page closed */ }
      })();
      this.pending.push(p);
    });
  }
  async settle() { await Promise.allSettled(this.pending); this.pending = []; }
  api() { return this.all.filter((r) => /\/api\//.test(r.url)); }
}

/* ------------------------------------------------------------------ */
/* Party world                                                         */
/* ------------------------------------------------------------------ */

export type AgeKey = "adult" | "teen" | "kid" | "little";
export type Persona = { name: string; age: AgeKey; wantsVictim?: boolean; mode?: "gm" | "hint" | "own"; text?: string };

export const DEFAULT_CAST: Persona[] = [
  { name: "Alice", age: "adult" },
  { name: "Bob", age: "adult" },
  { name: "Cleo", age: "kid", wantsVictim: true },
  { name: "Dan", age: "adult" },
];

export type Player = { persona: Persona; ctx: BrowserContext; page: Page; rec: Recorder; creds?: { pid: string; tok: string } };

export class Party {
  code = "";
  ip = nextIp();
  hostName = `T5 Host ${Math.random().toString(36).slice(2, 7)}`;
  host!: { ctx: BrowserContext; page: Page; rec: Recorder };
  tv!: { ctx: BrowserContext; page: Page; rec: Recorder };
  players: Player[] = [];
  sealedAt = Infinity;
  /** Page errors and console errors from every page of the party. */
  errors: string[] = [];
  constructor(public browser: Browser, public info: TestInfo) {}

  projectCtx(): NonNullable<CtxOpts> {
    const u = this.info.project.use as Record<string, unknown>;
    const o: Record<string, unknown> = {};
    for (const k of ["viewport", "userAgent", "deviceScaleFactor", "isMobile", "hasTouch", "baseURL"]) if (u[k] !== undefined) o[k] = u[k];
    return o as NonNullable<CtxOpts>;
  }

  private async newCtx(opts: CtxOpts, role: string) {
    const ctx = await this.browser.newContext({ ...opts, baseURL: (this.info.project.use as { baseURL?: string }).baseURL, extraHTTPHeaders: { "x-forwarded-for": this.ip } });
    const rec = new Recorder(role);
    rec.attach(ctx);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => this.errors.push(`${role} pageerror: ${e.message.slice(0, 200)}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const t = m.text();
      if (/Failed to load resource.*(401|403|409|429)/.test(t)) return; // expected API refusals are visible as errors in the console
      this.errors.push(`${role} console.error: ${t.slice(0, 200)}`);
    });
    return { ctx, page, rec };
  }

  async openHost(opts: CtxOpts = this.projectCtx()) {
    this.host = await this.newCtx(opts, "host");
  }
  async openTv(opts?: CtxOpts) {
    const vw = (this.projectCtx().viewport?.width ?? 0);
    this.tv = await this.newCtx(opts ?? (vw >= 1280 ? TV_1080 : this.projectCtx()), "screen");
  }

  async hostSignIn() {
    const { page } = this.host;
    if (IS_PROD) {
      // dev login does not exist in production builds: use a minted Auth.js session
      await mintHostSession(this.host.ctx, (this.info.project.use as { baseURL: string }).baseURL, this.hostName);
      await page.goto("/host/new");
      await expect(page.getByTestId("wizard")).toBeVisible({ timeout: 60_000 });
      return;
    }
    await page.goto("/login");
    await page.getByTestId("login-dev-name").fill(this.hostName);
    await page.getByTestId("login-dev-submit").click();
    await page.waitForURL(/\/host\/new/, { timeout: 60_000 });
  }

  /** Runs the 4 step wizard with the keyboard-free happy path. */
  async runWizard(override = OVERRIDE_CODE, tweak?: (page: Page) => Promise<void>) {
    const { page } = this.host;
    await expect(page.getByTestId("wizard-step-1")).toBeVisible();
    if (tweak) await tweak(page);
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-step-2")).toBeVisible();
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-step-3")).toBeVisible();
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-step-4")).toBeVisible();
    await page.getByTestId("field-override").fill(override);
    await page.getByTestId("wizard-create").click();
    await page.waitForURL(/\/host\/[A-Z0-9]{4,6}$/, { timeout: 60_000 });
    this.code = new URL(page.url()).pathname.split("/").pop()!;
    await expect(page.getByTestId("host-room-code")).toHaveText(this.code);
  }

  phoneFor(i: number, mode: "small" | "iphone" | "mixed"): CtxOpts {
    if (mode === "small") return PHONE_360;
    if (mode === "iphone") return PHONE_IPHONE13;
    return i % 2 === 0 ? PHONE_360 : PHONE_IPHONE13;
  }

  phoneMode(): "small" | "iphone" | "mixed" {
    const n = this.info.project.name;
    return n === "mobile-small" ? "small" : n === "mobile" ? "iphone" : "mixed";
  }

  async joinPlayer(persona: Persona, index: number) {
    const w = await this.newCtx(this.phoneFor(index, this.phoneMode()), `player:${persona.name}`);
    const { page } = w;
    await page.goto(`/join/${this.code}`);
    await expect(page.getByTestId("join-builder")).toBeVisible();
    await page.getByTestId("join-name").fill(persona.name);
    await page.getByTestId("join-age").selectOption(persona.age);
    if (persona.wantsVictim) await page.getByTestId("join-victim").check();
    if (persona.mode && persona.mode !== "gm") {
      await page.getByTestId(`join-mode-${persona.mode}`).locator("xpath=ancestor::label").click();
      await page.getByTestId("join-text").fill(persona.text ?? "I collect antique teaspoons.");
    }
    await page.getByTestId("join-submit").click();
    await page.waitForURL(new RegExp(`/play/${this.code}`), { timeout: 60_000 });
    const creds = await page.evaluate((c) => JSON.parse(localStorage.getItem(`mm:${c}`) ?? "null"), this.code);
    const pl: Player = { persona, ...w, creds };
    this.players.push(pl);
    return pl;
  }

  /** Opens the join page for a new phone and fills the name, but does not submit. */
  async joinPlayerPartial(name: string, age: AgeKey = "adult") {
    const w = await this.newCtx(this.phoneFor(this.players.length, this.phoneMode()), `player:${name}`);
    await w.page.goto(`/join/${this.code}`);
    await expect(w.page.getByTestId("join-builder")).toBeVisible();
    await w.page.getByTestId("join-name").fill(name);
    await w.page.getByTestId("join-age").selectOption(age);
    this.pendingJoin = w;
    return w.page;
  }
  pendingJoin?: { ctx: BrowserContext; page: Page; rec: Recorder };
  async finishJoin(page: Page, name: string, age: AgeKey = "adult") {
    await page.getByTestId("join-submit").click();
    await page.waitForURL(new RegExp(`/play/${this.code}`), { timeout: 60_000 });
    const creds = await page.evaluate((c) => JSON.parse(localStorage.getItem(`mm:${c}`) ?? "null"), this.code);
    const w = this.pendingJoin!;
    this.players.push({ persona: { name, age }, ...w, creds });
    this.pendingJoin = undefined;
  }

  async joinAll(cast: Persona[] = DEFAULT_CAST) {
    for (let i = 0; i < cast.length; i++) await this.joinPlayer(cast[i], i);
  }

  /** Starts the party fully: host signs in, wizard, big screen, players join. */
  async bootstrap(cast: Persona[] = DEFAULT_CAST) {
    await this.openHost();
    await this.hostSignIn();
    await this.runWizard();
    await this.openTv();
    await this.tv.page.goto(`/screen/${this.code}`);
    await expect(this.tv.page.getByTestId("tv-lobby")).toBeVisible({ timeout: 60_000 });
    await this.joinAll(cast);
  }

  async hostStart() {
    const { page } = this.host;
    await expect(page.getByTestId("host-start")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("host-start").click();
    await expect(page.getByTestId("host-phase")).toContainText("Pre-game", { timeout: 30_000 });
  }

  async hostAdvance(expectTitle: string | RegExp) {
    const { page } = this.host;
    await expect(page.getByTestId("host-advance")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("host-advance").click();
    await expect(page.getByTestId("host-phase")).toContainText(expectTitle as string, { timeout: 30_000 });
  }

  async everyone(fn: (p: Player) => Promise<void>) {
    for (const p of this.players) await fn(p);
  }

  async closeAll() {
    for (const p of this.players) await p.ctx.close().catch(() => {});
    await this.tv?.ctx.close().catch(() => {});
    await this.host?.ctx.close().catch(() => {});
  }
  allRecorders(): Recorder[] { return [this.host?.rec, this.tv?.rec, ...this.players.map((p) => p.rec)].filter(Boolean) as Recorder[]; }
}

/** Opens the secret card and confirms it (the player side of the cards phase). */
export async function openAndReady(page: Page) {
  await expect(page.getByTestId("player-screen")).toHaveAttribute("data-phase", "cards", { timeout: 30_000 });
  await expect(page.getByTestId("envelope")).toBeVisible();
  await page.getByRole("button", { name: /break the seal/i }).click();
  await expect(page.getByTestId("card-open")).toBeVisible();
  await expect(page.getByTestId("card-secret")).not.toBeEmpty();
  await page.getByTestId("card-ready").click();
  await expect(page.getByTestId("card-ready-done").first()).toBeVisible();
}

/** Casts a ballot: first suspect, first method, first motive (or the given ids). */
export async function castBallot(page: Page, pick?: { suspect?: string; method?: string; motive?: string }) {
  await expect(page.getByTestId("ballot")).toBeVisible({ timeout: 30_000 });
  const radios = async (prefix: string, id?: string) => {
    const loc = id ? page.getByTestId(`${prefix}-${id}`) : page.locator(`[data-testid^="${prefix}-"]`).first();
    // Tap the visible label like a thumb would; the native radio is visually hidden.
    await loc.locator("xpath=ancestor::label").click();
    await expect(loc).toBeChecked();
  };
  await radios("suspect", pick?.suspect);
  await radios("method", pick?.method);
  await radios("motive", pick?.motive);
  await expect(page.getByTestId("ballot-progress-text")).toContainText("3 of 3");
  await page.getByTestId("ballot-submit").click();
  await expect(page.getByTestId("ballot-done")).toBeVisible();
}

/** Takes the text of a locator, or empty. */
export const textOf = async (page: Page, id: string) => (await page.getByTestId(id).first().textContent().catch(() => "")) ?? "";
