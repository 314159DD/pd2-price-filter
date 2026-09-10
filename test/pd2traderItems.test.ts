import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFile, rm } from "node:fs/promises";
import { loadFixedItemDefs, resolveFixedItems } from "../src/pd2traderItems";
import type { PriceData } from "../src/types";

const price = (median: number): PriceData => ({
  median, medianSamples: 10,
});

describe("resolveFixedItems", () => {
  it("pairs defs with prices and skips defs that have no price", () => {
    const defs = [
      { name: "Ber Rune", condition: "RUNE=30", category: "rune" },
      { name: "Key of Terror", condition: "pk1", category: "uber" },
    ];
    const prices = new Map<string, PriceData>([["Ber Rune", price(3)]]);
    expect(resolveFixedItems(defs, prices)).toEqual([
      { kind: "fixed", condition: "RUNE=30", category: "rune", price: price(3) },
    ]);
  });
});

describe("loadFixedItemDefs", () => {
  it("loads a valid list", async () => {
    const path = join(tmpdir(), `pd2lf-fi-${Date.now()}.json`);
    await writeFile(path, JSON.stringify([
      { name: "Ber Rune", condition: "RUNE=30", category: "rune" },
    ]));
    expect(await loadFixedItemDefs(path)).toHaveLength(1);
    await rm(path);
  });
  it("rejects a file that is not a JSON array", async () => {
    const path = join(tmpdir(), `pd2lf-fi-bad-${Date.now()}.json`);
    await writeFile(path, JSON.stringify({ not: "an array" }));
    await expect(loadFixedItemDefs(path)).rejects.toThrow(/array/);
    await rm(path);
  });
});
