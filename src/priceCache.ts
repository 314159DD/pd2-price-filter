import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { PriceData } from "./types";

const TTL_MS = 24 * 60 * 60 * 1000;

/** A cache entry: a fetched price, or a "no data" marker. Both timestamped. */
export type CacheEntry =
  | { median: number; medianSamples: number; fetchedAt: string }
  | { noData: true; fetchedAt: string };

/** The on-disk price cache, keyed by item name. */
export type PriceCache = Record<string, CacheEntry>;

export function emptyPriceCache(): PriceCache {
  return {};
}

/** Load the cache from disk; an empty cache if the file is absent or corrupt. */
export async function loadPriceCache(path: string): Promise<PriceCache> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    return raw && typeof raw === "object" ? (raw as PriceCache) : {};
  } catch {
    return {};
  }
}

/** Write the cache to disk, creating the parent directory if needed. */
export async function savePriceCache(path: string, cache: PriceCache): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

/** True when the entry exists and was fetched within the 24h TTL. */
export function isFresh(entry: CacheEntry | undefined, now: number = Date.now()): boolean {
  if (!entry) return false;
  return now - new Date(entry.fetchedAt).getTime() < TTL_MS;
}

/** The PriceData a fresh entry holds, or null if it is a "no data" marker. */
export function entryPrice(entry: CacheEntry): PriceData | null {
  if ("noData" in entry) return null;
  return { median: entry.median, medianSamples: entry.medianSamples };
}
