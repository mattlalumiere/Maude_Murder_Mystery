# data-testid reference

Owned by W7. Every key control and region on every screen has a stable `data-testid`. Names in braces are dynamic.

Dynamic patterns: wizard counters `adults|kids|toddlers` + `-minus|-plus|-value`; tiers `tier-{id}`; suspects `suspect-{characterId}`; methods `method-{id}`; motives `motive-{id}`; overrides `override-{nudge|advanced|accelerate|final|final_reveal}`; login `login-{provider}`; join modes `join-mode-{gm|hint|own}`.

State attributes: `connection-status[data-status=live|reconnecting|loading|failed]`, `character-card[data-open]`, `player-screen[data-phase]`, `tv-game[data-phase]`.

## Landing (/)

- `landing-hero`
- `landing-join`
- `landing-join-code`
- `landing-join-submit`
- `landing-host`
- `landing-host-link`

## Login (/login)

- `login-no-providers`
- `login-{p}`
- `login-dev-name`
- `login-dev-submit`

## Host wizard (/host/new)

- `{id}-minus`
- `{id}-value`
- `{id}-plus`
- `wizard`
- `wizard-steps`
- `wizard-progress`
- `wizard-step-1`
- `field-name`
- `field-length`
- `field-spice`
- `field-drinking`
- `wizard-step-2`
- `field-theme`
- `field-setting`
- `field-tone`
- `field-include`
- `field-avoid`
- `field-backstory`
- `wizard-step-3`
- `field-budget`
- `tier-list`
- `tier-{t.id}`
- `finetune`
- `estimate`
- `estimate-total`
- `wizard-step-4`
- `field-override`
- `summary`
- `wizard-error`
- `wizard-create-error`
- `wizard-back`
- `wizard-next`
- `wizard-create`

## Host console (/host/[code])

- `host-console`
- `host-room-code`
- `host-phase`
- `host-paused`
- `host-ai-notice`
- `host-error`
- `host-main-card`
- `host-start`
- `host-advance`
- `host-pause`
- `host-ballots`
- `host-invite`
- `host-invite-url`
- `host-open-screen`
- `host-guests`
- `host-guest`
- `host-remove`
- `host-add-name`
- `host-add-age`
- `host-add-submit`
- `host-handoff`
- `host-cast`
- `host-runsheet`
- `host-budget`
- `host-override`
- `host-override-code`
- `override-{cmd.toLowerCase()}`
- `override-message`
- `host-copy-invite`
- `host-qr`
- `budget-panel`
- `budget-progress`
- `plan-avatars`
- `plan-scenes`
- `plan-videos`
- `plan-quality`
- `plan-pause`
- `purge-photos`
- `budget-input`
- `budget-save`

## Join (/join/[code])

- `join-builder`
- `join-room`
- `join-name`
- `join-age`
- `join-victim`
- `join-mode-{m}`
- `join-text`
- `join-error`
- `join-photo-note`
- `join-submit`

## Player (/play/[code])

- `player-loading`
- `player-error`
- `player-screen`
- `player-phase`
- `player-paused`
- `player-narration`
- `player-lobby`
- `clues`
- `clue`
- `reveal`
- `reveal-killer`
- `reveal-scores`
- `photo-panel`
- `character-card`
- `envelope`
- `card-open`
- `card-story`
- `card-secret`
- `card-ready`
- `card-ready-done`
- `card-hide`
- `{testPrefix}-{o.id}`
- `ballot`
- `ballot-progress-text`
- `lineup`
- `suspect-{s.id}`
- `ballot-submit`
- `ballot-done`
- `photo-section`
- `photo-save`
- `photo-remove`
- `photo-message`

## Big screen (/screen/[code])

- `tv-loading`
- `tv-lobby`
- `tv-url`
- `tv-code`
- `tv-guests`
- `tv-game`
- `tv-paused`
- `tv-phase`
- `tv-narration`
- `tv-ballots`
- `tv-reveal`
- `tv-clues`
- `tv-cast`
- `tv-qr`

## Shared components

- `connection-status`
- `loading-skeleton`
- `host-bar`
- `sign-out`
- `media-item`
- `photo-picker`
- `photo-input`
- `photo-consent`
