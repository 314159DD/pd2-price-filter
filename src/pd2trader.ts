export type Mode = "hardcore" | "softcore";

const AVERAGE_URL = "https://pd2trader.com/item-prices/average";
// 30-day sample window. A 7-day window gave too few sales for thinly-traded
// items, producing noisy medians that disagreed with the pd2trader site.
const PRICE_WINDOW_HOURS = 720;

interface AverageResponse {
  medianPrice?: number;
  sampleCount?: number;
}

/** Median price + sample count from an /average response; null if no data. */
export function parseAverage(
  data: AverageResponse,
): { median: number; medianSamples: number } | null {
  if (data.medianPrice == null) return null;
  return { median: data.medianPrice, medianSamples: data.sampleCount ?? 0 };
}

function ladderParams(mode: Mode): string {
  return `isHardcore=${mode === "hardcore"}&isLadder=true`;
}

/**
 * Fetch an item's average median price. Returns null when pd2trader has no data
 * (HTTP 500). Throws on any other non-ok status or a network error.
 */
export async function fetchAverage(
  name: string,
  mode: Mode,
): Promise<{ median: number; medianSamples: number } | null> {
  const url =
    `${AVERAGE_URL}?itemName=${encodeURIComponent(name)}` +
    `&${ladderParams(mode)}&hours=${PRICE_WINDOW_HOURS}`;
  const res = await fetch(url);
  if (res.status === 500) return null;
  if (!res.ok) throw new Error(`pd2trader average ${name}: HTTP ${res.status}`);
  return parseAverage((await res.json()) as AverageResponse);
}
