import { readFile } from "node:fs/promises";
import type { PriceData, PricedItem } from "./types";

/** One curated fixed-price item: a name to price and the filter rule to emit. */
export interface FixedItemDef {
  name: string;
  condition: string;
  category: string;
}

/** Load and validate the curated fixed-item list. */
export async function loadFixedItemDefs(path: string): Promise<FixedItemDef[]> {
  const raw = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`${path}: expected a JSON array of fixed items`);
  }
  for (const d of raw) {
    if (
      !d || typeof d.name !== "string" ||
      typeof d.condition !== "string" || typeof d.category !== "string"
    ) {
      throw new Error(`${path}: every entry needs string name, condition, category`);
    }
  }
  return raw as FixedItemDef[];
}

/** Pair each fixed-item def with its fetched price, dropping unpriced ones. */
export function resolveFixedItems(
  defs: FixedItemDef[],
  prices: Map<string, PriceData>,
): PricedItem[] {
  const items: PricedItem[] = [];
  for (const def of defs) {
    const price = prices.get(def.name);
    if (!price) continue;
    items.push({ kind: "fixed", condition: def.condition, category: def.category, price });
  }
  return items;
}
