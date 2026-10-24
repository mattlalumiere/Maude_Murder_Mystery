import { LIMITS } from "./engine-limits";
import { PHASES, type CaseFile } from "./types";

/**
 * Validation and repair of CaseFile data that came from a model. Everything here treats the input as
 * untrusted data: strings are never interpreted, only measured, trimmed and compared.
 */
export interface CaseRoster { adults: number; kids: number; littles?: number; players?: unknown[] }
export interface ValidationResult { ok: boolean; errors: string[] }
export interface RepairResult { case: unknown; fixes: string[] }

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const ROLES = ["suspect", "witness", "victim", "mascot", "informant"];
const HANDLE_RE = /^P[0-9]{1,2}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const STR_CARD = ["story", "secret", "alibi", "goal", "special"] as const;

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const own = (o: Record<string, any>, k: string) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

// ---------- validate ----------
export function validateCase(input: unknown, roster: CaseRoster): ValidationResult {
  const errors: string[] = [];
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);
  if (!isObj(input)) return { ok: false, errors: ["$: case must be a JSON object"] };
  const c = input;

  let total = 0;
  try { total = JSON.stringify(c).length; } catch { err("$", "case is not serialisable"); }
  if (total > LIMITS.caseTotalChars) err("$", `case is too large (${total} chars, max ${LIMITS.caseTotalChars})`);

  const text = (path: string, v: unknown, max: number) => {
    if (!nonEmpty(v)) { err(path, "required non-empty string"); return false; }
    if (v.length > max) err(path, `too long (${v.length} chars, max ${max})`);
    return true;
  };
  const optText = (path: string, v: unknown, max: number) => {
    if (typeof v !== "string") { err(path, "must be a string"); return; }
    if (v.length > max) err(path, `too long (${v.length} chars, max ${max})`);
  };

  text("title", c.title, LIMITS.caseTitle);
  text("setting", c.setting, LIMITS.caseText);
  text("twist", c.twist, LIMITS.caseText);

  // characters
  const charIds = new Set<string>();
  const chars: Record<string, any>[] = [];
  if (!Array.isArray(c.characters)) err("characters", "must be an array");
  else {
    const need = Math.min((Number(roster.adults) || 0) + (Number(roster.kids) || 0), 6);
    if (c.characters.length < need) err("characters", `need at least ${need} characters, got ${c.characters.length}`);
    if (c.characters.length > LIMITS.caseMaxCharacters) err("characters", `too many characters (${c.characters.length}, max ${LIMITS.caseMaxCharacters})`);
    c.characters.slice(0, LIMITS.caseMaxCharacters).forEach((ch: unknown, i: number) => {
      const p = `characters[${i}]`;
      if (!isObj(ch)) return err(p, "must be an object");
      chars.push(ch);
      if (!nonEmpty(ch.id)) err(`${p}.id`, "required non-empty string");
      else if (!ID_RE.test(ch.id)) err(`${p}.id`, "must match pattern [A-Za-z0-9_-]{1,40}");
      else if (charIds.has(ch.id)) err(`${p}.id`, `duplicate id "${ch.id}"`);
      else charIds.add(ch.id);
      text(`${p}.name`, ch.name, LIMITS.caseTitle);
      text(`${p}.house`, ch.house, LIMITS.caseTitle);
      if (typeof ch.kid !== "boolean") err(`${p}.kid`, "must be a boolean");
      if (!ROLES.includes(ch.role)) err(`${p}.role`, `must be one of ${ROLES.join(", ")} (got ${JSON.stringify(String(ch.role)).slice(0, 40)})`);
      optText(`${p}.tease`, ch.tease, LIMITS.caseText);
      if (ch.forHandle !== undefined && !(typeof ch.forHandle === "string" && HANDLE_RE.test(ch.forHandle))) err(`${p}.forHandle`, "must look like P1, P2, ...");
      if (!isObj(ch.card)) return err(`${p}.card`, "must be an object");
      for (const f of STR_CARD) text(`${p}.card.${f}`, ch.card[f], LIMITS.caseText);
      if (!Array.isArray(ch.card.knows)) err(`${p}.card.knows`, "must be an array of strings");
      else ch.card.knows.forEach((k: unknown, j: number) => { if (typeof k !== "string") err(`${p}.card.knows[${j}]`, "must be a string"); else if (k.length > LIMITS.caseText) err(`${p}.card.knows[${j}]`, "too long"); });
    });
  }

  // killer / victim
  const byId = (id: unknown) => chars.find((x) => x.id === id);
  if (!nonEmpty(c.killerId) || !charIds.has(c.killerId)) err("killerId", `must be the id of a character (got ${JSON.stringify(String(c.killerId)).slice(0, 40)})`);
  else {
    const k = byId(c.killerId)!;
    if (k.kid === true) err("killerId", "the killer must be an adult character");
    if (k.role === "victim") err("killerId", "the killer cannot have the victim role");
  }
  if (!nonEmpty(c.victimId) || !charIds.has(c.victimId)) err("victimId", `must be the id of a character (got ${JSON.stringify(String(c.victimId)).slice(0, 40)})`);
  else if (c.victimId === c.killerId) err("victimId", "must differ from killerId");

  // options
  const optionIds = (key: "methods" | "motives") => {
    const ids = new Set<string>();
    const list = c[key];
    if (!Array.isArray(list)) { err(key, "must be an array"); return ids; }
    if (list.length < 2) err(key, `need at least 2 options, got ${list.length}`);
    if (list.length > LIMITS.caseMaxOptions) err(key, `too many options (${list.length}, max ${LIMITS.caseMaxOptions})`);
    list.slice(0, LIMITS.caseMaxOptions).forEach((o: unknown, i: number) => {
      const p = `${key}[${i}]`;
      if (!isObj(o)) return err(p, "must be an object");
      if (!nonEmpty(o.id) || !ID_RE.test(o.id)) err(`${p}.id`, "required id matching [A-Za-z0-9_-]{1,40}");
      else if (ids.has(o.id)) err(`${p}.id`, `duplicate id "${o.id}"`);
      else ids.add(o.id);
      text(`${p}.text`, o.text, LIMITS.caseTitle * 2);
    });
    return ids;
  };
  const methodIds = optionIds("methods");
  const motiveIds = optionIds("motives");
  const t = c.truth;
  if (!isObj(t)) err("truth", "must be an object");
  else {
    if (!nonEmpty(t.methodId) || !methodIds.has(t.methodId)) err("truth.methodId", `must be one of the method ids (got ${JSON.stringify(String(t.methodId)).slice(0, 40)})`);
    if (!nonEmpty(t.motiveId) || !motiveIds.has(t.motiveId)) err("truth.motiveId", `must be one of the motive ids (got ${JSON.stringify(String(t.motiveId)).slice(0, 40)})`);
    text("truth.story", t.story, LIMITS.caseText * 2);
  }

  // clues
  if (!Array.isArray(c.clues)) err("clues", "must be an array");
  else {
    if (c.clues.length < 8) err("clues", `need at least 8 clues, got ${c.clues.length}`);
    if (c.clues.length > LIMITS.caseMaxClues) err("clues", `too many clues (${c.clues.length}, max ${LIMITS.caseMaxClues})`);
    const seen = new Set<string>();
    const rounds = new Set<unknown>();
    c.clues.slice(0, LIMITS.caseMaxClues).forEach((cl: unknown, i: number) => {
      const p = `clues[${i}]`;
      if (!isObj(cl)) return err(p, "must be an object");
      if (!nonEmpty(cl.id) || !ID_RE.test(cl.id)) err(`${p}.id`, "required id matching [A-Za-z0-9_-]{1,40}");
      else if (cl.id === "twist") err(`${p}.id`, 'the id "twist" is reserved');
      else if (seen.has(cl.id)) err(`${p}.id`, `duplicate id "${cl.id}"`);
      else seen.add(cl.id);
      if (cl.round !== 1 && cl.round !== 2) err(`${p}.round`, "must be 1 or 2"); else rounds.add(cl.round);
      text(`${p}.text`, cl.text, LIMITS.caseText);
    });
    if (c.clues.length >= 8 && !rounds.has(1)) err("clues", "no clues in round 1");
    if (c.clues.length >= 8 && !rounds.has(2)) err("clues", "no clues in round 2");
  }

  // per-phase text maps and awards
  for (const key of ["narration", "nudges", "advanced"] as const) {
    const m = c[key];
    if (!isObj(m)) { err(key, "must be an object keyed by phase"); continue; }
    for (const [ph, v] of Object.entries(m)) {
      if (!(PHASES as string[]).includes(ph)) err(`${key}.${ph}`, "unknown phase");
      else if (typeof v !== "string") err(`${key}.${ph}`, "must be a string");
      else if (v.length > LIMITS.caseText) err(`${key}.${ph}`, "too long");
    }
  }
  if (!Array.isArray(c.awards)) err("awards", "must be an array of strings");
  else c.awards.forEach((a: unknown, i: number) => { if (typeof a !== "string" || !a.trim()) err(`awards[${i}]`, "must be a non-empty string"); else if (a.length > LIMITS.caseTitle) err(`awards[${i}]`, "too long"); });

  // truth must not be pasted into text every player (or the TV) sees
  const secretStory = isObj(t) && nonEmpty(t.story) && t.story.length >= 20 ? t.story : null;
  const killer = byId(c.killerId);
  const killerSecret = killer && isObj(killer.card) && nonEmpty(killer.card.secret) && killer.card.secret.length >= 20 ? killer.card.secret : null;
  const publicText: [string, unknown][] = [["twist", c.twist], ["setting", c.setting], ["title", c.title]];
  if (Array.isArray(c.clues)) c.clues.forEach((cl: any, i: number) => publicText.push([`clues[${i}].text`, isObj(cl) ? cl.text : undefined]));
  if (isObj(c.narration)) for (const [ph, v] of Object.entries(c.narration)) publicText.push([`narration.${ph}`, v]);
  for (const [path, v] of publicText) {
    if (typeof v !== "string") continue;
    if (secretStory && v.includes(secretStory)) err(path, "contains the full truth.story (publicly visible text must not)");
    if (killerSecret && v.includes(killerSecret)) err(path, "contains the killer's secret (publicly visible text must not)");
  }
  return { ok: errors.length === 0, errors };
}

