// Image, video, and photo-moderation providers. The mock provider needs no credentials,
// so the whole flow runs locally. Set MEDIA_PROVIDER=bedrock to use AWS (untested until deployed).
import { createHash } from "node:crypto";
import { getMediaStore } from "./media-store";

const useBedrock = () => process.env.MEDIA_PROVIDER === "bedrock";
export const IMAGE_MODEL = process.env.IMAGE_MODEL_ID ?? "amazon.nova-canvas-v1:0";
export const VIDEO_MODEL = process.env.VIDEO_MODEL_ID ?? "amazon.nova-reel-v1:1";

export interface ImageRequest {
  prompt: string;
  caption: string;
  /** Reference photos (JPEG) for character likeness. At most 5 are used. */
  refs: Buffer[];
  shape: "square" | "wide";
  quality: "standard" | "premium";
}
export interface Generated { bytes: Buffer; mime: string }

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);
function wrap(text: string, n: number, max: number) {
  const out: string[] = []; let line = "";
  for (const w of text.split(/\s+/)) {
    if ((line + " " + w).trim().length > n) { out.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out.slice(0, max);
}

function mockImage(r: ImageRequest, label = "AI IMAGE (MOCK)"): Generated {
  const h = parseInt(createHash("sha1").update(r.prompt).digest("hex").slice(0, 6), 16) % 360;
  const [w, ht] = r.shape === "square" ? [768, 768] : [1024, 576];
  const lines = wrap(r.caption, r.shape === "square" ? 22 : 40, 6);
  const text = lines.map((l, i) => `<text x="50%" y="${ht / 2 - (lines.length * 20) + i * 42}" text-anchor="middle" font-size="34" font-family="Georgia,serif" fill="#fff">${esc(l)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},55%,28%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},60%,12%)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="24" y="40" font-size="20" font-family="monospace" fill="#ffffffaa">${esc(label)}${r.refs.length ? ` · ${r.refs.length} photo ref` : ""}</text>${text}</svg>`;
  return { bytes: Buffer.from(svg), mime: "image/svg+xml" };
}

export async function generateImage(r: ImageRequest): Promise<Generated> {
  if (!useBedrock()) return mockImage(r);
  const { BedrockRuntimeClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  const [width, height] = r.shape === "square" ? [1024, 1024] : [1280, 720];
  const text = r.prompt.slice(0, 1000);
  const cfg = { numberOfImages: 1, quality: r.quality, width, height, cfgScale: 7 };
  const body = r.refs.length
    ? {
        taskType: "IMAGE_VARIATION",
        imageVariationParams: {
          text, negativeText: "text, watermark, gore, blood, nudity, scary, realistic violence",
          images: r.refs.slice(0, 5).map((b) => b.toString("base64")), similarityStrength: 0.65,
        },
        imageGenerationConfig: { numberOfImages: 1, quality: r.quality, cfgScale: 7 },
      }
    : {
        taskType: "TEXT_IMAGE",
        textToImageParams: { text, negativeText: "text, watermark, gore, blood, nudity, scary, realistic violence" },
        imageGenerationConfig: cfg,
      };
  const out = await client.send(new InvokeModelCommand({
    modelId: IMAGE_MODEL, contentType: "application/json", accept: "application/json", body: JSON.stringify(body),
  }));
  const json = JSON.parse(new TextDecoder().decode(out.body));
  if (json.error || !json.images?.[0]) throw new Error(json.error ?? "No image returned");
  return { bytes: Buffer.from(json.images[0], "base64"), mime: "image/png" };
}

// ---------- video (asynchronous) ----------
export interface VideoStart { jobRef: string; done?: Generated }

export async function startVideo(prompt: string, firstFrame: Buffer | null, caption: string, id: string): Promise<VideoStart> {
  if (!useBedrock()) {
    // Mock: instantly "finished" with a poster image labelled as a video.
    return { jobRef: `mock:${id}`, done: mockImage({ prompt, caption, refs: [], shape: "wide", quality: "standard" }, "VIDEO CLIP (MOCK)") };
  }
  const { BedrockRuntimeClient, StartAsyncInvokeCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  const bucket = process.env.MEDIA_BUCKET;
  if (!bucket) throw new Error("MEDIA_BUCKET is required for video");
  const modelInput: Record<string, unknown> = {
    taskType: "TEXT_VIDEO",
    textToVideoParams: {
      text: prompt.slice(0, 500),
      ...(firstFrame ? { images: [{ format: "jpeg", source: { bytes: firstFrame.toString("base64") } }] } : {}),
    },
    videoGenerationConfig: { durationSeconds: 6, fps: 24, dimension: "1280x720" },
  };
  const out = await client.send(new StartAsyncInvokeCommand({
    modelId: VIDEO_MODEL, modelInput: modelInput as never,
    outputDataConfig: { s3OutputDataConfig: { s3Uri: `s3://${bucket}/video-out/${id}` } },
  }));
  return { jobRef: out.invocationArn! };
}

export async function pollVideo(jobRef: string, id: string): Promise<{ status: "running" | "done" | "failed"; done?: Generated; note?: string }> {
  if (!useBedrock()) return { status: "failed", note: "mock video has no async job" };
  const { BedrockRuntimeClient, GetAsyncInvokeCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  const st = await client.send(new GetAsyncInvokeCommand({ invocationArn: jobRef }));
  if (st.status === "InProgress") return { status: "running" };
  if (st.status !== "Completed") return { status: "failed", note: st.failureMessage ?? "video failed" };
  const s3 = await import("@aws-sdk/client-s3");
  const c = new s3.S3Client({});
  const o = await c.send(new s3.GetObjectCommand({ Bucket: process.env.MEDIA_BUCKET!, Key: `video-out/${id}/${jobRef.split("/").pop()}/output.mp4` }));
  return { status: "done", done: { bytes: Buffer.from(await o.Body!.transformToByteArray()), mime: "video/mp4" } };
}

// ---------- photo safety ----------
export async function moderatePhoto(bytes: Buffer): Promise<{ ok: boolean; reason?: string }> {
  if (!useBedrock()) return { ok: true };
  const r = await import("@aws-sdk/client-rekognition");
  const client = new r.RekognitionClient({ region: process.env.AWS_REGION });
  const out = await client.send(new r.DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: 60 }));
  const bad = (out.ModerationLabels ?? []).map((l) => l.Name);
  return bad.length ? { ok: false, reason: `Photo flagged (${bad.slice(0, 2).join(", ")}). Please choose a different one.` } : { ok: true };
}

export async function loadPhoto(key?: string): Promise<Buffer | null> {
  if (!key) return null;
  return (await getMediaStore().get(key))?.bytes ?? null;
}
