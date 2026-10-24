// Local AI services through MCP. Run: npx tsx scripts/local-ai.test.ts
// Starts services/local-ai in mock mode if nothing answers on LOCAL_AI_MCP_URL, and stops it again afterwards.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
process.env.LOCAL_AI_MCP_URL ??= "http://127.0.0.1:8765/mcp";
process.env.STORY_FILE_DIR ??= join(process.cwd(), ".data", "stories-test");

import { closeLocalAi, localHealth } from "../src/lib/ai/mcp-client";
import { localTranscribe, localSpeech, loadLocalVoices } from "../src/lib/ai/local";
import { usesLocal } from "../src/lib/ai/mode";
import { addBots, addPlayer, advance, createRoom, startGame } from "../src/lib/engine";
import { runBotChat } from "../src/lib/bots";
import { runNext } from "../src/lib/media-runner";
import { runLifeTick } from "../src/lib/life";
import { getMediaStore } from "../src/lib/media-store";
import { directPrompt, templatePrompt } from "../src/lib/prompt-director";
import { getStore, mutate } from "../src/lib/store";
import type { TextModel } from "../src/lib/ai/ports";
import type { Room } from "../src/lib/types";

const FACE_JPEG_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDsaKKK8I+lCirFpZz3e/7PHv24zyBjP1qx/Y99/wA8P/H1/wAadiXJLdmfRWh/Y99/zw/8fX/Gq93Zz2m37RHs3ZxyDnH0osCknsyvRRRSKCiiigDoPCn/AC9f8A/rW/WB4U/5ev8AgH9a360WxyVPiYVgeK/+XX/gf9K36wPFf/Lr/wAD/pQ9gp/Ejn6KKKzOsKKKKAOg8Kf8vX/AP61v1geFP+Xr/gH9a360WxyVPiYVgeK/+XX/AIH/AErfrA8V/wDLr/wP+lD2Cn8SOfooorM6wooooAsWl5Pab/s8mzdjPAOcfWrH9sX3/Pf/AMcX/Cs+inclxT3Rof2xff8APf8A8cX/AAqvd3k93t+0Sb9uccAYz9Kr0UXBRS2QUUUUij//2Q==";
const dev = join(process.cwd(), "..", "services", "local-ai", "dev.sh");
const load = async (code: string) => (await getStore().get(code))!;

/** Reads the text chunks the mock diffusion service writes into its PNGs. */
function pngText(b: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 8;
  while (i < b.length) {
    const len = b.readUInt32BE(i), type = b.toString("latin1", i + 4, i + 8);
    if (type === "tEXt") { const body = b.subarray(i + 8, i + 8 + len); const z = body.indexOf(0); out[body.toString("latin1", 0, z)] = body.toString("utf8", z + 1); }
    i += 12 + len;
  }
  return out;
}

