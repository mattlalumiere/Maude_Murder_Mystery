# Murder Mystery Night

A funny whodunit party game for mixed-age groups: 10-20 adults (20-70) and 5-10 kids (1-15), about two hours. An AI Game Master builds the case, hands out secret character cards, runs the clues and twists, and is the only one who knows how it ends. Adults get cheeky secrets and optional sip-or-substitute drinking rules. Kids get real jobs, including being the victim who comes back as the Ghost Narrator.

Everything is fiction. Anyone can say "Pass". Alcohol is always optional.

## Two ways to play

| | Skill (any chatbot) | Web app (`web/`) |
|---|---|---|
| Setup | Paste a prompt, or install the Claude skill | Run or deploy the Next.js app |
| Secrets | Held by the AI in a Vault (encoded line or file) | Held by the server, filtered per player |
| Cards | One shared GM Station device | Private card on each phone |
| Big screen | No | Yes (cast, clues, countdowns) |
| Host override | Typed to the AI | Checked by the server |
| Best for | Zero-setup, quick games | The full party experience |

## What you get

- **Large-group design:** 8-10 suspects with Houses (factions) so 15-30 people all matter.
- **All ages:** toddlers are Mascots, kids are witnesses and informants, teens are Deputy GMs, seniors get large-print seated roles.
- **120-minute run sheet** with an intermission and fixed beats.
- **Fair, solvable cases** with three independent clue paths and resolved red herrings.
- **Drinking and silly mechanics** that are optional, safe, and passable.
- **Local AI option:** for testing without cloud accounts, `services/local-ai` runs voices, chat, photo-to-character art and video in containers connected over MCP. Pick "Local services" per game in the setup wizard.
- **Save and share stories:** teams can save a mystery (storyline only, or with its characters so new players pick who to be), share it by link or in a public gallery, add a spoiler-gated recap, and vote on the best ones. The solution stays sealed even from the replaying host.
- **AI guests (bots):** the host can add AI characters that chat with players, chime in at story beats, and speak aloud through the selected cloud's speech service (Amazon Polly on AWS, Azure AI Speech on Azure, free browser voices by default). They only know their own card plus public clues.
- **Voice mode:** spoken roll call, cast announcement, and narration.
- **Host Override Code:** nudge, advanced clue, accelerate, or the final answer if the game runs long.
- **Registration wizard (web):** the host signs in, then sets the game's direction (theme, setting, tone, spice, drinking, must-include and avoid lists). Any blank prompt means the AI picks.
- **Player character builder (web):** everyone gets one invite link (and a QR code on the big screen). Players choose "surprise me", give the GM an idea, or write their own backstory, and can upload a photo (with consent) for a cartoon look-alike.
- **AI pictures and video with a hard budget:** the host sets a maximum spend, sees what it buys (portraits, scene art per act, short video clips), tunes it live, and the server never spends past the cap.

## Quick start: skill

```bash
./build-portable.sh        # writes PORTABLE_PROMPT.md
```

- **ChatGPT, Gemini, others:** paste `PORTABLE_PROMPT.md` as the first message, then say "Host Mode" (or "voice").
- **Claude Code:** copy this folder to `~/.claude/skills/murder-mystery-night/`, then say "Let's run a murder mystery night."
- **Claude.ai:** zip the folder with `SKILL.md` at its root and upload it under Settings, Capabilities, Skills.
- **Player Mode:** a guest can paste their own card into any chat and say "Player Mode" for a character coach.

## Quick start: web app

```bash
cd web
cp .env.example .env.local     # set AUTH_SECRET; keep ALLOW_DEV_LOGIN=true for local use
npm install
npm run dev                    # http://localhost:3000
npm run test:smoke             # engine tests
```

Without `ROOMS_TABLE` it uses an in-memory store. Without `BEDROCK_MODEL_ID` it uses the built-in sample case. With `MEDIA_PROVIDER=mock` (the default locally) pictures are placeholder cards, so the whole flow works without AWS; set `MEDIA_PROVIDER=bedrock` on AWS for Nova Canvas, Nova Reel, and Rekognition. Hosts sign in with Google, Apple, or Facebook (Auth.js); guests join with a 4-letter room code and no account.

### Deploying for a real party

The first-iteration path is AWS with SST (Lambda, DynamoDB with 24-hour TTL, S3, Bedrock). Follow **[docs/RUNBOOK.md](docs/RUNBOOK.md)**: deploy, sign-in setup, a dry run on a small budget, party-day checklist, and rollback. It has not been run against real AWS yet, so do the dry run before the party.

`web/DESIGN.md` covers architecture, cost, and security notes. A longer-term portable platform design (cells, Postgres, S3-compatible storage, Kubernetes and Helm, OpenTofu) is in [docs/platform/](docs/platform/README.md); its cloud code is validated but never applied.

**Host quick card:** [docs/HOST_CARD.md](docs/HOST_CARD.md) is a one-page guide to print for party day.

## How a night works

1. The host signs in, registers the game (direction prompts, budget, secret Host Override Code), and shares the invite link.
2. Guests open the link and build their characters (backstory, optional photo). The AI casts everyone. Kids and teens can volunteer to be the victim.
3. Each guest receives a private card. The cast is announced publicly; only the secrets are hidden.
4. Acts run in order: party, death, interrogation and clues, twist, accusations, reveal.
5. Players submit secret accusations (who, how, why). The reveal scores everyone and hands out awards.

See [docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md) for the full host and player guide.

## Safety design

- Secrets are fictional and never about real people's lives or relationships.
- Alcohol is optional with a substitute, sips only, with water rounds and designated-driver reminders. `SAFE` drops all drinking and dares instantly.
- Kids and toddlers never take part in alcohol mechanics and get G-rated cards. The "murder" is a cartoon pratfall.
- Photos need explicit consent and are never shown to other players; only generated cartoon art appears on screens. **Photo likenesses for players under 18 are off by default** (`ALLOW_MINOR_PHOTOS=true` turns them on, and only with a real guardian-consent process). Uploads have location and camera metadata stripped on the server, are moderated (fail closed when moderation is on), and are deleted when a player is removed, when the reveal is done, or on request. Plain-language notice: `/privacy`.
- AI spending is capped server-side at the host's budget.

## Repository layout

| Path | Contents |
|---|---|
| `SKILL.md` | The Game Master skill |
| `references/` | Case design guide and content banks (drinks, dares, kid roles, themes, twists) |
| `build-portable.sh`, `PORTABLE_PROMPT.md` | Generator and output for paste-in chatbots |
| `docs/INSTRUCTIONS.md` | Host and player guide |
| `web/` | Next.js app, engine, AWS infrastructure, design doc |
| `docs/RUNBOOK.md`, `docs/HOST_CARD.md` | AWS deploy runbook and the one-page host card |
| `docs/council/` | Expert council reports (launch readiness, 2026-10-23) |
| `docs/platform/` | Portable multi-cloud platform design and specs |
| `AGENTS.md`, `CLAUDE.md` | Guidance for AI coding agents |

## Roadmap

1. Deploy to AWS and tune the Bedrock image and video prompts against real output.
2. Per-act AI narration, an "Ask the GM" Hot Seat, spoken narration on the big screen.
3. Multi-person scene composition and generated evidence images.
4. Realtime via IoT Core, a Polly/Transcribe or Nova Sonic voice Game Master, saved games.

## Contributing

Read `AGENTS.md` first. Keep secrets server-side, keep the skill and engine in sync, and avoid em dashes.
