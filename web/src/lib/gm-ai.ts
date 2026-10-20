import { SAMPLE_CASE } from "./sample-case";
import type { CaseFile } from "./types";

export interface Roster {
  adults: number;
  kids: number;
  littles: number;
  names: string[];
}

const SCHEMA = `{
  "title": string, "setting": string,
  "killerId": string, "victimId": string,
  "characters": [{ "id": string, "name": string, "house": string, "kid": boolean,
     "role": "suspect"|"witness"|"victim"|"mascot"|"informant", "tease": string,
     "card": { "story": string, "secret": string, "alibi": string, "knows": string[], "goal": string, "special": string } }],
  "truth": { "methodId": string, "motiveId": string, "story": string },
  "methods": [{ "id": string, "text": string }]  (4 options, one correct),
  "motives": [{ "id": string, "text": string }]  (4 options, one correct),
  "clues": [{ "id": string, "round": 1|2, "text": string }]  (6 per round, true facts only),
  "twist": string,
  "narration": { "lobby"|"cards"|"act1"|"death"|"act2"|"intermission"|"act3"|"act4"|"reveal": string },
  "nudges": { "act2"|"act3"|"act4": string }, "advanced": { "act2"|"act3"|"act4": string },
  "awards": string[]
}`;

function valid(c: unknown, roster: Roster): c is CaseFile {
  const k = c as CaseFile;
  if (!k || !Array.isArray(k.characters) || !Array.isArray(k.clues)) return false;
  const ids = new Set(k.characters.map((x) => x.id));
  const total = roster.adults + roster.kids;
  return (
    ids.has(k.killerId) && ids.has(k.victimId) && k.killerId !== k.victimId &&
    k.characters.length >= Math.min(total, 6) &&
    k.characters.every((x) => x.card && typeof x.card.secret === "string") &&
    k.methods?.some((m) => m.id === k.truth?.methodId) &&
    k.motives?.some((m) => m.id === k.truth?.motiveId) &&
    k.clues.length >= 8 && !!k.truth?.story && !!k.twist &&
    !k.characters.find((x) => x.id === k.killerId)?.kid
  );
}

/** Builds the case. Uses Bedrock when BEDROCK_MODEL_ID is set; otherwise (or on any failure) the bundled sample case. */
export async function generateCase(roster: Roster, theme?: string): Promise<CaseFile> {
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) return structuredClone(SAMPLE_CASE);
  try {
    const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
    const system = `You are the Game Master of a funny family murder-mystery party game for ${roster.adults} adults (ages 20-70) and ${roster.kids} children (ages 1-15, ${roster.littles} are toddlers who play as Mascots).
Rules: all fiction, never based on real people's lives; cartoonish non-graphic "murder"; adult cards may have PG-13 innuendo but kid cards are G-rated; the victim is a fun role (a kid may play it and become a Ghost Narrator); the killer is an adult; exactly one killer; at least 3 independent clue paths point to the killer; every innocent has an embarrassing-but-harmless secret that explains their suspicious behavior; only the killer lies about the crime; every clue is a true fact; cards must be short and readable aloud. Create exactly ${roster.adults + roster.kids} playable characters (the victim counts as one). Return ONLY JSON matching:\n${SCHEMA}`;
    const out = await client.send(new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: `Theme: ${theme ?? "a surprise comic theme"}. Player first names for flavor only (do not use them as character names): ${roster.names.join(", ")}.` }] }],
      inferenceConfig: { maxTokens: 12000, temperature: 0.9 },
    }));
    const text = out.output?.message?.content?.map((b) => ("text" in b ? b.text : "")).join("") ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (valid(json, roster)) return json;
    console.warn("Bedrock case failed validation; using sample case");
  } catch (e) {
    console.warn("Bedrock case generation failed; using sample case", e);
  }
  return structuredClone(SAMPLE_CASE);
}
