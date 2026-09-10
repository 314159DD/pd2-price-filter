import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Roster, BaseCodeCache } from "./types";

const API = "https://api.projectdiablo2.com/market/listing";
const PACE_MS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function emptyCache(): BaseCodeCache {
  return { uniques: {}, sets: {} };
}

/** Load the cache from disk, returning an empty cache if the file is absent. */
export async function loadCache(path: string): Promise<BaseCodeCache> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<BaseCodeCache>;
    return { uniques: raw.uniques ?? {}, sets: raw.sets ?? {} };
  } catch {
    return emptyCache();
  }
}

/** Write the cache to disk, creating the parent directory if needed. */
export async function saveCache(path: string, cache: BaseCodeCache): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

export interface MissingItems {
  uniqueIds: number[];
  setNames: string[];
}

/** Determine which priced items still need a base code harvested. */
export function missingItems(roster: Roster, cache: BaseCodeCache): MissingItems {
  const uniqueIds: number[] = [];
  const setNames: string[] = [];
  const seen = new Set<number>();
  for (const [name, entry] of roster) {
    if (entry.type === "Unique" && entry.uniqueId != null) {
      if (!seen.has(entry.uniqueId) && !(String(entry.uniqueId) in cache.uniques)) {
        seen.add(entry.uniqueId);
        uniqueIds.push(entry.uniqueId);
      }
    } else if (entry.type === "Set" && !(name in cache.sets)) {
      setNames.push(name);
    }
  }
  return { uniqueIds, setNames };
}

/** Query the market API and extract the first listing's base code ("" if none). */
async function fetchBaseId(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const data = (await res.json()) as {
    data?: Array<{ item?: { base?: { id?: string } } }>;
  };
  return data.data?.[0]?.item?.base?.id ?? "";
}

export function fetchUniqueBaseCode(uniqueId: number): Promise<string> {
  return fetchBaseId(`${API}?%24limit=1&item.unique.id=${uniqueId}`);
}

export function fetchSetBaseCode(name: string): Promise<string> {
  return fetchBaseId(
    `${API}?%24limit=1&item.quality.name=Set&item.name=${encodeURIComponent(name)}`,
  );
}

/**
 * Harvest base codes for every item missing from the cache. Mutates and returns
 * `cache`. Items with no listing are stored as "" so they are not re-queried.
 */
export async function refreshCache(
  roster: Roster,
  cache: BaseCodeCache,
  log: (msg: string) => void = () => {},
): Promise<BaseCodeCache> {
  const { uniqueIds, setNames } = missingItems(roster, cache);
  const total = uniqueIds.length + setNames.length;
  if (total === 0) {
    log("Base codes: cache is up to date.");
    return cache;
  }
  log(`Base codes: harvesting ${total} missing item(s)...`);
  let i = 0;
  for (const id of uniqueIds) {
    cache.uniques[String(id)] = await fetchUniqueBaseCode(id);
    if (++i % 25 === 0) log(`  ${i}/${total}`);
    await sleep(PACE_MS);
  }
  for (const name of setNames) {
    cache.sets[name] = await fetchSetBaseCode(name);
    if (++i % 25 === 0) log(`  ${i}/${total}`);
    await sleep(PACE_MS);
  }
  return cache;
}