// ---------- repair ----------
const slug = (s: string, fallback: string) => {
  const r = s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return r || fallback;
};
const cleanStr = (v: string, max: number) => v.replace(CONTROL, "").trim().slice(0, max);

/**
 * Safe, mechanical fixes only: trimming, control characters, length caps, missing or duplicate ids,
 * wrong-typed optional fields, references given by name instead of id. It never invents a killer,
 * a truth, clues or story text. Pure: the input is not modified. Run validateCase afterwards.
 */
export function repairCase(input: unknown): RepairResult {
  const fixes: string[] = [];
  if (!isObj(input)) return { case: input, fixes };
  const fix = (m: string) => fixes.push(m);
  const out: Record<string, any> = {};

  const str = (path: string, v: unknown, max: number) => {
    if (typeof v !== "string") return v;
    const r = cleanStr(v, max);
    if (r !== v) fix(`${path}: cleaned`);
    return r;
  };

  for (const f of ["title", "setting", "twist"] as const) if (own(input, f) !== undefined) out[f] = str(f, input[f], f === "title" ? LIMITS.caseTitle : LIMITS.caseText);
  for (const f of ["killerId", "victimId"] as const) if (own(input, f) !== undefined) out[f] = typeof input[f] === "string" ? input[f].trim() : input[f];

  const uniqueId = (base: string, used: Set<string>) => {
    let id = base, n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };

  // characters
  const nameToId = new Map<string, string>();
  if (Array.isArray(input.characters)) {
    const used = new Set<string>();
    out.characters = input.characters.slice(0, LIMITS.caseMaxCharacters).map((ch: unknown, i: number) => {
      if (!isObj(ch)) return ch;
      const p = `characters[${i}]`;
      const r: Record<string, any> = {};
      const name = typeof ch.name === "string" ? cleanStr(ch.name, LIMITS.caseTitle) : ch.name;
      r.name = name;
      let id = typeof ch.id === "string" ? ch.id.trim() : "";
      if (!ID_RE.test(id)) { id = slug(typeof name === "string" ? name : "", `char-${i + 1}`); fix(`${p}.id: ${ch.id === undefined ? "generated" : "normalised"} "${id}"`); }
      else if (used.has(id)) { const u = id; id = uniqueId(id, used); fix(`${p}.id: duplicate "${u}" renamed "${id}"`); }
      used.add(id);
      r.id = id;
      if (typeof name === "string") nameToId.set(name.toLowerCase(), id);
      r.house = str(`${p}.house`, ch.house, LIMITS.caseTitle);
      if (typeof ch.kid === "boolean") r.kid = ch.kid; else { r.kid = false; fix(`${p}.kid: defaulted to false`); }
      if (ROLES.includes(ch.role)) r.role = ch.role; else { r.role = "witness"; fix(`${p}.role: defaulted to witness`); }
      r.tease = ch.tease === undefined ? (fix(`${p}.tease: defaulted to empty`), "") : str(`${p}.tease`, ch.tease, LIMITS.caseText);
      if (typeof ch.forHandle === "string" && HANDLE_RE.test(ch.forHandle.trim())) r.forHandle = ch.forHandle.trim();
      else if (ch.forHandle !== undefined) fix(`${p}.forHandle: dropped`);
      // Self-cast fields: the name-token slot, the public occupation and the private trait.
      if (typeof ch.slot === "string" && /^[A-Za-z0-9]{1,8}$/.test(ch.slot.trim())) r.slot = ch.slot.trim();
      if (typeof ch.title === "string") r.title = cleanStr(ch.title, 60);
      if (typeof ch.trait === "string") r.trait = cleanStr(ch.trait, 40);
      if (isObj(ch.card)) {
        const card: Record<string, any> = {};
        for (const f of STR_CARD) card[f] = str(`${p}.card.${f}`, ch.card[f], LIMITS.caseText);
        const knows = Array.isArray(ch.card.knows) ? ch.card.knows : typeof ch.card.knows === "string" ? [ch.card.knows] : [];
        card.knows = knows.filter((k: unknown) => typeof k === "string").map((k: string) => cleanStr(k, LIMITS.caseText));
        if (card.knows.length !== (Array.isArray(ch.card.knows) ? ch.card.knows.length : -1)) fix(`${p}.card.knows: coerced to strings`);
        r.card = card;
      } else r.card = ch.card;
      return r;
    });
  } else if (own(input, "characters") !== undefined) out.characters = input.characters;

  // map killer/victim given by name
  for (const f of ["killerId", "victimId"] as const) {
    const v = out[f];
    if (typeof v === "string" && Array.isArray(out.characters) && !out.characters.some((x: any) => x?.id === v)) {
      const hit = out.characters.find((x: any) => x?.id?.toLowerCase?.() === v.toLowerCase()) ?? null;
      const id = hit?.id ?? nameToId.get(v.toLowerCase());
      if (id) { out[f] = id; fix(`${f}: mapped "${v.slice(0, 40)}" to "${id}"`); }
    }
  }

  // options
  const optionsOf = (key: "methods" | "motives") => {
    const list = input[key];
    if (!Array.isArray(list)) { if (own(input, key) !== undefined) out[key] = list; return; }
    const used = new Set<string>();
    out[key] = list.slice(0, LIMITS.caseMaxOptions).map((o: unknown, i: number) => {
      if (!isObj(o)) return o;
      const text = typeof o.text === "string" ? cleanStr(o.text, LIMITS.caseTitle * 2) : o.text;
      let id = typeof o.id === "string" ? o.id.trim() : "";
      if (!ID_RE.test(id)) { id = uniqueId(slug(typeof text === "string" ? text : "", `${key === "methods" ? "m" : "v"}-${i + 1}`), used); fix(`${key}[${i}].id: generated "${id}"`); }
      else if (used.has(id)) { const u = id; id = uniqueId(id, used); fix(`${key}[${i}].id: duplicate "${u}" renamed "${id}"`); }
      else used.add(id);
      return { id, text };
    });
  };
  optionsOf("methods"); optionsOf("motives");

  if (isObj(input.truth)) {
    const t: Record<string, any> = { story: str("truth.story", input.truth.story, LIMITS.caseText * 2) };
    for (const [f, key] of [["methodId", "methods"], ["motiveId", "motives"]] as const) {
      let v = input.truth[f];
      if (typeof v === "string") {
        v = v.trim();
        const list: any[] = Array.isArray(out[key]) ? out[key] : [];
        if (!list.some((o) => o?.id === v)) {
          const hit = list.find((o) => typeof o?.text === "string" && o.text.toLowerCase() === v.toLowerCase());
          if (hit) { fix(`truth.${f}: mapped option text to "${hit.id}"`); v = hit.id; }
        }
      }
      if (v !== undefined) t[f] = v;
    }
    out.truth = t;
  } else if (own(input, "truth") !== undefined) out.truth = input.truth;

  // clues
  if (Array.isArray(input.clues)) {
    const used = new Set<string>(["twist"]);
    out.clues = input.clues.slice(0, LIMITS.caseMaxClues).map((cl: unknown, i: number) => {
      if (!isObj(cl)) return cl;
      let id = typeof cl.id === "string" ? cl.id.trim() : "";
      if (!ID_RE.test(id) || id === "twist") { id = uniqueId(`clue-${i + 1}`, used); fix(`clues[${i}].id: generated "${id}"`); }
      else if (used.has(id)) { const u = id; id = uniqueId(id, used); fix(`clues[${i}].id: duplicate "${u}" renamed "${id}"`); }
      else used.add(id);
      // Models sometimes number clues 1..N. Anything outside 1 or 2 is placed by position: first half round 1, second half round 2.
      const round = cl.round === 1 || cl.round === "1" ? 1 : cl.round === 2 || cl.round === "2" ? 2 : (i < input.clues.length / 2 ? 1 : 2);
      if (round !== cl.round) fix(`clues[${i}].round: coerced to number`);
      return { id, round, text: str(`clues[${i}].text`, cl.text, LIMITS.caseText) };
    });
  } else if (own(input, "clues") !== undefined) out.clues = input.clues;

  // phase maps (unknown phases and non-strings dropped)
  for (const key of ["narration", "nudges", "advanced"] as const) {
    const m = input[key];
    if (!isObj(m)) { if (own(input, key) !== undefined) out[key] = m; continue; }
    const r: Record<string, string> = {};
    for (const [ph, v] of Object.entries(m)) {
      if (!(PHASES as string[]).includes(ph) || typeof v !== "string") { fix(`${key}.${ph}: dropped`); continue; }
      r[ph] = cleanStr(v, LIMITS.caseText);
    }
    out[key] = r;
  }
  if (Array.isArray(input.awards)) out.awards = input.awards.map((a: unknown) => (typeof a === "string" ? cleanStr(a, LIMITS.caseTitle) : a));
  else if (typeof input.awards === "string") { out.awards = [cleanStr(input.awards, LIMITS.caseTitle)]; fix("awards: wrapped in an array"); }
  else if (own(input, "awards") !== undefined) out.awards = input.awards;

  // unknown top-level fields are dropped (they would otherwise ride along into the stored room)
  for (const k of Object.keys(input)) if (!(k in out) && ![ "title","setting","twist","killerId","victimId","characters","methods","motives","truth","clues","narration","nudges","advanced","awards"].includes(k)) fix(`${k}: unknown field dropped`);
  return { case: out, fixes };
}

// ---------- parse + repair + validate ----------
export interface ParsedCase { ok: boolean; case?: CaseFile; errors: string[]; fixes: string[] }

/** Takes raw model text, extracts the outermost JSON object, repairs, validates. */
export function parseModelCase(text: string, roster: CaseRoster): ParsedCase {
  const s = String(text ?? "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return { ok: false, errors: ["$: no JSON object found in model output"], fixes: [] };
  let raw: unknown;
  try { raw = JSON.parse(s.slice(a, b + 1)); } catch (e) { return { ok: false, errors: [`$: invalid JSON (${(e as Error).message.slice(0, 80)})`], fixes: [] }; }
  const { case: repaired, fixes } = repairCase(raw);
  const v = validateCase(repaired, roster);
  return v.ok ? { ok: true, case: repaired as CaseFile, errors: [], fixes } : { ok: false, errors: v.errors, fixes };
}
