/**
 * Removes metadata (EXIF/GPS in APP1, XMP, IPTC in APP13, comments) from a JPEG without re-encoding.
 * Keeps JFIF (APP0), the ICC profile (APP2), and all image data. Returns null if the bytes are not a well-formed JPEG.
 * Anything after the end-of-image marker is dropped, which also removes appended payloads.
 */
export function stripJpegMetadata(input: Uint8Array): Uint8Array | null {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null;
  const out: number[] = [0xff, 0xd8];
  const keep: Uint8Array[] = [];
  let i = 2;
  while (i < input.length) {
    if (input[i] !== 0xff) return null;
    while (input[i] === 0xff) i++; // fill bytes
    const marker = input[i++];
    if (marker === undefined) return null;
    if (marker === 0xd9) { // EOI
      keep.push(Uint8Array.of(0xff, 0xd9));
      return concat(out, keep);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { keep.push(Uint8Array.of(0xff, marker)); continue; }
    if (i + 2 > input.length) return null;
    const len = (input[i] << 8) | input[i + 1];
    if (len < 2 || i + len > input.length) return null;
    const seg = input.subarray(i - 2, i + len); // marker bytes + length + payload
    if (marker === 0xda) { // SOS: entropy-coded data runs to EOI
      keep.push(seg);
      let j = i + len;
      for (; j < input.length - 1; j++) {
        if (input[j] === 0xff && input[j + 1] === 0xd9) break;
      }
      if (j >= input.length - 1) return null;
      keep.push(input.subarray(i + len, j));
      keep.push(Uint8Array.of(0xff, 0xd9));
      return concat(out, keep);
    }
    const drop = (marker >= 0xe1 && marker <= 0xef && marker !== 0xe2) || marker === 0xfe;
    if (!drop) keep.push(seg);
    i += len;
  }
  return null;
}

function concat(head: number[], parts: Uint8Array[]): Uint8Array {
  const size = head.length + parts.reduce((a, p) => a + p.length, 0);
  const res = new Uint8Array(size);
  res.set(head, 0);
  let o = head.length;
  for (const p of parts) { res.set(p, o); o += p.length; }
  return res;
}
