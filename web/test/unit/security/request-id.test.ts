import { describe, expect, it } from "vitest";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/security/request-id";

describe("resolveRequestId", () => {
  it("keeps a well-formed incoming id", () => {
    expect(resolveRequestId("abc-123_DEF456", () => "gen")).toBe("abc-123_DEF456");
  });
  it("generates when missing", () => expect(resolveRequestId(null, () => "gen-0001-xxxx")).toBe("gen-0001-xxxx"));
  it("rejects log-injection and oversize ids", () => {
    expect(resolveRequestId("a\nb-injected-line", () => "gen-0001-xxxx")).toBe("gen-0001-xxxx");
    expect(resolveRequestId("x".repeat(65), () => "gen-0001-xxxx")).toBe("gen-0001-xxxx");
    expect(resolveRequestId("short", () => "gen-0001-xxxx")).toBe("gen-0001-xxxx");
    expect(resolveRequestId("a b c d e f g h", () => "gen-0001-xxxx")).toBe("gen-0001-xxxx");
  });
  it("uses a lowercase header name", () => expect(REQUEST_ID_HEADER).toBe("x-request-id"));
});
