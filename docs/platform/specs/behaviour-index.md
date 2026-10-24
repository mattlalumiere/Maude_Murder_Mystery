# Behaviour index (written before the features)

Test-first checklist for `web/features/*.feature`. A box is ticked only after the scenario exists and `npx cucumber-js --dry-run` parses it.

- [x] game-creation: host signs in and creates a game; override code too short is refused; unauthenticated creation refused; budget recommends a plan; join code is 4 letters; game starts in lobby; code never reveals internal id
- [x] joining: join by code with name; code is case-insensitive; duplicate name refused; empty name refused; unknown code refused; full game refused; join after start refused; token required for private data
- [x] secrecy: no truth before reveal on any view; player sees only own card; host cannot see solution without override code; unauthenticated screen sees no cards; wrong token refused
- [x] override-code: correct code nudge; 3 wrong codes lock for 10 minutes; lock survives retries; code never echoed; lock expires; final needs confirm
- [x] voting-scoring: ballots open only in act 4; invalid ballot refused; ballot can be changed; scoring points; killer escape bonus; no ballot scores zero
- [x] reveal: reveal shows killer method motive story scores awards; only after reveal; advance past reveal refused; ballots closed
- [x] safety-rules: Pass honoured; SAFE honoured; kids never in alcohol mechanics; alcohol optional; drinking none removes alcohol; kid content G-rated; victim never a toddler
- [x] photo-consent: consent required; guardian consent for minors; photo never in any view; other players cannot fetch; delete on request; purge all; photos refused after start; non-JPEG refused; moderation refusal
- [x] budget-cap: plan trimmed to cap; spend never exceeds cap; paused media; cap cannot drop below spent; local models priced at zero still counted
- [x] ai-degradation: model down uses sample case; invalid model output repaired or falls back; slow model times out; image generation down keeps game playable; host told sample is in use
- [x] tenant-isolation: game A token cannot read B; host of A cannot act on B; media of A not served under B; keys carry game prefix; deleting A leaves B intact; code collision impossible
- [x] game-expiry-deletion: expiry deletes everything; host delete; delete is permanent; directory entry removed; export before delete; deleted code not reusable immediately
- [x] quotas: max players; request rate limit with headers; stored bytes limit; AI spend limit; AI token limit
- [x] scale: 1000 games at once; p95 poll; join time; one cell capacity; one game failing does not affect others; recovery after cell restart
- [x] health: healthz always up; readyz reports store down

Verification: `cucumber-js --dry-run` over `web/features/*.feature` parses 15 features, 179 scenarios (outlines expanded), 797 steps, all undefined (expected). Note: the repo's `web/cucumber.js` uses `loader: ["tsx"]`, which fails on this Node ("tsx must be loaded with --import"). Reported to the owner of the file (see feedback).
