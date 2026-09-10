import type { PriceData } from "./types";

/** Round to 2 decimals, dropping trailing zeros: 0.75, 0.1, 3, 0.05, 120. */
export function fmt(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

/**
 * Build the price tag for a group of prices sharing one filter condition.
 * Renders a single value when the group's medians are equal, a low-high
 * range otherwise. Appends "?" when any price has fewer than 3 samples.
 */
export function formatTag(prices: PriceData[]): string {
  if (prices.length === 0) throw new Error("formatTag: no prices");
  const medians = prices.map((p) => p.median);
  const low = Math.min(...medians);
  const high = Math.max(...medians);
  const mark = prices.some((p) => p.medianSamples < 3) ? "?" : "";
  return fmt(low) === fmt(high)
    ? `${fmt(low)} HR${mark}`
    : `${fmt(low)} - ${fmt(high)} HR${mark}`;
}
