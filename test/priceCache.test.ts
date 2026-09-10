import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import {
  emptyPriceCache, loadPriceCache, savePriceCache, isFresh, entryPrice,
} from "../src/priceCache";

const HOUR = 60 * 60 * 1000;

describe("isFresh", () => {
  it("is true for an entry fetched within 24h", () => {
    const now = Date.now();
    const entry = { noData: true as const, fetchedAt: new Date(now - 2 * HOUR).toISOString() };
    expect(isFresh(entry, now)).toBe(true);
  });
  it("is false for an entry older than 24h", () => {
    const now = Date.now();
    const entry = { noData: true as const, fetchedAt: new Date(now - 30 * HOUR).toISOString() };
    expect(isFresh(entry, now)).toBe(false);
  });
  it("is false for a missing entry", () => {
    expect(isFresh(undefined)).toBe(false);
  });
});

describe("entryPrice", () => {
  it("extracts price data from a price entry", () => {
    expect(entryPrice({
      median: 0.1, medianSamples: 490, fetchedAt: "2026-05-22T00:00:00.000Z",
    })).toEqual({ median: 0.1, medianSamples: 490 });
  });
  it("returns null for a no-data entry", () => {
    expect(entryPrice({ noData: true, fetchedAt: "2026-05-22T00:00:00.000Z" })).toBeNull();
  });
});

describe("loadPriceCache / savePriceCache", () => {
  it("returns an empty cache for a missing file", async () => {
    expect(await loadPriceCache(join(tmpdir(), "pd2lf-pc-missing.json")))
      .toEqual(emptyPriceCache());
  });
  it("round-trips a cache through disk", async () => {
    const path = join(tmpdir(), `pd2lf-pc-${Date.now()}.json`);
    await savePriceCache(path, {
      Shako: { median: 5, medianSamples: 20, fetchedAt: "2026-05-22T00:00:00.000Z" },
    });
    const c = await loadPriceCache(path);
    expect(c.Shako).toEqual({
      median: 5, medianSamples: 20, fetchedAt: "2026-05-22T00:00:00.000Z",
    });
    await rm(path);
  });
});
