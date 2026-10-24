import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/** Measurement and axe helpers shared by the audit specs. Everything runs against the real rendered page. */

export const SHOT_DIR = path.resolve(__dirname, "../../docs/platform/testing/screenshots");
export const RESULT_DIR = process.env.T5_RESULTS ?? "/tmp/mm-t5-results";

export type AxeNode = { target: string; html: string };
export type AxeFinding = { id: string; impact: string; help: string; nodes: AxeNode[] };
export type Measure = {
  hScroll: number;
  innerWidth: number;
  small: { tag: string; text: string; w: number; h: number; kind: string }[];
  headings: { level: number; text: string }[];
  minFont: number;
  smallFonts: { text: string; px: number }[];
  primary: { text: string; top: number; bottom: number; centerY: number; vh: number; sticky: boolean; h: number } | null;
  title: string;
  lang: string;
  images: { src: string; alt: string | null }[];
};

export async function axeScan(page: Page): Promise<{ violations: AxeFinding[]; incomplete: AxeFinding[] }> {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  const map = (x: typeof r.violations): AxeFinding[] => x.map((v) => ({
    id: v.id, impact: String(v.impact), help: v.help,
    nodes: v.nodes.slice(0, 6).map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 160) })),
  }));
  return { violations: map(r.violations), incomplete: map(r.incomplete) };
}

export async function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0;
    };
    const text = (el: Element) => ((el as HTMLElement).innerText || el.getAttribute("aria-label") || (el as HTMLInputElement).value || el.getAttribute("data-testid") || "").trim().replace(/\s+/g, " ").slice(0, 50);

    // Touch targets: buttons, links, form controls. Hidden native radios/checkboxes are measured through their label.
    const small: Measure["small"] = [];
    const seen = new Set<Element>();
    const sel = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"]';
    document.querySelectorAll(sel).forEach((el) => {
      let target: Element = el;
      const isCheck = el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox");
      if (el instanceof HTMLInputElement && el.type === "hidden") return;
      if (isCheck) {
        const lab = el.closest("label");
        const r0 = el.getBoundingClientRect();
        if (lab && (r0.width < 20 || r0.height < 20 || getComputedStyle(el).opacity === "0" || getComputedStyle(el).position === "absolute")) target = lab;
      }
      if (seen.has(target) || !vis(target)) return;
      seen.add(target);
      const r = target.getBoundingClientRect();
      // Inline text links inside a sentence are exempt from the 44 px rule (WCAG 2.5.8 inline exception).
      const inline = target.tagName === "A" && !!target.closest("p, li") && getComputedStyle(target).display === "inline";
      const w = Math.round(r.width), h = Math.round(r.height);
      if (Math.min(w, h) < 44) small.push({ tag: target.tagName.toLowerCase(), text: text(target), w, h, kind: inline ? "inline-link" : isCheck ? "check" : "control" });
    });

    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(vis).map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent ?? "").trim().slice(0, 60) }));

    // Font sizes of rendered text
    let minFont = 999;
    const smallFonts: Measure["smallFonts"] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const sizes = new Map<number, string>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? "").trim();
      const el = n.parentElement;
      if (!t || !el || !vis(el) || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < minFont) minFont = px;
      if (px < 32 && smallFonts.length < 25) smallFonts.push({ text: t.slice(0, 40), px: Math.round(px * 10) / 10 });
      sizes.set(px, t.slice(0, 30));
    }

    // Primary action: the gold button.
    const prim = [...document.querySelectorAll("button.mm-btn:not(.mm-btn--secondary):not(.mm-btn--ghost):not(.mm-btn--danger), a.mm-btn:not(.mm-btn--secondary):not(.mm-btn--ghost):not(.mm-btn--danger)")].filter(vis).filter((b) => !(b as HTMLButtonElement).disabled)[0];
    let primary: Measure["primary"] = null;
    if (prim) {
      const r = prim.getBoundingClientRect();
      let sticky = false;
      for (let e: Element | null = prim; e; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === "sticky" || p === "fixed") { sticky = true; break; } }
      primary = { text: text(prim), top: Math.round(r.top), bottom: Math.round(r.bottom), centerY: Math.round(r.top + r.height / 2), vh: innerHeight, sticky, h: Math.round(r.height) };
    }
    const images = [...document.images].filter(vis).map((i) => ({ src: i.currentSrc.slice(0, 60), alt: i.getAttribute("alt") }));
    return {
      hScroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      innerWidth, small, headings, minFont: minFont === 999 ? 0 : minFont, smallFonts, primary,
      title: document.title, lang: document.documentElement.lang, images,
    };
  });
}

export function writeJson(name: string, data: unknown) {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULT_DIR, name), JSON.stringify(data, null, 2));
}
export function readJson<T>(name: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(RESULT_DIR, name), "utf8")) as T; } catch { return fallback; }
}

