import { generateImage, loadPhoto, pollVideo, startVideo } from "./media-gen";
import { getMediaStore } from "./media-store";
import { getStore, mutate } from "./store";
import type { MediaItem, Room } from "./types";

const LOCK_MS = 120_000;
const POLL_EVERY_MS = 8_000;

const ext = (mime: string) => (mime === "image/png" ? "png" : mime === "image/svg+xml" ? "svg" : mime === "video/mp4" ? "mp4" : "bin");

/** Claims the next job, enforcing the hard budget cap. Runs inside mutate(). */
function claim(room: Room): MediaItem | null {
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

  type Outcome = { kind: "done"; bytes: Buffer; mime: string } | { kind: "polling"; jobRef: string } | { kind: "failed"; note: string };
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
      } else {
        const v = await startVideo(job.prompt, null, job.caption, job.id);
        out = v.done ? { kind: "done", bytes: v.done.bytes, mime: v.done.mime } : { kind: "polling", jobRef: v.jobRef };
      }
    } else {
      const g = await generateImage({
        prompt: job.prompt, caption: job.caption, refs, quality: room.budget.plan.quality,
        shape: job.kind === "avatar" ? "square" : "wide",
      });
      out = { kind: "done", bytes: g.bytes, mime: g.mime };
    }
  } catch (e) {
    out = { kind: "failed", note: `Generation failed: ${(e as Error).message}`.slice(0, 200) };
  }

  let key: string | undefined;
  if (out.kind === "done") {
    key = `${code}/gen/${job.id}.${ext(out.mime)}`;
    await getMediaStore().put(key, out.bytes, out.mime);
  }

  const { result } = await mutate(code, (room) => {
    const m = room.media.find((x) => x.id === job.id)!;
    const b = room.budget;
    if (out.kind === "done") {
      m.status = "done"; m.key = key; m.mime = out.mime; m.lockUntil = undefined;
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
  return { ran: true, item: result };
}
