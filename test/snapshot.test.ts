import { describe, it, expect } from "vitest";
import { parseRoster } from "../src/snapshot";

describe("parseRoster", () => {
  it("keeps uniques and sets, dropping runewords, recording uniqueId", () => {
    const r = parseRoster({
      items: {
        Shako: { type: "Unique", uniqueId: 1, medianHr: 5 },
        "Aldur's Advance": { type: "Set", medianHr: 0.1 },
        Spirit: { type: "Runeword", medianHr: 4 },
      },
    });
    expect([...r.keys()].sort()).toEqual(["Aldur's Advance", "Shako"]);
    expect(r.get("Shako")).toEqual({ type: "Unique", uniqueId: 1 });
    expect(r.get("Aldur's Advance")).toEqual({ type: "Set" });
  });
  it("throws on a snapshot missing the items field", () => {
    expect(() => parseRoster({})).toThrow(/items/);
  });
});
