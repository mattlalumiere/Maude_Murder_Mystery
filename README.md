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
- **Voice mode:** spoken roll call, cast announcement, and narration.
- **Host Override Code:** nudge, advanced clue, accelerate, or the final answer if the game runs long.

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

Without `ROOMS_TABLE` it uses an in-memory store. Without `BEDROCK_MODEL_ID` it uses the built-in sample case. Hosts sign in with Google, Apple, or Facebook (Auth.js); guests join with a 4-letter room code and no account.

Deploy to AWS (Lambda, DynamoDB with 24-hour TTL, S3, Bedrock) with SST:

```bash
cd web && npx sst deploy --stage party
```

See `web/DESIGN.md` for architecture, cost, and security notes. The AWS pieces have not been deployed yet.

## How a night works

1. The host creates a room (or starts a chat) and sets a secret Host Override Code.
2. Guests join and the AI casts everyone. Kids and teens can volunteer to be the victim.
3. Each guest receives a private card. The cast is announced publicly; only the secrets are hidden.
4. Acts run in order: party, death, interrogation and clues, twist, accusations, reveal.
5. Players submit secret accusations (who, how, why). The reveal scores everyone and hands out awards.

See [docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md) for the full host and player guide.

## Safety design

- Secrets are fictional and never about real people's lives or relationships.
- Alcohol is optional with a substitute, sips only, with water rounds and designated-driver reminders. `SAFE` drops all drinking and dares instantly.
- Kids and toddlers never take part in alcohol mechanics and get G-rated cards. The "murder" is a cartoon pratfall.
- Photo features (planned) require parent or host consent for children and expire after one day.

## Repository layout

| Path | Contents |
|---|---|
| `SKILL.md` | The Game Master skill |
| `references/` | Case design guide and content banks (drinks, dares, kid roles, themes, twists) |
| `build-portable.sh`, `PORTABLE_PROMPT.md` | Generator and output for paste-in chatbots |
| `docs/INSTRUCTIONS.md` | Host and player guide |
| `web/` | Next.js app, engine, AWS infrastructure, design doc |
| `AGENTS.md`, `CLAUDE.md` | Guidance for AI coding agents |

## Roadmap

1. Verify the web UI in a browser and deploy to AWS.
2. Per-act AI narration, an "Ask the GM" Hot Seat, spoken narration on the big screen.
3. Photo upload, moderation, and cartoon avatars; generated evidence and scene art.
4. Realtime via IoT Core, a Polly/Transcribe or Nova Sonic voice Game Master, saved games.

## Contributing

Read `AGENTS.md` first. Keep secrets server-side, keep the skill and engine in sync, and avoid em dashes.
