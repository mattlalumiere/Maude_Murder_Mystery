# How to Run a Murder Mystery Night

A guide for the host and the players. Plan on about 2 hours, 15 to 30 people, ages 1 to 70+.

## Before the night

1. **Pick a mode** (see the main README): the web app (best), or the skill in Claude/ChatGPT/Gemini.
2. **Gather the roster:** each person's name, age group (1-5, 6-12, 13-15, adult), who is partnered with whom, who is drinking alcohol and who is not, and any topics that are off-limits.
3. **Invent your Host Override Code**, a secret word you will not say aloud. It unlocks spoilers if the game runs long. You cannot recover it, and the AI never sees it.
4. **Set up the space:** a TV or laptop for the big screen, Wi-Fi, a quiet corner for naps, snacks, water, juice, and mocktails.
5. **Optional:** suggest costumes. Cheap props go a long way (a hat, a scarf, a mustache).

## Starting the game (web app)

1. Open the site and choose **Host a game**. Sign in with Google, Apple, or Facebook (your first sign-in creates your host account).
2. **Set up your game:** party name, how many adults, kids, and toddlers, length, spice, and drinking. Add optional prompts for theme, setting, tone, things to include, and things to avoid. Leave any blank and the AI picks.
3. **Set your AI picture and video budget.** The page shows what your budget buys (text only, portraits, storybook, illustrated, cinematic, blockbuster) and an itemized estimate. Fine-tune it, or leave it on the recommendation. You can change or pause it during the game, and spending never exceeds your budget.
4. Type your Host Override Code and create the room. You get a 4-letter **room code** and an **invite link** with a QR code.
5. Open the **big screen** link on the TV.
6. **Share the invite link with every player.** Each person builds their character: name, age group, and a backstory. They can choose "Surprise me", give the GM an idea (a hobby, a quirk), or write their own. Kids and teens who want to be the victim (and come back as the Ghost) tick the box.
7. **Optional photo (adults by default):** an adult can add a photo so the AI can draw a cartoon look-alike of their character into the story. **Photo likenesses for anyone under 18 are off by default.** The operator can turn them on (`ALLOW_MINOR_PHOTOS=true`) only with a real parent or guardian consent process for each child. Photos are never shown to other players, metadata is stripped on upload, and photos are meant to be deleted within 24 hours (or sooner with "Delete player photos" in the host console). Share the plain-language notice at `/privacy` with parents. Kids who skip the photo still get a cartoon character.
8. For toddlers or anyone without a phone, use **Add player** in the host console and hand the link to their grown-up.
9. When everyone is in, press **Cast the characters and start**. The AI picks the killer in secret.

## Starting the game (skill in a chat)

1. Paste `PORTABLE_PROMPT.md` (or enable the Claude skill) and say **"Host Mode"**, or say **"voice"** for a spoken game.
2. Answer the setup questions, or type `SAMPLE` for a ready-made cast.
3. Players collect their card at the GM Station: say "Card for Name, code YourCode" while everyone else looks away.

## The run sheet

| Clock | What happens |
|---|---|
| 0:00 | Cast reveal, house rules, group toast, everyone gets a card |
| 0:10 | Act I: the party. Every guest makes a grand entrance |
| 0:25 | The death. The victim dramatically expires and becomes the Ghost Narrator |
| 0:30 | Act II: interrogation and Clue Round 1. Drinking rules and silly challenges start |
| 0:55 | Intermission: snacks, water, bathroom break |
| 1:05 | Act III: the twist and Clue Round 2 |
| 1:25 | Act IV: House showdowns, then secret accusations (who, how, why) |
| 1:40 | Act V: the reveal, scores, awards, final toast |

Running late? Trim a dare. Never trim the reveal. Or use the override (below).

## House rules (read these aloud at the start)

1. **Anyone can say "Pass"** at any time, no explanation needed.
2. **Alcohol is optional.** Every drink rule has a sip-or-substitute version: a water sip, a mocktail, or a 10-second silly act. Sips only, no shots.
3. **Kids and toddlers** play "Snack or Silly" instead of drinking.
4. **Everything is fiction.** Secrets are invented. Nobody gets roasted for real.
5. **Water round** every few drinks. Plan a designated driver.

## For players

- You get one **secret card** on your phone: your character, your secret, your alibi, what you know, and a special move. Memorize it, then keep it private.
- **Innocent characters** may hide their embarrassing secret but must not lie about the crime. **Only the killer may lie about the crime.**
- Question each other in character. Compare alibis and the clues on the big screen.
- In Act IV, submit a secret accusation on your phone: who did it, how, and why.
- Scoring: killer 3, method 1, motive 1. The killer scores 5 for escaping if fewer than half the votes are right.

## For kids and toddlers

- **Toddlers (1-5)** are Mascots. A grown-up reads their clue and the room cheers.
- **Little kids (6-9)** get simple jobs: Witness, Timekeeper, or the Ghost.
- **Older kids and teens (10-15)** can be Informants, Junior Detectives, or the Victim.
- Every kid gets at least one award.

