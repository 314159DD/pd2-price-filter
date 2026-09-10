/** A pd2trader price for one item. */
export interface PriceData {
  median: number;
  medianSamples: number;
}

/** A unique or set item in the roster (from the aggregator snapshot). */
export interface RosterEntry {
  type: "Unique" | "Set";
  uniqueId?: number;
}

/** The roster of priceable uniques/sets, keyed by item name. */
export type Roster = Map<string, RosterEntry>;

/** Disk cache mapping items to their PD2 filter base code. */
export interface BaseCodeCache {
  /** uniqueId (as string) -> base code, e.g. "346" -> "usk" */
  uniques: Record<string, string>;
  /** set piece name -> base code, e.g. "Aldur's Advance" -> "xtb" */
  sets: Record<string, string>;
}

/** A priced item ready to become a filter rule. */
export type PricedItem =
  | { kind: "unique"; baseCode: string; price: PriceData }
  | { kind: "set"; baseCode: string; price: PriceData }
  | { kind: "fixed"; condition: string; category: string; price: PriceData };
