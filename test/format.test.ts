import { describe, it, expect } from "vitest";
import { fmt, formatTag } from "../src/format";
import type { PriceData } from "../src/types";

const p = (o: Partial<PriceData>): PriceData => ({
  median: 1, medianSamples: 10, ...o,
});

describe("fmt", () => {
  it("drops trailing zeros and caps at 2 decimals", () => {
    expect(fmt(0.75)).toBe("0.75");
    expect(fmt(0.1)).toBe("0.1");
    expect(fmt(3)).toBe("3");
    expect(fmt(0.05)).toBe("0.05");
    expect(fmt(120)).toBe("120");
  });
});

describe("formatTag", () => {
  it("renders a single median as one value", () => {
    expect(formatTag([p({ median: 3 })])).toBe("3 HR");
  });
  it("renders a sub-1 median", () => {
    expect(formatTag([p({ median: 0.1 })])).toBe("0.1 HR");
  });
  it("marks a low-sample price with ?", () => {
    expect(formatTag([p({ median: 5, medianSamples: 2 })])).toBe("5 HR?");
  });
  it("spans a multi-item group from lowest to highest median", () => {
    expect(formatTag([p({ median: 5 }), p({ median: 120 })])).toBe("5 - 120 HR");
  });
  it("renders a single value when all medians in the group are equal", () => {
    expect(formatTag([p({ median: 2 }), p({ median: 2 })])).toBe("2 HR");
  });
});