async function main() {
  let started = false;
  if (!(await localHealth()).reachable) { execFileSync(dev, ["start"], { stdio: "inherit" }); started = true; }
  try {
    const h = await localHealth();
    assert.ok(h.configured && h.reachable && h.ok, "local services are healthy");
    assert.deepEqual(Object.keys(h.backends!).sort(), ["image", "stt", "tts", "video"]);
    assert.ok((await loadLocalVoices()).length >= 4, "voices listed over MCP");

    // ---- a game that chose local services: photo in, directed prompt, diffusion out
    const r = await createRoom("hostL", "secretcode", { name: "Local Night", aiMode: "local" }, 0, { avatars: true, scenesPerAct: 1, videoClips: 1, quality: "standard" });
    assert.equal(r.config.aiMode, "local");
    assert.ok(usesLocal(r));
    await mutate(r.code, (room) => {
      addPlayer(room, "Hana", "adult", false, true);
      addPlayer(room, "Ben", "adult", false, true);
      addPlayer(room, "Zoe", "kid", false, true);
      addBots(room, 1);
    });
    await getMediaStore().put(`${r.code}/photos/hana.jpg`, Buffer.from(FACE_JPEG_B64, "base64"), "image/jpeg");
    await mutate(r.code, (room) => { const p = room.players.find((x) => x.name === "Hana")!; p.profile.photoKey = `${r.code}/photos/hana.jpg`; p.profile.consent = "self"; });
    await mutate(r.code, (room) => startGame(room));
    let room = await load(r.code);
    assert.equal(room.caseSource, "sample", "mock chat cannot write a case, so the built-in story is used");

    for (let i = 0; i < 20 && (await load(r.code)).life?.queue.length; i++) await runLifeTick(r.code);
    for (let i = 0; i < 20; i++) if (!(await runNext(r.code)).ran) break;
    room = await load(r.code);
    const hana = room.players.find((p) => p.name === "Hana")!;
    const ch = room.case!.characters.find((c) => c.id === hana.characterId)!;
    const avatar = room.media.find((m) => m.kind === "avatar" && m.playerIds[0] === hana.id)!;
    assert.equal(avatar.status, "done", avatar.note);
    assert.equal(avatar.mime, "image/png", "real diffusion path, not the SVG placeholder");
    const meta = pngText((await getMediaStore().get(avatar.key!))!.bytes);
    assert.equal(meta.had_reference, "1", "the uploaded photo reached the diffusion model");
    assert.equal(meta.strength, "0.6");
    assert.ok(!meta.prompt.includes(ch.name), "no player names reach the image model");
    assert.ok(ch.title && meta.prompt.includes(ch.title), "prompt is written for this character's occupation");
    assert.ok(meta.prompt.toLowerCase().includes(room.case!.setting.split(" ")[0].toLowerCase()) || meta.prompt.includes("Pennywhistle"), "prompt carries the story setting");
    assert.ok(meta.prompt.includes("reference photo"), "prompt asks to keep the person recognisable");
    assert.ok(meta.negative_prompt.includes("gore"));
    // secrecy: nothing private about the character or the solution is in the prompt
    for (const secret of [ch.card.secret, ch.card.alibi, ...ch.card.knows, room.case!.truth.story]) assert.ok(!meta.prompt.includes(secret), "no private text in the prompt");
    assert.ok(!meta.prompt.includes("YOU DID IT"));
    assert.equal(avatar.prompt, meta.prompt, "the directed prompt is recorded on the job");

    const ben = room.players.find((p) => p.name === "Ben")!;
    const benAvatar = room.media.find((m) => m.kind === "avatar" && m.playerIds[0] === ben.id)!;
    assert.equal(pngText((await getMediaStore().get(benAvatar.key!))!.bytes).had_reference, "0", "no photo, no reference");

    // scenes and a video clip: advance to the death (first video moment)
    for (let i = 0; i < 3; i++) await mutate(r.code, (x) => advance(x));
    for (let i = 0; i < 30; i++) if (!(await runNext(r.code)).ran) break;
    room = await load(r.code);
    const scene = room.media.find((m) => m.kind === "scene" && m.status === "done")!;
    assert.equal(scene.mime, "image/png");
    const video = room.media.find((m) => m.kind === "video")!;
    assert.equal(video.status, "done", video.note);
    assert.equal(video.mime, "video/mp4");
    const mp4 = (await getMediaStore().get(video.key!))!.bytes;
    assert.equal(mp4.subarray(4, 8).toString(), "ftyp", "a real MP4 file");
    assert.equal(room.budget.spentUsd, 0, "local services cost nothing per picture");
    assert.equal(room.budget.reservedUsd, 0);

    // ---- bots: chat through MCP, voice through local TTS, nothing charged
    const asker = room.players.find((p) => p.name === "Hana")!;
    const bot = room.players.find((p) => p.isBot)!;
    const line = await runBotChat(r.code, bot.id, asker, "Where were you tonight?");
    assert.ok(line.text.length > 5, "local chat produced a reply");
    assert.ok(line.audioKey && line.audioMime === "audio/wav", "local voice produced audio");
    assert.equal(((await getMediaStore().get(line.audioKey!))!.bytes.subarray(0, 4)).toString(), "RIFF");
    assert.equal((await load(r.code)).budget.spentUsd, 0);

    // ---- local speech-to-text
    const wav = (await localSpeech.synthesize("hello there", (await loadLocalVoices())[0])).bytes;
    assert.ok((await localTranscribe(wav, "audio/wav")).length > 3, "transcript returned");

    // ---- auto and cloud modes leave the local services alone
    const auto = await createRoom("hostA", "secretcode", { aiMode: "auto" }, 20, { avatars: true, scenesPerAct: 0, videoClips: 0, quality: "standard" });
    assert.equal(usesLocal(auto), false);
    await mutate(auto.code, (x) => { addPlayer(x, "A", "adult", false, true); addPlayer(x, "B", "adult", false, true); addPlayer(x, "C", "adult", false, true); addPlayer(x, "D", "kid", false, true); });
    await mutate(auto.code, (x) => startGame(x));
    for (let i = 0; i < 10; i++) if (!(await runNext(auto.code)).ran) break;
    const autoRoom = await load(auto.code);
    assert.equal(autoRoom.media.find((m) => m.kind === "avatar")!.mime, "image/svg+xml", "auto mode keeps the built-in placeholder pictures");

    // ---- the prompt director: a good model line is used, junk falls back to the template
    const good: TextModel = { id: "g", generate: async () => ({ text: "Cartoon portrait of a cheerful gardener in a green apron, tan gloves with orange smears, soft golden light, storybook style", usage: { inputTokens: 1, outputTokens: 1 }, model: "g", finishReason: "stop", latencyMs: 1 }) };
    const junk: TextModel = { id: "j", generate: async () => ({ text: '{"prompt": "x"}', usage: { inputTokens: 1, outputTokens: 1 }, model: "j", finishReason: "stop", latencyMs: 1 }) };
    const job = { kind: "avatar" as const, phase: "cards" as const, playerIds: [hana.id], caption: ch.name };
    assert.equal((await directPrompt(room as Room, job, good)).source, "model");
    assert.equal((await directPrompt(room as Room, job, junk)).source, "template");
    assert.equal((await directPrompt(room as Room, job, null)).prompt, templatePrompt(room as Room, job).prompt);
    console.log("OK: local AI via MCP (photo to diffusion with directed prompt, scenes, video, chat, voice, speech-to-text, modes, secrecy)");
  } finally {
    await closeLocalAi();
    if (started) execFileSync(dev, ["stop"], { stdio: "inherit" });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
