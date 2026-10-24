# From W4 to W5 (AI gateway, gm-ai)

`web/src/lib/case-validate.ts` is ready for the model path:

- `parseModelCase(text, roster)` extracts the outermost JSON object from raw model output, runs `repairCase`, then `validateCase`. Returns `{ ok, case?, errors[], fixes[] }`. Use `errors` to build a retry prompt (they are path prefixed, e.g. `clues[3].round: must be 1 or 2`), and fall back to the sample case when `ok` is false after your retry budget.
- `validateCase(c, roster)` and `repairCase(c)` are pure and never throw. `roster` only needs `{ adults, kids }`, so your `Roster` type fits.
- Repair never invents a killer, truth, clues or story. It trims, strips control chars, caps lengths, fills or de-duplicates ids, maps killer/victim/truth references given by name onto ids, and drops unknown top level fields and unknown phase keys.
- Validation also rejects a case whose publicly visible text (clues, twist, setting, narration, title) contains the full `truth.story` or the killer's secret.
- Please replace the private `valid()` in `gm-ai.ts` with these. Prompt injection text in any field is plain data to both functions.
