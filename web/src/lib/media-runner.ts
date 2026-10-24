import { localVideo } from "./ai/local";
import { usesLocal } from "./ai/mode";
import { imageModelFor, speechFor, textModelFor } from "./ai/route";
import { directPrompt } from "./prompt-director";
import { loadPhoto, pollVideo, startVideo } from "./media-gen";
import { getMediaStore } from "./media-store";
import { photosCanBePurged, purgePhotos } from "./engine";
import { getStore, mutate } from "./store";
import type { MediaItem, Room } from "./types";

const LOCK_MS = 120_000;
const POLL_EVERY_MS = 8_000;

const ext = (mime: string) => (mime === "image/png" ? "png" : mime === "image/svg+xml" ? "svg" : mime === "video/mp4" ? "mp4" : "bin");

/** Claims the next job, enforcing the hard budget cap. Runs inside mutate(). */
export function claim(room: Room): MediaItem | null {
  const now = Date.now();
  const b = room.budget;
  if (b.plan.paused) return null;
  for (const m of room.media) {
    if (m.status === "running" && (m.lockUntil ?? 0) < now) {
      b.reservedUsd = Math.max(0, b.reservedUsd - m.estCostUsd);
      m.status = m.jobRef ? "polling" : "queued";
      if (m.jobRef) b.reservedUsd += m.estCostUsd;
    }
  }
  const polling = room.media.find((m) => m.status === "polling" && (m.lockUntil ?? 0) < now);
  if (polling) { polling.lockUntil = now + LOCK_MS; return structuredClone(polling); }
  for (const m of room.media) {
    if (m.status !== "queued") continue;
    if (b.spentUsd + b.reservedUsd + m.estCostUsd > b.capUsd + 1e-9) {
      m.status = "skipped"; m.note = "Skipped: would exceed the budget";
      continue;
    }
    m.status = "running"; m.lockUntil = now + LOCK_MS; b.reservedUsd += m.estCostUsd;
    return structuredClone(m);
  }
  return null;
}

export async function runNext(code: string): Promise<{ ran: boolean; item?: Pick<MediaItem, "id" | "kind" | "status" | "note"> }> {
  const { result: job } = await mutate(code, claim);
  if (!job) return { ran: false };

  type Outcome = { kind: "done"; bytes: Buffer; mime: string; prompt?: string } | { kind: "polling"; jobRef: string } | { kind: "failed"; note: string };
  let out: Outcome;
  try {
    const room = (await getStore().get(code))!;
    const refs: Buffer[] = [];
    for (const pid of job.playerIds) {
      const p = room.players.find((x) => x.id === pid);
      if (p && p.profile.consent !== "none") { const b = await loadPhoto(p.profile.photoKey); if (b) refs.push(b); }
    }
    if (job.kind === "video") {
      if (job.jobRef) {
        const r = await pollVideo(job.jobRef, job.id);
        out = r.status === "done" ? { kind: "done", bytes: r.done!.bytes, mime: r.done!.mime }
          : r.status === "failed" ? { kind: "failed", note: r.note ?? "video failed" } : { kind: "polling", jobRef: job.jobRef };
      } else if (usesLocal(room)) {
        const v = await makeLocalVideo(room, job, refs);
        out = { kind: "done", bytes: v.bytes, mime: v.mime, prompt: v.prompt };
      } else {
        const v = await startVideo(job.prompt, null, job.caption, job.id);
        out = v.done ? { kind: "done", bytes: v.done.bytes, mime: v.done.mime } : { kind: "polling", jobRef: v.jobRef };
      }
    } else {
      // Local services: a prompt director writes a prompt that fits this character and the story, and the photo goes in as the reference.
      const directed = usesLocal(room) ? await directPrompt(room, job, textModelFor(room)) : null;
      const g = await imageModelFor(room).generate({
        prompt: directed?.prompt ?? job.prompt, caption: job.caption, refs, quality: room.budget.plan.quality,
        shape: job.kind === "avatar" ? "square" : "wide", negative: directed?.negative, strength: directed?.strength,
      });
      out = { kind: "done", bytes: g.bytes, mime: g.mime, prompt: directed?.prompt };
    }
  } catch (e) {
    out = { kind: "failed", note: `Generation failed: ${(e as Error).message}`.slice(0, 200) };
  }

  let key: string | undefined;
  if (out.kind === "done") {
    key = `${code}/gen/${job.id}.${ext(out.mime)}`;
    await getMediaStore().put(key, out.bytes, out.mime);
  }

  const { result, room: after } = await mutate(code, (room) => {
    const m = room.media.find((x) => x.id === job.id)!;
    const b = room.budget;
    if (out.kind === "done") {
      m.status = "done"; m.key = key; m.mime = out.mime; m.lockUntil = undefined;
      if (out.prompt) m.prompt = out.prompt;
      b.reservedUsd = Math.max(0, b.reservedUsd - m.estCostUsd); b.spentUsd += m.estCostUsd;
      if (m.kind === "avatar") { const p = room.players.find((x) => x.id === m.playerIds[0]); if (p) p.profile.avatarId = m.id; }
    } else if (out.kind === "polling") {
      m.status = "polling"; m.jobRef = out.jobRef; m.lockUntil = Date.now() + POLL_EVERY_MS;
    } else {
      m.status = "failed"; m.note = out.note; m.lockUntil = undefined;
      b.reservedUsd = Math.max(0, b.reservedUsd - m.estCostUsd);
    }
    return { id: m.id, kind: m.kind, status: m.status, note: m.note };
  });
  // Retention: after the reveal, delete player photos as soon as no job needs them as references.
  if (photosCanBePurged(after)) await mutate(code, async (r) => { if (photosCanBePurged(r)) await purgePhotos(r); });
  return { ran: true, item: result };
}

/** A short clip from a few keyframes of the scene, a slow zoom between them, and the narration read aloud when a voice is available. */
async function makeLocalVideo(room: Room, job: MediaItem, refs: Buffer[]): Promise<{ bytes: Buffer; mime: string; prompt: string }> {
  const n = Math.max(1, Math.min(6, Number(process.env.LOCAL_VIDEO_FRAMES) || 3));
  const base = await directPrompt(room, job, textModelFor(room));
  const shots = ["wide establishing shot of the whole room", "closer on the characters reacting", "the dramatic moment, expressive faces", "a quiet beat, one detail in focus", "an over-the-shoulder view", "a last wide shot"];
  const image = imageModelFor(room);
  const frames: Buffer[] = [];
  for (let i = 0; i < n; i++) {
    const g = await image.generate({ prompt: `${base.prompt} ${shots[i]}.`.slice(0, 1400), caption: job.caption, refs, quality: "standard", shape: "wide", negative: base.negative, strength: base.strength });
    frames.push(g.bytes);
  }
  let narration: Buffer | undefined;
  const speech = speechFor(room);
  const line = room.case?.narration[job.phase];
  if (speech.kind === "server" && line) {
    try { narration = (await speech.synthesize(line.slice(0, 300), speech.voices[0])).bytes; } catch { /* silent clip */ }
  }
  const v = await localVideo(frames, 6, narration);
  return { ...v, prompt: base.prompt };
}
