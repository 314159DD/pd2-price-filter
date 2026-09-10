import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import { emptyCache, loadCache, saveCache, missingItems } from "../src/baseCodes";
import type { Roster } from "../src/types";

describe("missingItems", () => {
  it("lists uncached uniques by id and sets by name", () => {
    const roster: Roster = new Map([
      ["Shako", { type: "Unique", uniqueId: 1 }],
      ["Aldur's Advance", { type: "Set" }],
    ]);
    const m = missingItems(roster, emptyCache());
    expect(m.uniqueIds).toEqual([1]);
    expect(m.setNames).toEqual(["Aldur's Advance"]);
  });
  it("skips items already present in the cache", () => {
    const roster: Roster = new Map([["Shako", { type: "Unique", uniqueId: 1 }]]);
    expect(missingItems(roster, { uniques: { "1": "ush" }, sets: {} }).uniqueIds).toEqual([]);
  });
  it("dedupes a unique appearing under alias names", () => {
    const roster: Roster = new Map([
      ["Shako", { type: "Unique", uniqueId: 1 }],
      ["The Shako", { type: "Unique", uniqueId: 1 }],
    ]);
    expect(missingItems(roster, emptyCache()).uniqueIds).toEqual([1]);
  });
});

describe("loadCache / saveCache", () => {
  it("returns an empty cache for a missing file", async () => {
    expect(await loadCache(join(tmpdir(), "pd2lf-bc-missing.json"))).toEqual(emptyCache());
  });
  it("round-trips a cache through disk", async () => {
    const path = join(tmpdir(), `pd2lf-bc-${Date.now()}.json`);
    await saveCache(path, { uniques: { "1": "ush" }, sets: { Foo: "xtb" } });
    const c = await loadCache(path);
    expect(c.uniques["1"]).toBe("ush");
    expect(c.sets.Foo).toBe("xtb");
    await rm(path);
  });
});
