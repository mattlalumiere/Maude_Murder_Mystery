#!/usr/bin/env node
// Hand-rolled mutation runner (no dependencies). Never touches the live tree.
//
//   node docs/platform/testing/mutation/mutate.mjs [--with-review] [--with-scale] [--only=id1,id2] [--area=engine] [--out=results.json]
//
// For each entry in mutations.json it copies web/ into a temp dir (node_modules symlinked, .next/.data/coverage
// excluded) once, then for every mutation: restores the file, applies one exact-string replacement
// (the "find" text must occur exactly once), runs `vitest run` (JSON reporter) and then `tsx scripts/smoke.ts`,
// and records the first failing test (KILLED), or SURVIVED, or BAD_PATTERN when the find text is not unique.
// By default web/test/unit/review/** (tests added by the test agents) is excluded so the score reflects the
// developers' own tests; pass --with-review to include them.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, "../../../../web");
const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const withReview = args.includes("--with-review");
const withScale = args.includes("--with-scale"); // scale project is slow; off by default
const only = flag("only")?.split(",");
const area = flag("area");
const out = flag("out") ?? join(here, "results.json");
const muts = JSON.parse(readFileSync(join(here, "mutations.json"), "utf8")).filter((m) => (!only || only.includes(m.id)) && (!area || m.area === area));

const tmp = mkdtempSync(join(tmpdir(), "mm-mutate-"));
const root = join(tmp, "web");
const skip = new Set(["node_modules", ".next", ".data", "coverage"]);
cpSync(web, root, { recursive: true, filter: (src) => !skip.has(src.split("/").pop()) && !(src.endsWith("/test/unit/review") && !withReview) });
symlinkSync(join(web, "node_modules"), join(root, "node_modules"));
console.log(`scratch copy: ${root}`);

const pristine = new Map();
const read = (f) => readFileSync(join(root, f), "utf8");
const run = (cmd, a, ms) => spawnSync(cmd, a, { cwd: root, encoding: "utf8", timeout: ms, env: { ...process.env, CI: "1" } });

function vitest() {
  const of = join(tmp, "vitest.json");
  rmSync(of, { force: true });
  const projects = (withScale ? ["unit", "contract", "security", "scale"] : ["unit", "contract", "security"]).flatMap((p) => ["--project", p]);
  const r = run("npx", ["vitest", "run", ...projects, "--reporter=json", `--outputFile=${of}`], 180_000);
  if (r.error && r.error.code === "ETIMEDOUT") return { status: "timeout" };
  if (!existsSync(of)) return { status: "crash", detail: (r.stderr || r.stdout || "").slice(0, 300) };
  const j = JSON.parse(readFileSync(of, "utf8"));
  if (j.numFailedTests === 0 && j.numFailedTestSuites === 0) return { status: "pass" };
  const failed = [];
  for (const f of j.testResults) {
    const rel = f.name.slice(f.name.indexOf("/test/") + 1);
    const bad = f.assertionResults.filter((a) => a.status === "failed");
    if (bad.length) failed.push(...bad.slice(0, 2).map((a) => `${rel} > ${a.fullName}`));
    else if (f.status === "failed") failed.push(`${rel} (suite failed to load: ${(f.message || "").split("\n")[0].slice(0, 100)})`);
  }
  return { status: "fail", failed, count: j.numFailedTests };
}

const base = vitest();
if (base.status !== "pass") { console.error("baseline is not green in the scratch copy, aborting", JSON.stringify(base).slice(0, 600)); process.exit(2); }
const tscBase = run("npx", ["tsc", "--noEmit"], 120_000).status === 0; // only count type errors as kills when the baseline typechecks
if (!tscBase) console.log("note: baseline tsc is red in the scratch copy, type errors will not count as kills");
const results = [];
for (const m of muts) {
  const rel = m.file.replace(/^web\//, "");
  const file = join(root, rel);
  if (!pristine.has(rel)) pristine.set(rel, readFileSync(file, "utf8"));
  const src = pristine.get(rel);
  const n = src.split(m.find).length - 1;
  if (n !== 1) { results.push({ ...m, verdict: "BAD_PATTERN", detail: `find text occurs ${n} times` }); console.log(`${m.id} BAD_PATTERN (${n})`); continue; }
  writeFileSync(file, src.replace(m.find, () => m.replace));
  let verdict, caughtBy = [];
  const t0 = Date.now();
  const tc = tscBase ? run("npx", ["tsc", "--noEmit"], 120_000) : { status: 0 };
  const v = vitest();
  if (v.status === "fail") { verdict = "KILLED"; caughtBy = v.failed; }
  else if (v.status === "timeout") { verdict = "KILLED"; caughtBy = ["(timeout: hang detected by vitest run)"]; }
  else if (v.status === "crash") { verdict = "KILLED"; caughtBy = [`(vitest crashed) ${v.detail}`]; }
  else {
    const s = run("npx", ["tsx", "scripts/smoke.ts"], 60_000);
    if (s.status !== 0) { verdict = "KILLED"; caughtBy = ["scripts/smoke.ts"]; }
    else if (tc.status !== 0) { verdict = "KILLED"; caughtBy = ["tsc --noEmit (type error only)"]; }
    else verdict = "SURVIVED";
  }
  writeFileSync(file, src);
  results.push({ id: m.id, area: m.area, file: m.file, desc: m.desc, verdict, caughtBy: caughtBy.slice(0, 3), secs: Math.round((Date.now() - t0) / 100) / 10 });
  console.log(`${m.id} ${verdict} ${caughtBy[0] ?? ""}`);
}
const killed = results.filter((r) => r.verdict === "KILLED").length;
const valid = results.filter((r) => r.verdict !== "BAD_PATTERN").length;
console.log(`\nmutation score: ${killed}/${valid} killed (${valid ? Math.round((100 * killed) / valid) : 0}%), survivors: ${results.filter((r) => r.verdict === "SURVIVED").map((r) => r.id).join(", ") || "none"}`);
writeFileSync(out, JSON.stringify(results, null, 2));
rmSync(tmp, { recursive: true, force: true });
