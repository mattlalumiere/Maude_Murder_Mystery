import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_CASE } from "../src/lib/sample-case";
import { castBallot, OVERRIDE_CODE, openAndReady, Party, type Player, type Rec } from "./helpers";

/**
 * SECRECY IN THE BROWSER. Every response each role receives, plus everything the page keeps
 * (storage, cookies, DOM, window globals), is scanned before the Reveal for:
 *  - forbidden JSON keys (truth, nudges, advanced, override hash, photo keys, ...)
 *  - the text of other players' cards, the truth story, nudges and advanced hints
 *  - other players' tokens and the override code
 * After the Reveal the truth story must be present (positive control proving the scanner works).
 */

const FORBIDDEN_KEYS = new Set(["truth", "nudges", "advanced", "overrideHash", "overrideSalt", "failedOverrides", "photoKey", "victimId", "result", "case", "passwordHash", "authSecret"]);

const MIN = 18;
const cardTexts = (c: { card: { story: string; secret: string; alibi: string; knows: string[]; goal: string; special: string } }) =>
  [c.card.story, c.card.secret, c.card.alibi, ...c.card.knows, c.card.goal, c.card.special];

const publicTexts = new Set<string>([
  ...SAMPLE_CASE.clues.map((c) => c.text), SAMPLE_CASE.twist, SAMPLE_CASE.setting,
  ...Object.values(SAMPLE_CASE.narration), ...SAMPLE_CASE.characters.map((c) => c.tease),
]);

function secretStrings(ownCharId: string | null): { text: string; why: string }[] {
  const out: { text: string; why: string }[] = [];
  for (const c of SAMPLE_CASE.characters) {
    if (c.id === ownCharId) continue;
    for (const t of cardTexts(c)) if (t.length >= MIN && !publicTexts.has(t)) out.push({ text: t, why: `card of ${c.id}` });
  }
  out.push({ text: SAMPLE_CASE.truth.story, why: "truth.story" });
  for (const [k, v] of Object.entries(SAMPLE_CASE.nudges)) out.push({ text: v, why: `nudge ${k}` });
  for (const [k, v] of Object.entries(SAMPLE_CASE.advanced)) out.push({ text: v, why: `advanced ${k}` });
  return out;
}

const unescapeHtml = (s: string) => s.replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function containsText(haystack: string, needle: string): boolean {
  const h = unescapeHtml(haystack);
  const jsonEsc = JSON.stringify(needle).slice(1, -1);
  // RSC payloads and JS strings escape quotes with a backslash
  return h.includes(needle) || h.includes(jsonEsc) || h.includes(needle.replace(/'/g, "\\'")) || h.includes(needle.replace(/"/g, '\\"'));
}

type Finding = { where: string; what: string };

function walk(v: unknown, path: string, visit: (key: string | null, val: unknown, path: string) => void) {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, visit));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) { visit(k, x, `${path}.${k}`); walk(x, `${path}.${k}`, visit); }
  } else visit(null, v, path);
}

function scanResponse(r: Rec, who: { ownChar: string | null; ownToken?: string; otherTokens: string[]; override: string }): Finding[] {
  const f: Finding[] = [];
  const where = `${r.role} ${r.method} ${new URL(r.url).pathname}${new URL(r.url).search.slice(0, 40)}`;
  if (/\/api\//.test(r.url) && /json/.test(r.type)) {
    let j: unknown;
    try { j = JSON.parse(r.body); } catch { j = undefined; }
    if (j !== undefined) {
      const isAction = /\/action$/.test(r.url);
      walk(j, "$", (k, _val, path) => {
        if (!k) return;
        if (FORBIDDEN_KEYS.has(k)) f.push({ where, what: `forbidden key ${path}` });
        if (k === "killerId" && !/\.me\.ballot\.killerId$/.test(path)) f.push({ where, what: `killerId at ${path}` });
        if (/photo/i.test(k) && !/^(hasPhoto|photo)$/.test(k) && /key/i.test(k)) f.push({ where, what: `photo key field ${path}` });
        if (k === "token" && !isAction && !/\/join$/.test(r.url)) f.push({ where, what: `token field ${path}` });
      });
    }
  }
  for (const s of secretStrings(who.ownChar)) if (containsText(r.body, s.text)) f.push({ where, what: `contains ${s.why}` });
  for (const t of who.otherTokens) if (t && r.body.includes(t)) f.push({ where, what: "contains another player's token" });
  if (r.role !== "host" && r.body.includes(who.override)) f.push({ where, what: "contains override code" });
  if (/photos\/[A-Za-z0-9_-]+\.jpg/.test(r.body) && r.role !== "host") f.push({ where, what: "photo storage key in body" });
  if (/test-secret/.test(r.body)) f.push({ where, what: "auth secret in body" });
  return f;
}

