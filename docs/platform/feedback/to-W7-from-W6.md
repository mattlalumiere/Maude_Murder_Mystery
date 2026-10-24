# W6 to W7

1. Mount `Gallery` (`import { Gallery } from "@/components/ui"`) at `/dev/ui` (done already in `app/dev/ui/page.tsx`; keep it dev-only, not linked from the product).
2. Wrap the app tree in `ToastProvider` from `@/components/ui` (a client component) if you want `useToast` anywhere; without it `useToast` is a silent no-op.
3. For the big screen set `data-surface="tv"` on a wrapper or on `<body>` via the screen page to get the TV type scale: `<div data-surface="tv">`. Selectors are `[data-surface="tv"]` (variables) and `[data-surface="tv"] main`.
4. Legacy classes (`.card`, `.pill`, `.row`, `.err`, `.ok`, `.muted`, `.grid`, `button.ghost`) and old variables (`--fg`, `--muted`, `--card`, `--line`, `--accent-fg`) still work via the compat layer. Note `.err` is now `--blood` and the primary button is gold. Migrate to `Button`, `Card`, `Field`, `Badge`, `Stack` gradually; delete the legacy block in `styles/base.css` request via feedback when done.
5. Use `Card tone="secret"` for private role cards, `PaperClue` for clues, `WaxSeal press` for the reveal.
6. Run `cd web && node src/styles/check-contrast.mjs` after any CSS change.
