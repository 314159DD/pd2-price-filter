import { describe, it, expect } from "vitest";
import {
  PRICE_BLOCK_START, PRICE_BLOCK_END, POTION_BLOCK_START,
  resolvePricedItems, buildBlock, stripBlock, findInsertionLine, decorate,
} from "../src/decorate";
import type { Roster, BaseCodeCache, PriceData, PricedItem } from "../src/types";

const price = (o: Partial<PriceData>): PriceData => ({
  median: 0.1, medianSamples: 10, ...o,
});

const SAMPLE = [
  "// header",
  "ItemDisplayFilterName[]: Base",
  "ItemDisplayFilterName[]: Strict",
  "ItemDisplay[box]: %NAME%{%NAME%}",
  "ItemDisplay[UNI ID usk]: %NAME%{%NAME%}",
].join("\n");

describe("resolvePricedItems", () => {
  it("resolves uniques by id and sets by name, skipping unpriced and base-codeless", () => {
    const roster: Roster = new Map([
      ["Andariel's Visage", { type: "Unique", uniqueId: 346 }],
      ["Aldur's Advance", { type: "Set" }],
      ["No Price", { type: "Unique", uniqueId: 77 }],
      ["No Base", { type: "Unique", uniqueId: 88 }],
    ]);
    const cache: BaseCodeCache = {
      uniques: { "346": "usk", "77": "xyz" },
      sets: { "Aldur's Advance": "xtb" },
    };
    const prices = new Map<string, PriceData>([
      ["Andariel's Visage", price({})],
      ["Aldur's Advance", price({})],
      ["No Base", price({})],
    ]);
    expect(resolvePricedItems(roster, cache, prices).map((i) => i.kind).sort())
      .toEqual(["set", "unique"]);
  });
  it("uses the priced alias name even when an unpriced alias is iterated first", () => {
    const roster: Roster = new Map([
      ["The Oculus", { type: "Unique", uniqueId: 5 }],
      ["Oculus", { type: "Unique", uniqueId: 5 }],
    ]);
    const cache: BaseCodeCache = { uniques: { "5": "oba" }, sets: {} };
    const prices = new Map<string, PriceData>([["Oculus", price({ median: 2 })]]);
    expect(resolvePricedItems(roster, cache, prices)).toEqual([
      { kind: "unique", baseCode: "oba", price: price({ median: 2 }) },
    ]);
  });
  it("drops ring, amulet, and jewel bases", () => {
    const roster: Roster = new Map([
      ["Stone of Jordan", { type: "Unique", uniqueId: 10 }],
      ["Mara's Kaleidoscope", { type: "Unique", uniqueId: 11 }],
      ["Rainbow Facet", { type: "Unique", uniqueId: 12 }],
      ["Angelic Halo", { type: "Set" }],
      ["Shako", { type: "Unique", uniqueId: 13 }],
    ]);
    const cache: BaseCodeCache = {
      uniques: { "10": "rin", "11": "amu", "12": "jew", "13": "ush" },
      sets: { "Angelic Halo": "rin" },
    };
    const prices = new Map<string, PriceData>([
      ["Stone of Jordan", price({})],
      ["Mara's Kaleidoscope", price({})],
      ["Rainbow Facet", price({})],
      ["Angelic Halo", price({})],
      ["Shako", price({})],
    ]);
    expect(resolvePricedItems(roster, cache, prices)).toEqual([
      { kind: "unique", baseCode: "ush", price: price({}) },
    ]);
  });
});

describe("buildBlock", () => {
  it("emits one rule per condition for unique, set, and fixed items", () => {
    const items: PricedItem[] = [
      { kind: "unique", baseCode: "usk", price: price({ median: 0.1 }) },
      { kind: "set", baseCode: "xtb", price: price({ median: 5 }) },
      { kind: "fixed", condition: "RUNE=30", category: "rune", price: price({ median: 3 }) },
    ];
    const block = buildBlock(items);
    expect(block).toContain("ItemDisplay[UNI ID usk]: %NAME%%GOLD% | 0.1 HR%CONTINUE%");
    expect(block).toContain("ItemDisplay[SET ID xtb]: %NAME%%GOLD% | 5 HR%CONTINUE%");
    expect(block).toContain("ItemDisplay[RUNE=30]: %NAME%%GOLD% | 3 HR%CONTINUE%");
  });
  it("spans a shared unique base as a median range", () => {
    const items: PricedItem[] = [
      { kind: "unique", baseCode: "uar", price: price({ median: 5 }) },
      { kind: "unique", baseCode: "uar", price: price({ median: 120 }) },
    ];
    expect(buildBlock(items)).toContain(
      "ItemDisplay[UNI ID uar]: %NAME%%GOLD% | 5 - 120 HR%CONTINUE%",
    );
  });
});

describe("stripBlock / findInsertionLine", () => {
  const item: PricedItem = { kind: "unique", baseCode: "usk", price: price({}) };
  it("leaves text without a block unchanged", () => {
    expect(stripBlock(SAMPLE, PRICE_BLOCK_START, PRICE_BLOCK_END)).toBe(SAMPLE);
  });
  it("removes the price block but leaves the potion block", () => {
    const decorated = decorate(SAMPLE, [item]);
    const noPrice = stripBlock(decorated, PRICE_BLOCK_START, PRICE_BLOCK_END);
    expect(noPrice.includes(PRICE_BLOCK_START)).toBe(false);
    expect(noPrice.includes(POTION_BLOCK_START)).toBe(true);
  });
  it("returns the line after the last ItemDisplayFilterName declaration", () => {
    expect(findInsertionLine(SAMPLE.split("\n"))).toBe(3);
  });
  it("returns 0 when there are no declarations", () => {
    expect(findInsertionLine(["ItemDisplay[box]: x"])).toBe(0);
  });
});

describe("decorate", () => {
  const item: PricedItem = { kind: "unique", baseCode: "usk", price: price({}) };
  it("injects both the price block and the potion block", () => {
    const out = decorate(SAMPLE, [item]);
    expect(out).toContain(PRICE_BLOCK_START);
    expect(out).toContain(POTION_BLOCK_START);
    expect(out).toContain("ItemDisplay[hp1 OR hp2 OR hp3 OR hp4 OR hp5]: %RED%+");
    expect(out).toContain("ItemDisplay[mp1 OR mp2 OR mp3 OR mp4 OR mp5]: %BLUE%+");
    expect(out).toContain("ItemDisplay[rvs]: %PURPLE%*");
    expect(out).toContain("ItemDisplay[rvl]: %PURPLE%**");
  });
  it("inserts the blocks after the declarations and before item rules", () => {
    const out = decorate(SAMPLE, [item]).split("\n");
    const priceLine = out.findIndex((l) => l === PRICE_BLOCK_START);
    const boxLine = out.findIndex((l) => l.startsWith("ItemDisplay[box]"));
    expect(priceLine).toBeGreaterThan(-1);
    expect(priceLine).toBeLessThan(boxLine);
  });
  it("is idempotent — decorating twice yields exactly one of each block", () => {
    const once = decorate(SAMPLE, [item]);
    const twice = decorate(once, [item]);
    expect(twice).toBe(once);
    expect((twice.match(/PD2 PRICE TAGS.*START/g) ?? []).length).toBe(1);
    expect((twice.match(/PD2 POTION DISPLAY.*START/g) ?? []).length).toBe(1);
  });
});
