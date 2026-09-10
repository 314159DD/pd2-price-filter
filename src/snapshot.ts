import type { Roster } from "./types";

const ROSTER_URL = "https://pd2-aggregator.vercel.app/price-snapshot.json";

interface RawItem {
  type?: string;
  uniqueId?: number;
}

/** Parse the aggregator snapshot into a roster of uniques and sets (names only). */
export function parseRoster(raw: unknown): Roster {
  if (!raw || typeof raw !== "object" || !("items" in raw)) {
    throw new Error("Invalid snapshot: missing 'items' field");
  }
  const items = (raw as { items: Record<string, RawItem> }).items;
  const roster: Roster = new Map();
  for (const [name, item] of Object.entries(items)) {
    if (item.type === "Unique") {
      roster.set(name, { type: "Unique", uniqueId: item.uniqueId });
    } else if (item.type === "Set") {
      roster.set(name, { type: "Set" });
    }
  }
  return roster;
}

/** Fetch and parse the live roster. */
export async function fetchRoster(url: string = ROSTER_URL): Promise<Roster> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Roster fetch failed: HTTP ${res.status}`);
  return parseRoster(await res.json());
}