async function clientSnapshot(page: Page) {
  return page.evaluate(() => {
    const dump = (s: Storage) => { const o: Record<string, string> = {}; for (let i = 0; i < s.length; i++) { const k = s.key(i)!; o[k] = s.getItem(k) ?? ""; } return o; };
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const std = new Set(Object.getOwnPropertyNames(iframe.contentWindow!));
    iframe.remove();
    const globals: Record<string, string> = {};
    for (const k of Object.getOwnPropertyNames(window)) {
      if (std.has(k) || /^(webkit|on[a-z]+)/.test(k) || k === "__next_f") continue;
      try {
        const seen = new WeakSet();
        globals[k] = JSON.stringify((window as unknown as Record<string, unknown>)[k], (_kk, v) => {
          if (typeof v === "function") return "[fn]";
          if (v && typeof v === "object") { if (seen.has(v)) return "[circ]"; seen.add(v); }
          return v;
        })?.slice(0, 2_000_000) ?? "";
      } catch { globals[k] = "[unserialisable]"; }
    }
    const rsc = JSON.stringify((self as unknown as { __next_f?: unknown }).__next_f ?? null);
    return { local: dump(localStorage), session: dump(sessionStorage), cookie: document.cookie, dom: document.documentElement.outerHTML, globals, globalKeys: Object.keys(globals), rsc };
  });
}

async function scanClient(p: { page: Page; label: string }, who: { ownChar: string | null; otherTokens: string[]; override: string; ownTokenKey?: string }, ctxCookies: string): Promise<Finding[]> {
  const snap = await clientSnapshot(p.page);
  const f: Finding[] = [];
  const blobs: [string, string][] = [
    ["localStorage", JSON.stringify(snap.local)], ["sessionStorage", JSON.stringify(snap.session)], ["document.cookie", snap.cookie],
    ["context cookies", ctxCookies], ["DOM", snap.dom], ["__next_f", snap.rsc], ...Object.entries(snap.globals).map(([k, v]) => [`window.${k}`, v] as [string, string]),
  ];
  for (const [name, body] of blobs) {
    for (const s of secretStrings(who.ownChar)) if (containsText(body, s.text)) f.push({ where: `${p.label} ${name}`, what: `contains ${s.why}` });
    for (const t of who.otherTokens) if (t && body.includes(t)) f.push({ where: `${p.label} ${name}`, what: "contains another player's token" });
    if (p.label !== "host" && body.includes(who.override)) f.push({ where: `${p.label} ${name}`, what: "contains override code" });
    if (/overrideHash|overrideSalt|killerId"?\s*:\s*"carol/.test(body)) f.push({ where: `${p.label} ${name}`, what: "override hash/salt or killer id literal" });
  }
  return f;
}

function ownCharId(pl: Player): string | null {
  for (const r of [...pl.rec.all].reverse()) {
    if (!/state\?role=player/.test(r.url) || !/json/.test(r.type)) continue;
    try { const j = JSON.parse(r.body); const id = j?.me?.character?.id; if (id) return id as string; } catch { /* ignore */ }
  }
  return null;
}

