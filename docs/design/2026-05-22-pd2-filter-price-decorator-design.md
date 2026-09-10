# PD2 Filter Price Decorator - Design

**Date:** 2026-05-22
**Status:** Approved, ready for implementation planning

## Problem

Project Diablo 2 loot filters show item names on the ground (e.g. `Andariel's Visage`).
We want to append a live market price so the in-game label reads
`Andariel's Visage | 0.2 HR`. Price data already exists: the `pd2-aggregator`
Vercel app harvests the PD2 market and pd2trader.com for prices.

## Core constraint

PD2 `.filter` rules can only match on **item base code + quality** (`UNI`, `SET`),
the `RUNE=N` property, stats, sockets, ethereal, item level. There is **no
condition that matches a specific unique by name or ID**. Confirmed from the Hiim
filter itself: its entire star-tier system is keyed on base codes (`uar`, `uhm`,
`ci3`), and its comments admit the breakdown
(`// Templar's Might or Tyrael's Might - Sacred Armor`).

Consequence: a rule `ItemDisplay[UNI ID usk]: ...` is exact when a base has one
unique (the large majority), but cannot distinguish uniques that share a base.
For shared bases the tool shows a **price range** instead of a single value.

Runes are not affected: each rune maps to a distinct `RUNE=N` value (N = 1..33),
so rune rules are always exact.

## Scope

In scope:
- Identified **uniques** and **set items**, matched by base code. Single-unique
  bases get a median; shared bases get a range.
- **Runes**, matched by `RUNE=N`. Always an exact median.
- Low-confidence marking on uniques and sets.

Out of scope (YAGNI):
- Runewords (completed rune-word items, as opposed to individual runes).
- Unidentified items (their `%NAME%` is generic, e.g. "Unique Armor").
- Auto-watching for online-filter updates. Re-run is manual.
- Hardcore / non-ladder price modes. Softcore ladder only.

## Architecture

Standalone TypeScript project at `C:\Coding\III____Full_Circle\pd2_lootfilter`.
Run via `tsx`. No changes to `pd2-aggregator` or any other repo.

### Data sources (all read-only)

1. **Unique / set prices** - fetched live from
   `https://pd2-aggregator.vercel.app/price-snapshot.json`. That app harvests the
   market nightly and computes medians. Entry shape:
   ```json
   "Andariel's Visage": {
     "type": "Unique", "uniqueId": 346,
     "medianHr": 0.2, "low": 0.1, "high": 0.5, "sampleCount": 23
   }
   ```
   Keys are item names. `type` is `Unique` | `Set` | `Runeword`.

2. **Base codes** - the public snapshot has `uniqueId` but not the base code the
   filter needs. The tool harvests base codes itself from
   `https://api.projectdiablo2.com/market/listing`, which returns `item.base.id`
   (e.g. `"usk"` for Demonhead) on every listing. Result is cached to
   `data/base-codes.json` so re-runs are instant. Re-harvest happens when a priced
   item is missing from the cache, or when the `--refresh-bases` flag is passed.

3. **Rune prices** - fetched live from
   `https://pd2trader.com/item-prices/average?itemName=<Rune> Rune&isHardcore=false&isLadder=true&hours=168`.
   One request per rune (33 total). Response gives `medianPrice` and `sampleCount`.
   Low runes with no listings return HTTP 500 and are skipped. Rune prices change
   frequently, so they are fetched fresh every run and **not cached**.

### Modules

| File | Responsibility | Depends on |
|------|----------------|------------|
| `src/types.ts` | Shared type definitions | nothing |
| `src/format.ts` | `formatPriceTag` - price stats -> display string | `types` |
| `src/snapshot.ts` | Fetch + parse the unique/set price snapshot | network |
| `src/baseCodes.ts` | Harvest / cache name -> baseCode | network, `data/base-codes.json` |
| `src/runes.ts` | Fetch rune prices from pd2trader.com | network |
| `src/decorate.ts` | Pure: resolve priced items, build + inject the rule block | `format` |
| `src/index.ts` | CLI glue: read filter, run pipeline, write output, print summary | fs, the modules above |

`src/format.ts` and `src/decorate.ts` are pure and fully unit-testable.
All network and filesystem I/O lives in `snapshot.ts`, `baseCodes.ts`,
`runes.ts`, and `index.ts`.

## Decorate logic