## Host controls

| Control | What it does |
|---|---|
| Next | Move to the next phase |
| Pause / Resume | Freeze the game for naps and refills |
| Add player | Add someone without a phone |
| Remove | Drop a guest in the lobby |

## The Host Override Code

Type it privately into the Host Override box. It is the only way to see spoilers.

| Option | Result |
|---|---|
| Nudge | A vague pointer |
| Advanced clue | A strong clue that points at the killer's House but does not name them |
| Accelerate | Skip to the next phase and release its clues |
| Final answer (private) | Shows the killer, method, motive, and story to you only, after you confirm |
| Jump to Reveal | Stages the full reveal for everyone |

Using any override means you cannot win Detective of the Night (silly prizes still count). Three wrong guesses lock overrides for 10 minutes.

## Voice mode (skill)

Say "voice" at the start. The AI runs a spoken roll call, announces the cast with a drum roll, and narrates each act. Everyone starts with "GM, this is Name" because the AI cannot tell voices apart. Private cards go through earbuds or on-screen text, never over the speaker. Type or whisper the override code.

## Troubleshooting

| Problem | Fix |
|---|---|
| A guest cannot join | Check the room code and that the game has not started. Joining closes when the host presses start |
| A guest closed their tab | They reopen the site and the same room link. Their card is remembered on that device |
| Someone is uncomfortable | Use Pass, swap their card, or turn off drinking and dares for everyone |
| Toddler meltdown | Press Pause |
| The AI chat drifted (skill mode) | Say `RECAP`, and keep the whole game in one continuous chat |
| Running over time | Use Accelerate or Jump to Reveal |

## AI pictures and video

- The big screen shows a new story scene for each act, with the players' cartoon characters in it. Players also see scenes on their phones.
- Portraits appear next to each character in the cast list and on each player's card.
- The host console shows spend against your budget. Use it to raise or lower the number of scenes per act, add or remove video clips, switch quality, or pause AI media.
- If the budget runs out, remaining pictures are skipped and the game carries on in text.

## AI guests (bots)

- In the lobby, the host can add **AI guests** (1 to 8). They count toward the 4-player minimum, are cast as grown-up characters, and may even be the killer. They never see other players' secrets.
- During the game players open **Talk to the guests** on their phones to ask an AI guest where they were, what they saw, or what they are hiding. Grown-ups can tap **Speak** to talk instead of type; children type.
- AI guests also chime in at story beats (the party, the death, the twist, the accusations), shown on the big screen. Tap **Enable voices** on the TV or a phone to hear them.
- Voices: free browser voices by default. With `CLOUD_PROVIDER=aws` they use Amazon Polly, with `azure` Azure AI Speech. The host console shows which is active.
- At the reveal the AI guests cast their own accusations, using only the public clues. They appear on the scoreboard but never win the human awards.
- The host can mute chatter or cloud voices at any time from the AI guests card. Spending counts against your AI budget, and when it runs out the guests fall back to scripted replies and free browser voices.

## Save and share a story

After a game (or any time after the cards are dealt) the host console has **Save and share this story**.

- **Storyline only:** keeps the plot, clues and twist. When someone replays it, players are cast at random.
- **Storyline and characters:** also lets the next group **choose which character to be** when they join. Characters nobody picks are left out, and picks that do not fit (a grown-up asking for a young character) are ignored.
- **Recap (after the reveal):** optionally share how your night went. Readers see it behind a spoiler warning. You can use players' real names and include the game's pictures for link-only stories. **Public stories never include real names or pictures of players.**
- **Link only or Public gallery:** link-only stories are only for people you send the link to. Public ones appear in the gallery at `/stories`, where anyone signed in as a host can vote, and players of a replayed story can vote from their own phone after the reveal.
- The solution is **sealed** on the server. Nobody who replays a story, including the host who starts it, can read the answer in the app. Your own copy follows the same rule.
- To play someone else's story, open its page, press **Host a game with this story**, and carry on as usual. Theme prompts are ignored because the story is already written.
- Votes: one per account, and one per player of a replayed game. Three reports hide a story from the gallery. Owners can delete their stories from the story page.

## Local AI services (no cloud needed)

For testing or private play you can run the AI on your own computer: `make local-ai-up`, set `LOCAL_AI_MCP_URL` in `web/.env.local`, and choose **Local services on my own computer** in step 3 of the setup wizard. Then:

- AI guests talk and speak using local voices. Grown-ups can tap **Speak**: the recording goes only to your computer, not to a browser vendor.
- An uploaded photo is redrawn by the local diffusion model into the character, using a prompt written for that character and the story. Clips are short slideshow videos with the scene narration.
- Nothing is charged to the budget. Local models can be slow on a laptop, so pictures arrive when they are ready and the game never waits for them.
- Details and hardware notes: `services/local-ai/README.md`.
