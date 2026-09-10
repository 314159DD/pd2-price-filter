# PD2 Filter Price Decorator v2 - pd2trader Pricing Rework

**Date:** 2026-05-22
**Status:** Approved, ready for implementation planning
**Supersedes:** the pricing portion of `2026-05-22-pd2-filter-price-decorator-design.md`

## Why

The v1 tool priced uniques and sets from the `pd2-aggregator` snapshot's
`medianHr` field. That value is unreliable: the aggregator builds its snapshot
from `api.projectdiablo2.com`, sampling up to 50 listings per item, and computes
a median from whatever it finds. For Griswold's Valor it found **7 listings** and
produced `0.2 HR`. pd2trader, over **490 listings**, reports a median of
`0.1 HR` - the realistic price, confirmed against the live market.

v2 changes the price source to **pd2trader.com** for every item type, and adds a
**top-corruption** ceiling so a tag reads `median - topCorruption`
(e.g. `Griswold's Valor | 0.1 - 0.75 HR`). It also folds in uber materials.

What stays from v1: the loot-filter block injection (`decorate`, `stripBlock`,
`findInsertionLine`) and the base-code harvest from `api.projectdiablo2.com`.

## Scope

In scope: identified uniques, set items, runes, uber keys, uber organs.
Out of scope (unchanged from v1): runewords, unidentified items, affix-rolled
items, non-ladder prices.

**Rings, amulets, and jewels are excluded** (base codes `rin`, `amu`, `jew`).
Each of those bases is shared by 10-20+ distinct items, so a `UNI ID rin` rule
matches every ring in-game - the filter cannot tell them apart, and any tag on
those bases is a meaningless combined range. `resolvePricedItems` drops them.

**Hardcore and softcore are both supported.** pd2trader prices differ by mode, so
a run targets exactly one mode - hardcore by default, softcore via `--softcore`.
The roster and base codes are mode-independent (the same items and bases exist in
both); only prices and the output filename change with mode.

## Data sources

1. **Roster** - `https://pd2-aggregator.vercel.app/price-snapshot.json`.
   Used **only** to enumerate which uniques and sets exist: item name, `type`
   (`Unique` / `Set`), and `uniqueId`. Its price fields are ignored.

2. **Base codes** - `https://api.projectdiablo2.com/market/listing`. Harvested
   per item, cached permanently to `data/base-codes.json`. Unchanged from v1.
   (pd2trader's `baseCode` field is its own scheme - e.g. `"annihilus"`,
   `"rainbow_facet_lightning_4_4"` - and is not the filter base code, so the
   projectdiablo2 harvest is still required.)

3. **Prices** - `pd2trader.com`, two endpoints. `<hc>` is `true` in hardcore mode,
   `false` in softcore mode:
   - `GET /item-prices/average?itemName=<name>&isHardcore=<hc>&isLadder=true&hours=720`
     → `medianPrice`, `sampleCount`. HTTP 500 means "no price data". The window is
     720 hours (30 days): a 7-day window left thinly-traded items (uber keys,
     niche uniques) with too few sales for a stable median, and disagreed with
     the pd2trader site's own detail panel, which samples 30 days.
   - `GET /item-prices/corruption-prices?itemName=<name>&isHardcore=<hc>&isLadder=true&hours=720`
     → `corruptionPrices[]`, each with `medianPrice` and `sampleCount`. Same
     30-day window as the average endpoint - without `hours` this endpoint uses
     a short, volatile default window.
   Prices are cached per mode (see Price cache) with a 24-hour freshness window.

4. **Fixed items** - `data/pd2trader-items.json`, a committed curated list of
   non-roster items: 9 high runes (Gul through Zod) + 3 uber keys + 3 uber
   organs. Each entry is `{ name, condition, category }`. Low runes are
   deliberately excluded - they trade for a few hundredths of an HR, and their
   thin pd2trader data produces unreliable medians; add an entry to price more.

## Price model

```ts
interface PriceData {
  median: number;            // pd2trader medianPrice
  medianSamples: number;     // pd2trader sampleCount for the base price
  topCorruption: number | null; // highest corruption median with >=3 samples
}
```

- `topCorruption` is the maximum `medianPrice` among corruption entries with
  `sampleCount >= 3`. `null` when the item has no such corruption (charms,
  runes, ubers, or simply no corruption data).
- Fixed items (runes, ubers) are never corruptible - their `topCorruption` is
  always `null`, and the corruption endpoint is not called for them.

## The tag

A filter rule's tag is produced from the group of `PriceData` sharing one filter
condition (usually one item; 2+ only for shared unique/set bases):

- `low` = minimum `median` in the group
- `high` = maximum `topCorruption ?? median` in the group
- `mark` = `"?"` if any item in the group has `medianSamples < 3`, else `""`
- If `low === high`: tag is `<low> HR<mark>`
- Else: tag is `<low> - <high> HR<mark>`

Examples: `Griswold's Valor | 0.1 - 0.75 HR`, `Ber Rune | 3 HR`,
`Sacred Armor base (2 uniques) | 5 - 120 HR`.

Number formatting: round to 2 decimals, trim trailing zeros (`0.75`, `0.1`, `3`,
`0.05`, `120`). v1's `~` sub-1 prefix is dropped. If a median rounds to `0`, the
item has no usable price and is skipped (no tag).

## Price cache

One cache file per mode - `data/price-cache-hc.json` or `data/price-cache-sc.json`
- so hardcore and softcore prices never mix. The base-code cache
(`data/base-codes.json`) is mode-independent and shared by both.

