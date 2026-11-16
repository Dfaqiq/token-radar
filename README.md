[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Dfaqiq/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Dfaqiq/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Launch Radar

Build the best token launch radar. Read a sealed snapshot of every protocol DefiLlama tracks, work out which ones still record no token and are not a wrapped or staked product of one that trades, and rank them by what their launch would be worth; then hand in a web dashboard that shows the board, a detail view for each protocol and the steps to farm it.

Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## How the value is priced

The implied value is fitted from the snapshot itself, never from a list of names. The comparables are the 128 protocols in the snapshot that already trade:

```
log10(market cap) = 4.37 + 0.19 × log10(TVL) + 0.020 × log10(TVL)²
```

The size curve bends upward — its effective slope runs from 0.47 at $10M of TVL to 0.60 at $10B — but it stays below 1, so bigger TVL is still worth proportionally less per dollar.

A time-split out-of-sample test (fit on tokens listed before 2025, tested on the 31 listed since) gives a median error of 0.43 in log10 — about 2.7× — against 0.49 for a straight line and 0.73 for a naive median multiple. Seven-day growth and age enter only as small bounded tilts (±0.05 log each): larger growth or age terms predicted *worse* out of sample, so the radar refuses to chase a hot week. The fitted value is stable under a 200-resample bootstrap: at the median comparable's TVL the fitted value is $8.6M, 5–95% ×0.70–×1.50.

The board applies the house watchlist's own exclusion rule to every row: no exchanges, no bridges, no wrapped or staked products — a CEX is not a token waiting to launch. That leaves 198 eligible pre-token protocols; the board ranks the top 196 by implied value ($94.4M down to $3.5M).

## Farm plans

Plans are mechanism-aware: lending, DEX, vault, RWA, risk curators, CDP, derivatives, basis trading, yield aggregators and prediction markets each get different steps. Every step names its action, its gas cost on the cheapest chain the protocol runs on, and its time; each plan totals its net cost in dollars and its length in weeks. The deposit itself is not a cost — it comes back.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

`main.ts` reads the snapshot, writes `board.json`, writes the dashboard's `data.js` beside the page, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` with `buildDossier` from `vendor/makefun-board.ts`. Node 22, standard library only; two runs produce the same bytes.

## Layout

- `main.ts` — entry program: snapshot in, board + dashboard data + dossier out.
- `lib/model.ts` — the fitted model (OLS, out-of-sample test, bootstrap), the exclusion rule, and the mechanism-aware farm plans.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js` (renders `data.js`; sortable and filterable board, detail view per protocol, comparables table).
- `screenshots/` — board, protocol detail, and filtered views of the dashboard.
- `vendor/makefun-board.ts` — the kit's dossier library, unchanged.

## What it is not

Implied values are model estimates from one snapshot, not price predictions. Farm costs are estimates; gas and fees move. No funds, no wallet, no network calls.