Input: source filter text + a list of priced items, each tagged as a unique, set,
or rune.

1. Group uniques and sets by `baseCode`; each rune is its own group (keyed by
   rune number).
2. For each group, produce a price tag string:
   - 1 entry -> median tag: `| 0.2 HR`
   - 2+ entries (only possible for shared unique/set bases) -> range tag spanning
     all entries: `| 5-120 HR` (low = min of contributing `low`, high = max of
     contributing `high`)
   - If any contributing entry has `sampleCount < 3`, append `?`: `| 0.2 HR?`
3. Sub-1 HR single values display with one decimal and a `~` prefix
   (`~0.2 HR`); ranges display without the prefix.
4. Generate one rule per group:
   ```
   ItemDisplay[UNI ID usk]: %NAME%%GOLD% | 0.2 HR%CONTINUE%
   ItemDisplay[SET ID xtb]: %NAME%%GOLD% | 5-120 HR?%CONTINUE%
   ItemDisplay[RUNE=30]: %NAME%%GOLD% | 3 HR%CONTINUE%
   ```
5. Strip any previously injected block, then inject the fresh block.

### Injection mechanism

The block is wrapped in delimiters:
```
// === PD2 PRICE TAGS (generated by pd2_lootfilter) START ===
... generated rules ...
// === PD2 PRICE TAGS (generated by pd2_lootfilter) END ===
```

On every run the tool first removes any existing delimited block, making re-runs
idempotent. The fresh block is inserted **high in the file**, after the
`ItemDisplayFilterName[]` declarations and before the first item rule.

The block uses the early-`%CONTINUE%` pattern that the Hiim filter already uses on
itself (e.g. line 76: `ItemDisplay[STAT206>0 SET]: %GREEN%%NAME%%CONTINUE%`). A
`%CONTINUE%` rule redefines what `%NAME%` expands to for all later rules, so the
priced name flows through the filter's existing decoration. The price therefore
appears inside any decoration the base filter applies
(`* Andariel's Visage | 0.2 HR *`). This is cosmetic and can be tuned after
in-game verification.

Two rejected alternatives:
- Rewriting each existing rule in place - fragile, requires parsing the base
  filter's rule bodies.
- Appending rules at the end - `%CONTINUE%` render semantics at end-of-file are
  unreliable; risks replacing the base filter's decoration.

## CLI

```
npx tsx src/index.ts [sourceFilterName] [--refresh-bases]
```

- `sourceFilterName` - default `Hiim_Crafting_Paladin_Focused.filter`.
- Reads from `C:\Program Files (x86)\Diablo II\ProjectD2\filters\online\<name>`.
- Writes to `C:\Program Files (x86)\Diablo II\ProjectD2\filters\local\<base>_stonks.filter`
  (suffix `_stonks` so the plain and priced versions coexist in the launcher's
  Local Filter list).
- Paths default to the standard install and are overridable via config constants.
- `--refresh-bases` forces a full base-code re-harvest.

On completion the tool prints a summary: uniques tagged, uniques shown as ranges,
sets tagged, runes tagged, items skipped.

## Usage workflow

1. Launcher updates `filters\online\Hiim_Crafting_Paladin_Focused.filter` on Play.
2. User runs `npx tsx src/index.ts`.
3. Tool writes `filters\local\Hiim_Crafting_Paladin_Focused_stonks.filter`.
4. User selects **Local Filter** in the launcher and picks the `_stonks` file.
5. When the filter author publishes an update, or to refresh prices, user re-runs.

## Testing

- `src/format.ts` and `src/decorate.ts` are pure and unit-tested with `vitest`:
  a small filter fixture plus synthetic price data covering single-unique,
  shared-base, low-sample, rune, and no-price cases.
- The rune-response parser in `src/runes.ts` is a pure function and unit-tested.
- Verify idempotency: decorating an already-decorated file produces the same output.
- In-game verification by the user confirms the `%CONTINUE%` chain renders prices
  correctly with the Hiim filter's decoration.

## Error handling

- Unique/set snapshot fetch failure -> abort with a clear message.
- Base-code harvest failure -> abort; cached progress is preserved for the next run;
  no output filter is written.
- A single rune price request failing -> that rune is skipped, the run continues
  (runes are non-critical).
- Source filter file missing -> abort, list available filters in `online\`.
- A priced item with no resolvable base code -> skipped, counted in the summary.
