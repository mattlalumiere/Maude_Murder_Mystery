import { describe, expect, it } from "vitest";
import { safeEqual } from "@/lib/security/safe-compare";

describe("safeEqual", () => {
  it("accepts identical strings", () => expect(safeEqual("abc123", "abc123")).toBe(true));
  it("rejects different strings of the same length", () => expect(safeEqual("abc123", "abc124")).toBe(false));
  it("rejects different lengths without throwing", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
  });
  it("rejects null and undefined on either side, even both", () => {
    expect(safeEqual(null, "a")).toBe(false);
    expect(safeEqual("a", undefined)).toBe(false);
    expect(safeEqual(null, null)).toBe(false);
    expect(safeEqual(undefined, undefined)).toBe(false);
  });
  it("rejects the empty string against empty (empty tokens never authenticate)", () => {
    expect(safeEqual("", "")).toBe(false);
  });
  it("handles unicode", () => {
    expect(safeEqual("café", "café")).toBe(true);
    expect(safeEqual("café", "café")).toBe(false);
  });
});
