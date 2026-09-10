import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRoster } from "./snapshot";
import { loadCache, saveCache, refreshCache, emptyCache } from "./baseCodes";
import { fetchAverage, type Mode } from "./pd2trader";
import {
  loadPriceCache, savePriceCache, isFresh, entryPrice, type PriceCache,
} from "./priceCache";
import { loadFixedItemDefs, resolveFixedItems } from "./pd2traderItems";
import { resolvePricedItems, decorate } from "./decorate";
import { fmt } from "./format";
import type { PriceData } from "./types";

const PD2_FILTERS = "C:\\Program Files (x86)\\Diablo II\\ProjectD2\\filters";
const ONLINE_DIR = join(PD2_FILTERS, "online");
const LOCAL_DIR = join(PD2_FILTERS, "local");
const DEFAULT_FILTER = "Hiim_Crafting_Paladin_Focused.filter";
const PACE_MS = 150;

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");
const BASE_CODE_CACHE = join(DATA_DIR, "base-codes.json");
const FIXED_ITEMS = join(DATA_DIR, "pd2trader-items.json");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve a price for every requested item name, reusing fresh cache entries
 * and fetching the rest from pd2trader. Mutates `cache` in place. A median that
 * rounds to 0 is treated as unpriceable and left out of the returned map.
 */
async function gatherPrices(
  names: string[],
  cache: PriceCache,
  mode: Mode,
  refresh: boolean,
): Promise<{ prices: Map<string, PriceData>; failures: number }> {
  const prices = new Map<string, PriceData>();
  let failures = 0;
  let i = 0;
  for (const name of names) {
    i++;
    const cached = cache[name];
    if (!refresh && isFresh(cached)) {
      const p = entryPrice(cached!);
      if (p && fmt(p.median) !== "0") prices.set(name, p);
    } else {
      try {
        const avg = await fetchAverage(name, mode);
        if (avg === null) {
          cache[name] = { noData: true, fetchedAt: new Date().toISOString() };
        } else {
          cache[name] = { ...avg, fetchedAt: new Date().toISOString() };
          if (fmt(avg.median) !== "0") prices.set(name, avg);
        }
      } catch {
        failures++;
      }
      await sleep(PACE_MS);
    }
    if (i % 50 === 0) console.log(`  priced ${i}/${names.length}`);
  }
  return { prices, failures };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode: Mode = args.includes("--softcore") ? "softcore" : "hardcore";
  const refreshBases = args.includes("--refresh-bases");
  const refreshPrices = args.includes("--refresh-prices");
  const filterName = args.find((a) => !a.startsWith("--")) ?? DEFAULT_FILTER;
  const prefix = mode === "hardcore" ? "HC" : "SC";

  const sourcePath = join(ONLINE_DIR, filterName);
  const outName = `${prefix}_Stonks_${basename(filterName, ".filter")}.filter`;
  const outPath = join(LOCAL_DIR, outName);

  let filterText: string;
  try {
    filterText = await readFile(sourcePath, "utf8");
  } catch {
    console.error(`Source filter not found: ${sourcePath}`);
    try {
      const available = (await readdir(ONLINE_DIR)).filter((f) => f.endsWith(".filter"));
      if (available.length > 0) {
        console.error(`Available filters in ${ONLINE_DIR}:`);
        for (const f of available) console.error(`  ${f}`);
      }
    } catch {
      // online directory unreadable; nothing more to suggest
    }
    process.exit(1);
  }
  console.log(`Mode: ${mode}  |  Source: ${sourcePath}`);

  console.log("Fetching roster...");
  const roster = await fetchRoster();
  console.log(`  ${roster.size} uniques/sets`);

  let baseCodes = refreshBases ? emptyCache() : await loadCache(BASE_CODE_CACHE);
  try {
    baseCodes = await refreshCache(roster, baseCodes, (m) => console.log(m));
  } finally {
    await saveCache(BASE_CODE_CACHE, baseCodes);
  }

  const fixedDefs = await loadFixedItemDefs(FIXED_ITEMS);
  const names: string[] = [...roster.keys(), ...fixedDefs.map((d) => d.name)];

  const priceCachePath = join(DATA_DIR, `price-cache-${prefix.toLowerCase()}.json`);
  const priceCache: PriceCache = refreshPrices ? {} : await loadPriceCache(priceCachePath);
  console.log(`Pricing ${names.length} items from pd2trader (${mode})...`);
  let gathered: { prices: Map<string, PriceData>; failures: number };
  try {
    gathered = await gatherPrices(names, priceCache, mode, refreshPrices);
  } finally {
    await savePriceCache(priceCachePath, priceCache);
  }
  const { prices, failures } = gathered;

  if (failures > names.length / 2) {
    console.error(
      `Aborting: ${failures}/${names.length} price requests failed — ` +
        `pd2trader may be down. No filter written.`,
    );
    process.exit(1);
  }

  const items = [
    ...resolvePricedItems(roster, baseCodes, prices),
    ...resolveFixedItems(fixedDefs, prices),
  ];
  const decorated = decorate(filterText, items);
  await writeFile(outPath, decorated, "utf8");

  const uniques = items.filter((it) => it.kind === "unique").length;
  const sets = items.filter((it) => it.kind === "set").length;
  const runes = items.filter((it) => it.kind === "fixed" && it.category === "rune").length;
  const ubers = items.filter((it) => it.kind === "fixed" && it.category === "uber").length;
  console.log(`\nWrote: ${outPath}`);
  console.log(`  ${uniques} uniques, ${sets} sets, ${runes} runes, ${ubers} ubers`);
  console.log(`  ${prices.size} priced, ${failures} fetch failures`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
