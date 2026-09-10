# PD2 Price Filter

Injects live market prices into a Project Diablo 2 loot filter, so the ground label tells you what an item is worth before you pick it up.

[![Tests](https://github.com/314159DD/pd2-price-filter/actions/workflows/test.yml/badge.svg)](https://github.com/314159DD/pd2-price-filter/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Node 18+](https://img.shields.io/badge/Node-18%2B-339933?logo=node.js&logoColor=white)

```
Griswold's Valor | 0.1 HR
Ber Rune | 2.4 HR
```

Identified uniques, set items, runes, and uber materials get a price tag (median sale price over the last 30 days, in High Runes). Healing, mana, and rejuvenation potions are forced visible at every filter strictness as small symbols, overriding the source filter's potion-hiding rules.

## How it works

```
source filter (online/)          pd2trader.com (30-day sales)        pd2-aggregator snapshot
        |                                  |                                   |
        |                          median per item, per mode          roster of uniques / sets
        |                                  |                                   |
        +---------------> decorate: rewrite ItemDisplay rules <----------------+
                                           |
                     filters/local/HC_Stonks_<name>.filter  (or SC_Stonks_)
```

- **Prices** are the median of recorded sales on pd2trader over a 30-day window. Hardcore and softcore are priced separately. A run targets one mode.
- **Roster** of which uniques and set items exist comes from the [pd2-aggregator](https://github.com/314159DD/pd2-aggregator) snapshot. Filter base codes are harvested from the PD2 market API and cached in `data/base-codes.json`.
- **Cache**: prices are cached per mode with a 24-hour freshness window (`data/price-cache-hc.json`, `data/price-cache-sc.json`). The first run takes a few minutes. A same-day re-run is near-instant.
- **Fixed items**: `data/pd2trader-items.json` is the curated list of runes and uber materials. Add an entry (`name`, `condition`, `category`) to price any other fixed item.
- **Potion block**: a static display block is injected after decoration so potions show at every level.

## Usage

```
npm install
npm run decorate                        # hardcore filter (default)
npm run decorate -- --softcore          # softcore filter
npm run decorate -- SomeOther.filter    # a different source filter
npm run decorate -- --refresh-prices    # ignore the price cache, refetch all
npm run decorate -- --refresh-bases     # full base-code re-harvest
```

The tool reads the source filter from `C:\Program Files (x86)\Diablo II\ProjectD2\filters\online\` and writes the decorated copy to `...\filters\local\HC_Stonks_<name>.filter` (`SC_Stonks_` in softcore). Select it in the launcher via **Local Filter**.

Requires Node 18 or newer and a Project Diablo 2 install.

## Limitations

- Identified uniques, set items, runes, and uber materials only. Rares, magics, and bases are untouched.
- A base shared by multiple uniques shows a combined price range.
- Ladder prices only.

## Development

```
npm test              # vitest: parser, formatter, price cache, pd2trader client, snapshot test
npm run typecheck
```

Design notes for the three iterations (price decorator, pricing rework, potion block and median-only pricing) are in `docs/design/`.

## License

MIT. See [LICENSE](LICENSE).
