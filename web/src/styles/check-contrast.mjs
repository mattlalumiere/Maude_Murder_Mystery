// Token and accessibility checks. Run: cd web && node src/styles/check-contrast.mjs
// Checks WCAG contrast for every text/background pair and that every animation has a reduced-motion override.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(dir, "tokens.css"), "utf8");
const v = {};
for (const m of tokens.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) v[m[1]] = m[2];

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(v[a]), lum(v[b])].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum]. 4.5 text, 3 large text and UI components.
const pairs = [
  ["ink", "bg", 4.5], ["ink", "bg-raised", 4.5], ["ink", "bg-sunken", 4.5],
  ["ink-dim", "bg", 4.5], ["ink-dim", "bg-raised", 4.5],
  ["accent", "bg", 4.5], ["accent", "bg-raised", 4.5],
  ["accent-ink", "accent", 4.5],
  ["blood", "bg", 4.5], ["blood", "bg-raised", 4.5],
  ["ghost", "bg", 4.5], ["ghost", "bg-raised", 4.5],
  ["good", "bg", 4.5], ["good", "bg-raised", 4.5],
  ["warn", "bg", 4.5], ["warn", "bg-raised", 4.5],
  ["paper-ink", "paper", 4.5], ["paper-dim", "paper", 4.5],
  ["ink", "blood-deep", 4.5],
  ["border", "bg", 3], ["border", "bg-raised", 3],
  ["ghost", "bg", 3], // focus ring against page
  ["accent", "bg", 3], // glow outlines
];
let fail = 0;
for (const [f, b, min] of pairs) {
  const r = ratio(f, b);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${f.padEnd(10)} on ${b.padEnd(10)} ${r.toFixed(2)}:1 (min ${min})`);
}

// Reduced-motion coverage
const files = readdirSync(dir).filter((f) => f.endsWith(".css"));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
for (const f of files) {
  const css = strip(readFileSync(join(dir, f), "utf8"));
  const rm = [...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\n\})/g)].map((m) => m[1]).join("\n");
  // top-level rules (outside @media/@keyframes) that declare animation
  const flat = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
    .replace(/@media[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*\banimation(?:-name)?\s*:[^{}]*)\}/g)) {
    for (const sel of m[1].split(",").map((s) => s.trim())) {
      const ok = rm.includes(sel);
      if (!ok) fail++;
      console.log(`${ok ? "PASS" : "FAIL"}  reduced-motion override for ${sel} (${f})`);
    }
  }
  const kfs = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  for (const k of kfs) {
    const used = new RegExp(`animation[^;{}]*\\b${k}\\b`).test(css);
    if (!used) { fail++; console.log(`FAIL  keyframes ${k} unused (${f})`); }
  }
}
console.log(fail ? `\n${fail} check(s) failed` : "\nAll checks passed");
process.exit(fail ? 1 : 0);