Each file is keyed by item name:

```json
{
  "Griswold's Valor": {
    "median": 0.1, "medianSamples": 490, "topCorruption": 0.75,
    "fetchedAt": "2026-05-22T18:00:00.000Z"
  },
  "Some Rare Item": { "noData": true, "fetchedAt": "2026-05-22T18:00:00.000Z" }
}
```

- An entry is **fresh** if `Date.now() - fetchedAt < 24h`; fresh entries are
  reused without a network call.
- "No price data" (HTTP 500) is cached as `{ noData: true, fetchedAt }` so it is
  not retried within the window.
- `--refresh-prices` ignores the cache and re-fetches everything.
- The cache is saved in a `finally` block so partial progress survives a crash,
  matching the base-code cache behavior.

## Runtime

First run: ~626 uniques/sets × 2 calls + ~39 fixed items × 1 call ≈ 1300 paced
pd2trader requests ≈ 3-4 minutes (plus the one-time base-code harvest). A
same-day re-run reuses the price cache and finishes in seconds. `data/` cache
files are gitignored.

## Pipeline (`src/index.ts`)

1. Parse args: optional filter name, `--softcore` (mode is hardcore unless this
   flag is given), `--refresh-bases`, `--refresh-prices`.
2. Read the source filter from `online/`; abort + list available filters if missing.
3. Fetch the roster (snapshot); abort on failure. Deduplicate uniques by
   `uniqueId`. Keep `Unique` and `Set` entries; drop `Runeword`.
4. Load + refresh the base-code cache (projectdiablo2 harvest); save in `finally`.
   Abort on harvest failure (cache preserved).
5. Load the price cache. For each roster item: reuse a fresh entry, else fetch
   median + top corruption from pd2trader. For each fixed item: reuse a fresh
   entry, else fetch median only. Save the price cache in `finally`.
6. Resolve into `PricedItem[]`: uniques/sets gain their base code, fixed items
   carry their condition. Items with no base code or no usable price are dropped.
7. `decorate` the filter text and write the output to
   `local/<MODE>_Stonks_<name>.filter` - `HC_Stonks_` prefix in hardcore mode,
   `SC_Stonks_` in softcore (e.g. `HC_Stonks_Hiim_Crafting_Paladin_Focused.filter`).
8. Print a summary: the mode, uniques / sets / runes / ubers tagged, shared-base
   ranges, items skipped (no price), items skipped (no base code), fetch failures.

## Modules

| File | Role | vs v1 |
|------|------|-------|
| `src/types.ts` | shared types incl. `PriceData`, `PricedItem` | reworked |
| `src/format.ts` | `formatTag(prices: PriceData[])` | rewritten |
| `src/snapshot.ts` | fetch the roster (names/type/uniqueId only) | reworked (price fields dropped) |
| `src/baseCodes.ts` | base-code harvest + cache | unchanged |
| `src/pd2trader.ts` | price client: `fetchMedian`, `fetchTopCorruption` | new |
| `src/priceCache.ts` | TTL price cache load/save/staleness | new |
| `src/pd2traderItems.ts` | load `data/pd2trader-items.json`, fetch fixed-item prices | replaces `runes.ts` |
| `src/decorate.ts` | resolve priced items + block injection | `resolvePricedItems` reworked; injection unchanged |
| `src/index.ts` | pipeline orchestration | reworked |

`PricedItem` is a `kind`-discriminated union:
`{ kind:"unique"; baseCode; price:PriceData }` |
`{ kind:"set"; baseCode; price:PriceData }` |
`{ kind:"fixed"; condition:string; category:string; price:PriceData }`.

`decorate.ts`'s `buildBlock` groups items by filter condition (`UNI ID <code>`,
`SET ID <code>`, or the fixed item's literal `condition`) and renders one rule
per group via `formatTag`. `stripBlock`, `findInsertionLine`, and the idempotent
delimited-block injection are unchanged from v1.

## Error handling

- Roster fetch failure → abort.
- Base-code harvest failure → abort; base-code cache preserved; no output written.
- Source filter missing → abort, list `.filter` files in `online/`.
- A pd2trader request returning HTTP 500 → that item has no price data; cached as
  `noData` and skipped. Normal, not an error.
- A pd2trader request failing transiently (network error, non-500 HTTP) → the
  item is skipped and a failure counter is incremented; not cached. If failures
  exceed half the requested items, the tool prints a loud warning and exits
  non-zero rather than writing a near-empty filter (avoids silent failure).
- An item with no resolvable base code → skipped, counted in the summary.

## Testing

- `format.ts` (`formatTag`) and `decorate.ts` (`resolvePricedItems`, `buildBlock`,
  `stripBlock`, `findInsertionLine`, `decorate`) are pure and unit-tested with
  vitest.
- `pd2trader.ts`'s response parsers (`parseAverage`, `parseTopCorruption`) are
  pure functions and unit-tested, including the `>=3` sample filter and the
  HTTP-500 path.
- `priceCache.ts` staleness logic is pure and unit-tested.
- The HTTP fetch wrappers are not unit-tested; they are exercised by the live
  end-to-end run.
- Idempotency: decorating an already-decorated file produces identical output.
- In-game verification by the user confirms the tag renders correctly and that
  `pk1/pk2/pk3` (keys) and `dhn/mbr/bey` (organs) are the right filter conditions.