/** WCAG relative luminance contrast, used for the TV contrast audit. */
export function parseRgb(s: string): [number, number, number, number] | null {
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) return null;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p[3] ?? 1];
}
export function lum([r, g, b]: number[]) {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function ratio(a: number[], b: number[]) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ------------------------------------------------------------------ */
/* Contrast audit for pages with gradients (the big screen).           */
/* ------------------------------------------------------------------ */

export type ContrastRow = { text: string; px: number; weight: number; fg: string; bg: string; ratio: number; source: "css" | "pixels"; large: boolean };

export async function contrastAudit(page: Page): Promise<{ rows: ContrastRow[]; worst: ContrastRow[] }> {
  const items = await page.evaluate(() => {
    const out: { text: string; px: number; weight: number; fg: number[]; bg: number[] | null; rect: { x: number; y: number; width: number; height: number } }[] = [];
    const parse = (s: string): number[] => {
      const n = (s.match(/[\d.]+/g) ?? []).map(Number);
      return n.length === 3 ? [...n, 1] : n.length >= 4 ? n.slice(0, 4) : [0, 0, 0, 0];
    };
    const comp = (top: number[], under: number[]) => {
      const a = top[3] ?? 1;
      return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
    };
    const els = [...document.body.querySelectorAll("*")].filter((el) => {
      if (/^(SCRIPT|STYLE|NOSCRIPT|SVG|PATH)$/i.test(el.tagName)) return false;
      return [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);
    });
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 1 || r.height < 1 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (r.bottom < 0 || r.top > innerHeight) continue;
      // effective opacity
      let op = 1;
      for (let e: Element | null = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
      const fgRaw = parse(cs.color);
      const fgA = (fgRaw[3] ?? 1) * op;
      // background: walk up until opaque; mark unknown when an image or gradient is in the way
      let bg: number[] | null = [0, 0, 0, 0];
      let unknown = false;
      const stack: number[][] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.backgroundImage !== "none") { unknown = true; break; }
        const c = parse(s.backgroundColor);
        if ((c[3] ?? 1) > 0) stack.push(c);
        if ((c[3] ?? 1) >= 1) break;
      }
      if (!unknown) {
        let acc: number[] = [14, 11, 18, 1]; // page background fallback
        for (let i = stack.length - 1; i >= 0; i--) acc = comp(stack[i], acc);
        bg = acc;
      } else bg = null;
      const fg = [fgRaw[0], fgRaw[1], fgRaw[2], fgA];
      out.push({ text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40), px: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) || 400, fg, bg, rect: { x: r.x, y: r.y, width: r.width, height: r.height } });
    }
    return out;
  });
  const rows: ContrastRow[] = [];
  for (const it of items) {
    let bg = it.bg;
    let source: ContrastRow["source"] = "css";
    if (!bg) {
      // sample real pixels behind the text
      const clip = { x: Math.max(0, it.rect.x), y: Math.max(0, it.rect.y), width: Math.min(it.rect.width, 1900), height: Math.min(it.rect.height, 300) };
      if (clip.width < 2 || clip.height < 2) continue;
      const buf = await page.screenshot({ clip });
      const sampled = await page.evaluate(async ({ b64, fg }) => {
        const img = new Image();
        await new Promise<void>((res) => { img.onload = () => res(); img.src = "data:image/png;base64," + b64; });
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        const hist = new Map<string, { n: number; rgb: number[] }>();
        for (let i = 0; i < d.length; i += 4 * 3) {
          const dist = Math.hypot(d[i] - fg[0], d[i + 1] - fg[1], d[i + 2] - fg[2]);
          if (dist < 70) continue; // text pixels
          const k = `${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`;
          const e = hist.get(k) ?? { n: 0, rgb: [d[i], d[i + 1], d[i + 2]] };
          e.n++; hist.set(k, e);
        }
        let best: { n: number; rgb: number[] } | null = null;
        for (const e of hist.values()) if (!best || e.n > best.n) best = e;
        return best?.rgb ?? null;
      }, { b64: buf.toString("base64"), fg: it.fg });
      if (!sampled) continue;
      bg = [...sampled, 1];
      source = "pixels";
    }
    const a = it.fg[3];
    const fgBlend = [it.fg[0] * a + bg[0] * (1 - a), it.fg[1] * a + bg[1] * (1 - a), it.fg[2] * a + bg[2] * (1 - a)];
    const r = ratio(fgBlend, bg);
    const large = it.px >= 24 || (it.px >= 18.66 && it.weight >= 700);
    rows.push({ text: it.text, px: Math.round(it.px * 10) / 10, weight: it.weight, fg: fgBlend.map(Math.round).join(","), bg: bg.slice(0, 3).map(Math.round).join(","), ratio: Math.round(r * 100) / 100, source, large });
  }
  const worst = rows.filter((r) => r.ratio < (r.large ? 3 : 4.5)).sort((a, b) => a.ratio - b.ratio).slice(0, 12);
  return { rows, worst };
}
