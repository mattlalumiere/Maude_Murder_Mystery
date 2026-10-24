import { describe, expect, it } from "vitest";
import { AiBadOutputError } from "@/lib/ai/ports";
import { extractJson } from "@/lib/ai/json";

describe("extractJson", () => {
  it("parses plain JSON", () => expect(extractJson("{\"a\":1}")).toEqual({ a: 1 }));
  it("parses code fenced JSON", () => expect(extractJson("```json\n{\"a\":[1,2]}\n```")).toEqual({ a: [1, 2] }));
  it("ignores leading prose and trailing text after the object", () => {
    expect(extractJson("Sure! Here you go:\n{\"a\":{\"b\":\"x}\"}}\nHope that helps {not json}")).toEqual({ a: { b: "x}" } });
  });
  it("handles braces and escaped quotes inside strings", () => {
    expect(extractJson("{\"s\":\"a \\\" } { b\"}")).toEqual({ s: "a \" } { b" });
  });
  it("strips think blocks", () => expect(extractJson("<think>{\"no\":1}</think>{\"yes\":2}")).toEqual({ yes: 2 }));
  it("throws BadOutput with truncated=true for cut off JSON", () => {
    const e = (() => { try { extractJson("{\"a\":[1,2,{\"b\":"); } catch (x) { return x; } })() as AiBadOutputError;
    expect(e).toBeInstanceOf(AiBadOutputError);
    expect(e.truncated).toBe(true);
  });
  it("throws BadOutput for text with no JSON", () => {
    expect(() => extractJson("I cannot help with that.")).toThrow(AiBadOutputError);
  });
  it("rejects a top level array or scalar", () => {
    expect(() => extractJson("[1,2,3]")).toThrow(AiBadOutputError);
  });
});
