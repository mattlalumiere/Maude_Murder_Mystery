import { describe, expect, it } from "vitest";
import {
  backoffDelay, ballotProgress, canJoin, connectionStatus, degradedNotice, friendlyError, groupByHouse,
  isValidCode, normalizeCode, parseCreds, phaseIndex, tilt, wizardProgress, validateWizardStep, formatUsd,
  nextPhaseTitle, plainText, credsKey,
} from "@/lib/client";

describe("room codes", () => {
  it("normalizes to upper case alphanumerics, max 6", () => {
    expect(normalizeCode(" ab-cd ")).toBe("ABCD");
    expect(normalizeCode("abcdefghi")).toBe("ABCDEF");
    expect(normalizeCode("")).toBe("");
  });
  it("validates 4 to 6 chars", () => {
    expect(isValidCode("ABC")).toBe(false);
    expect(isValidCode("ABCD")).toBe(true);
    expect(isValidCode("ABCDEF")).toBe(true);
    expect(isValidCode("ABCDEFG")).toBe(false);
    expect(isValidCode("AB D")).toBe(false);
  });
});

describe("connection status", () => {
  it("is live with no error", () => {
    expect(connectionStatus({ failures: 0, hasState: true })).toBe("live");
  });
  it("is reconnecting after failures while we still hold state", () => {
    expect(connectionStatus({ failures: 1, hasState: true })).toBe("reconnecting");
    expect(connectionStatus({ failures: 9, hasState: true })).toBe("reconnecting");
  });
  it("is loading before first state, failed with no state after repeated failures", () => {
    expect(connectionStatus({ failures: 0, hasState: false })).toBe("loading");
    expect(connectionStatus({ failures: 1, hasState: false })).toBe("loading");
    expect(connectionStatus({ failures: 3, hasState: false })).toBe("failed");
  });
});

describe("backoff", () => {
  it("stays at base when healthy and grows then caps", () => {
    expect(backoffDelay(0, 2000)).toBe(2000);
    expect(backoffDelay(1, 2000)).toBe(4000);
    expect(backoffDelay(2, 2000)).toBe(8000);
    expect(backoffDelay(20, 2000)).toBe(15000);
  });
});

describe("friendly errors", () => {
  it("maps known cases to kind wording", () => {
    expect(friendlyError("Room not found")).toMatch(/can.t find that room/i);
    expect(friendlyError("Failed to fetch")).toMatch(/connection/i);
    expect(friendlyError("Sign in to host a game")).toMatch(/sign in/i);
  });
  it("passes through short unknown server messages and never returns empty", () => {
    expect(friendlyError("Name is required")).toBe("Name is required");
    expect(friendlyError("")).toMatch(/something went wrong/i);
  });
  it("has no em dashes", () => {
    for (const m of ["", "Room not found", "Failed to fetch", "x"]) expect(friendlyError(m)).not.toMatch(/\u2014/);
  });
});

describe("wizard", () => {
  it("reports progress", () => {
    expect(wizardProgress(1, 4)).toEqual({ step: 1, total: 4, percent: 25 });
    expect(wizardProgress(4, 4).percent).toBe(100);
  });
  it("validates step 1 guests", () => {
    const cfg = { adults: 0, kids: 0, toddlers: 0 };
    expect(validateWizardStep(1, { expected: cfg, overrideCode: "", budget: 5 })).toMatch(/at least/i);
    expect(validateWizardStep(1, { expected: { adults: 4, kids: 0, toddlers: 0 }, overrideCode: "", budget: 5 })).toBe("");
  });
  it("validates budget and code", () => {
    const base = { expected: { adults: 4, kids: 1, toddlers: 0 }, overrideCode: "", budget: 5 };
    expect(validateWizardStep(3, { ...base, budget: -1 })).toMatch(/budget/i);
    expect(validateWizardStep(3, { ...base, budget: Number.NaN })).toMatch(/budget/i);
    expect(validateWizardStep(4, { ...base, overrideCode: "abc" })).toMatch(/4/);
    expect(validateWizardStep(4, { ...base, overrideCode: " abcd " })).toBe("");
  });
});

describe("join form", () => {
  const ok = { name: "Ava", age: "adult" as const, mode: "gm" as const, text: "", photoBlob: false, photoConsent: false };
  it("requires a name", () => { expect(canJoin({ ...ok, name: "  " })).toBe(false); expect(canJoin(ok)).toBe(true); });
  it("requires text for hint and own backstory unless a little kid", () => {
    expect(canJoin({ ...ok, mode: "own", text: "" })).toBe(false);
    expect(canJoin({ ...ok, mode: "own", text: "hi" })).toBe(true);
    expect(canJoin({ ...ok, age: "little", mode: "own", text: "" })).toBe(true);
  });
  it("requires consent when a photo is chosen", () => {
    expect(canJoin({ ...ok, photoBlob: true, photoConsent: false })).toBe(false);
    expect(canJoin({ ...ok, photoBlob: true, photoConsent: true })).toBe(true);
  });
});

describe("ballot progress", () => {
  it("counts chosen answers", () => {
    expect(ballotProgress({ killerId: "", methodId: "", motiveId: "" })).toEqual({ done: 0, total: 3, complete: false });
    expect(ballotProgress({ killerId: "a", methodId: "b", motiveId: "" }).done).toBe(2);
    expect(ballotProgress({ killerId: "a", methodId: "b", motiveId: "c" }).complete).toBe(true);
  });
});

describe("phases", () => {
  const sheet = [{ phase: "lobby" }, { phase: "cards" }, { phase: "act1" }];
  it("finds index and next title", () => {
    expect(phaseIndex(sheet, "cards")).toBe(1);
    expect(phaseIndex(sheet, "nope")).toBe(-1);
    expect(nextPhaseTitle([{ phase: "a", title: "A" }, { phase: "b", title: "B" }], "a")).toBe("B");
    expect(nextPhaseTitle([{ phase: "a", title: "A" }], "a")).toBe("the end");
  });
});

describe("tilt", () => {
  it("is deterministic and small", () => {
    expect(tilt("clue-1")).toBe(tilt("clue-1"));
    for (const id of ["a", "b", "clue-9", "zzz"]) expect(Math.abs(tilt(id))).toBeLessThanOrEqual(2);
  });
});

describe("misc helpers", () => {
  it("groups roster by house preserving order", () => {
    const g = groupByHouse([{ house: "A", n: 1 }, { house: "B", n: 2 }, { house: "A", n: 3 }]);
    expect(g.map((x) => x.house)).toEqual(["A", "B"]);
    expect(g[0].members.map((m) => m.n)).toEqual([1, 3]);
  });
  it("formats usd", () => { expect(formatUsd(1.5)).toBe("$1.50"); });
  it("shows degraded notice only when flagged", () => {
    expect(degradedNotice({})).toBe("");
    expect(degradedNotice({ aiDegraded: true })).toMatch(/sample case/i);
    expect(degradedNotice({ caseSource: "sample" })).toMatch(/sample case/i);
  });
  it("parses stored creds defensively", () => {
    expect(parseCreds('{"pid":"p","tok":"t"}')).toEqual({ pid: "p", tok: "t" });
    expect(parseCreds("garbage")).toBeNull();
    expect(parseCreds(null)).toBeNull();
    expect(parseCreds('{"pid":1}')).toBeNull();
    expect(credsKey("ABCD")).toBe("mm:ABCD");
  });
  it("plainText strips control characters but keeps text literal", () => {
    expect(plainText("<b>hi</b>\u0000")).toBe("<b>hi</b>");
  });
});
