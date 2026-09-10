import { describe, it, expect } from "vitest";
import { parseAverage } from "../src/pd2trader";

describe("parseAverage", () => {
  it("maps a populated response to median + samples", () => {
    expect(parseAverage({ medianPrice: 0.1, sampleCount: 490 }))
      .toEqual({ median: 0.1, medianSamples: 490 });
  });
  it("returns null when there is no median price", () => {
    expect(parseAverage({})).toBeNull();
  });
  it("defaults a missing sample count to 0", () => {
    expect(parseAverage({ medianPrice: 2 })).toEqual({ median: 2, medianSamples: 0 });
  });
});