async function fullScan(party: Party, stage: string, before = Infinity): Promise<Finding[]> {
  const findings: Finding[] = [];
  await Promise.all(party.allRecorders().map((r) => r.settle()));
  const tokens = party.players.map((p) => p.creds?.tok ?? "");
  const roles: { page: Page; label: string; rec: Rec[]; ownChar: string | null; others: string[]; ctx: Player["ctx"] }[] = [
    { page: party.host.page, label: "host", rec: party.host.rec.all, ownChar: null, others: [], ctx: party.host.ctx },
    { page: party.tv.page, label: "screen", rec: party.tv.rec.all, ownChar: null, others: tokens, ctx: party.tv.ctx },
    ...party.players.map((p, i) => ({ page: p.page, label: `player:${p.persona.name}`, rec: p.rec.all, ownChar: ownCharId(p), others: tokens.filter((_, j) => j !== i), ctx: p.ctx })),
  ];
  for (const r of roles) {
    // Everyone gets every JS chunk, so a bundle leak shows up for every role. The host legitimately holds no cards either.
    for (const rec of r.rec.filter((x) => x.at < before)) {
      findings.push(...scanResponse(rec, { ownChar: r.ownChar, otherTokens: r.others, override: OVERRIDE_CODE }));
    }
    const ck = JSON.stringify(await r.ctx.cookies());
    findings.push(...(await scanClient(r, { ownChar: r.ownChar, otherTokens: r.others, override: OVERRIDE_CODE }, ck)));
  }
  // De-duplicate
  const seen = new Set<string>();
  const out = findings.filter((x) => { const k = `${x.where}|${x.what}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (out.length) console.log(`[secrecy ${stage}] FINDINGS\n` + out.map((x) => `  ${x.where}: ${x.what}`).join("\n"));
  return out;
}

async function tinyJpeg(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 200; c.height = 200;
    const g = c.getContext("2d")!; const img = g.createImageData(200, 200);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255; img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

test("secrecy: no truth, other cards, tokens or keys reach any browser before the reveal", async ({ browser }, info) => {
  const party = new Party(browser, info);
  try {
    await party.bootstrap();

    // Dan uploads a photo with consent (photo keys must never leave the server except to nobody).
    const dan = party.players[3];
    await dan.page.getByTestId("photo-panel").locator("summary").click();
    await dan.page.getByTestId("photo-input").setInputFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: await tinyJpeg(dan.page) });
    await dan.page.getByTestId("photo-consent").locator("xpath=ancestor::label").click();
    await dan.page.getByTestId("photo-save").click();
    await expect(dan.page.getByTestId("photo-message")).toContainText(/saved/i, { timeout: 20_000 });

    const findings: Finding[] = [];
    findings.push(...(await fullScan(party, "lobby")));

    await party.hostStart();
    for (const p of party.players) await openAndReady(p.page); // cards are OPEN on screen while we scan
    findings.push(...(await fullScan(party, "cards-open")));

    await party.hostAdvance("Act I: The Party");
    await party.hostAdvance("The Death");
    await party.hostAdvance("Act II");
    await party.hostAdvance("Intermission");
    await party.hostAdvance("Act III");
    findings.push(...(await fullScan(party, "act3")));

    await party.hostAdvance("Act IV");
    for (const p of party.players) await castBallot(p.page, { suspect: "carol", method: "m-tonic", motive: "v-pumpkin" });
    await expect(party.host.page.getByTestId("host-ballots")).toContainText("4 of 4", { timeout: 20_000 });
    findings.push(...(await fullScan(party, "ballots")));

    // Other players must not be able to read my state or photo with the wrong token (API probes from inside the browser).
    const a = party.players[0], b = party.players[1];
    const probe = await a.page.evaluate(async ({ code, bid, btok, aid, atok }) => {
      const get = async (path: string, h: Record<string, string>) => { const r = await fetch(path, { headers: h }); return { s: r.status, t: (await r.text()).slice(0, 300) }; };
      return {
        wrongToken: await get(`/api/rooms/${code}/state?role=player&v=-1`, { "x-player-id": bid, "x-player-token": atok }),
        noCreds: await get(`/api/rooms/${code}/state?role=player&v=-1`, {}),
        asHost: await get(`/api/rooms/${code}/state?role=host&v=-1`, {}),
        otherPhoto: await get(`/api/rooms/${code}/photo`, { "x-player-id": aid, "x-player-token": atok }),
        hostActionAsPlayer: await (async () => { const r = await fetch(`/api/rooms/${code}/action`, { method: "POST", headers: { "content-type": "application/json", "x-player-id": aid, "x-player-token": atok }, body: JSON.stringify({ type: "advance" }) }); return { s: r.status, t: (await r.text()).slice(0, 200) }; })(),
        spoofedBtok: btok.length,
      };
    }, { code: party.code, bid: b.creds!.pid, btok: b.creds!.tok, aid: a.creds!.pid, atok: a.creds!.tok });
    expect([401, 403]).toContain(probe.wrongToken.s);
    expect([401, 403]).toContain(probe.noCreds.s);
    expect(probe.asHost.s).toBe(403);
    expect(probe.otherPhoto.s).toBe(404); // a has no photo; never anybody else's
    expect([401, 403]).toContain(probe.hostActionAsPlayer.s);

    // Positive control: everything is revealed afterwards and the scanner sees it.
    party.sealedAt = Date.now();
    const sealed = party.sealedAt;
    await party.hostAdvance("Act V");
    for (const p of party.players) await expect(p.page.getByTestId("reveal")).toBeVisible({ timeout: 20_000 });
    await Promise.all(party.allRecorders().map((r) => r.settle()));
    const afterReveal = party.players[0].rec.api().filter((r) => r.at >= sealed && /state\?role=player/.test(r.url) && containsText(r.body, SAMPLE_CASE.truth.story));
    expect(afterReveal.length, "scanner positive control: truth story must appear after the reveal").toBeGreaterThan(0);

    expect(findings, "secrets leaked before the reveal:\n" + findings.map((x) => `${x.where}: ${x.what}`).join("\n")).toEqual([]);
  } finally {
    await party.closeAll();
  }
});

test("secrecy: own card is visible only to its owner and only when opened", async ({ browser }, info) => {
  const party = new Party(browser, info);
  try {
    await party.bootstrap();
    await party.hostStart();
    const [a, b] = party.players;
    await expect(a.page.getByTestId("envelope")).toBeVisible({ timeout: 30_000 });
    // sealed: the secret text is not in the DOM at all
    await expect(a.page.getByTestId("card-secret")).toHaveCount(0);
    await a.page.getByRole("button", { name: /break the seal/i }).click();
    const secretA = await a.page.getByTestId("card-secret").textContent();
    expect(secretA).toBeTruthy();
    await expect(b.page.locator("body")).not.toContainText(secretA!.slice(0, 30));
    await expect(party.tv.page.locator("body")).not.toContainText(secretA!.slice(0, 30));
    await expect(party.host.page.locator("body")).not.toContainText(secretA!.slice(0, 30));
    // sealing again removes it from the DOM
    await a.page.getByTestId("card-hide").click();
    await expect(a.page.getByTestId("card-secret")).toHaveCount(0);
  } finally {
    await party.closeAll();
  }
});
