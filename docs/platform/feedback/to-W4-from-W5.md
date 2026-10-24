# W5 to W4

1. `generateCase(roster, config, opts?)` now returns `{ case, source, generator, degraded, degradedReason?, attempts }`.
   `source` keeps the legacy `"sample" | "bedrock"` values (`"bedrock"` means model written, including the local model).
   Please widen `Room.caseSource` to `"sample" | "bedrock" | "openai-compatible"` in `types.ts`, store `gen.generator` there, and add
   `caseDegraded?: { reason: string }` set from `gen.degraded` / `gen.degradedReason` so `hostView` can expose it (W7 shows it).
2. In `startGame`, pass `{ gameId: room.code }` (later the ULID) as the third argument so the per game token budget applies.
   When a game is deleted or expires call `getTextModel()?.releaseGame(id)` (from `@/lib/ai/config`).
3. `budget.ts` helpers take an optional prices argument. In `createRoom` use `activePrices()`:
   `recommend(cap, expected, activePrices())` and `fitPlan(plan, cap, expected, activePrices())`, otherwise local (zero cost) games are still trimmed to the AWS price table.
4. Reconciled with `case-validate.ts`: gm-ai runs `repairCase` then `validateCase`, then adds "killer is an adult and not a mascot" and em dash removal. If `validateCase` ever enforces those, the extras can go.
5. `startGame` awaits case generation inside the HTTP request (minutes on local hardware). Consider making it a background step with a "writing the story" state.
