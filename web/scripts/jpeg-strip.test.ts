// Run: npx tsx scripts/jpeg-strip.test.ts
import assert from "node:assert/strict";
import { stripJpegMetadata } from "../src/lib/jpeg-strip";

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const exif = Array.from(Buffer.from("Exif\0\0GPS-LAT-12.34"));
const jfif = seg(0xe0, Array.from(Buffer.from("JFIF\0")));
const sof = seg(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]);
const sos = seg(0xda, [1, 1, 0, 0, 0x3f, 0]);
const scan = [0x12, 0x34, 0xff, 0x00, 0x56]; // 0xff00 is a stuffed byte, not a marker
const jpeg = (...parts: number[][]) => Uint8Array.from([0xff, 0xd8, ...parts.flat(), 0xff, 0xd9]);

const withMeta = jpeg(jfif, seg(0xe1, exif), seg(0xfe, [65, 66]), sof, sos, scan);
const out = stripJpegMetadata(withMeta)!;
assert.ok(out, "valid jpeg is accepted");
const text = Buffer.from(out).toString("latin1");
assert.ok(!text.includes("GPS-LAT"), "EXIF/GPS removed");
assert.ok(text.includes("JFIF"), "JFIF kept");
assert.ok(out.length < withMeta.length, "smaller after stripping");
assert.deepEqual(Array.from(out.slice(-2)), [0xff, 0xd9], "ends with EOI");
assert.ok(Buffer.from(out).includes(Buffer.from(scan)), "image data intact");

const trailing = Uint8Array.from([...withMeta, ...Buffer.from("<script>alert(1)</script>")]);
assert.ok(!Buffer.from(stripJpegMetadata(trailing)!).toString("latin1").includes("script"), "appended payload dropped");

assert.equal(stripJpegMetadata(Uint8Array.from([1, 2, 3, 4, 5])), null, "non-jpeg rejected");
assert.equal(stripJpegMetadata(withMeta.slice(0, 20)), null, "truncated jpeg rejected");
console.log("OK: jpeg metadata stripping");
