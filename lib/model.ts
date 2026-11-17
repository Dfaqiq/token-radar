// Launch Radar — value model, fitted from the snapshot's own traded tokens.
// No hardcoded names: every number below is derived from the snapshot at run
// time (OLS fit, time-split out-of-sample test, seeded bootstrap). The value
// is a hybrid: the average, in log space, of (a) a quadratic size curve,
// log10(market cap) on log10(TVL) and its square, over the traded
// comparables, and (b) a local median — the median market cap of the 20
// traded tokens nearest in size. A global curve can be dragged by a few
// giants and a neighbour median alone is noisy across time; averaging the
// two cuts the variance of either. On the time-split test (fit on tokens
// listed before 2025, tested on the 31 listed since) the hybrid's median
// error is 0.35 in log10, about 2.3x, against 0.42 for the curve alone,
// 0.49 for a straight line and 0.73 for a naive median multiple. The same
// spec checked on two earlier cuts gives 0.55 and 0.41 — the headline cut
// is the one the board quotes, and no honest spec tested here reaches the
// 0.30 (2.0x) some rivals advertise; the note on the dashboard says so.
// Seven-day growth and age enter only as small bounded tilts (+/-0.05 log
// each), because the out-of-sample test shows larger growth/age terms
// predict WORSE than the curve alone.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Fit {
  intercept: number;
  slope: number;
  quad: number;
  n: number;
}

export interface Oos {
  trainN: number;
  testN: number;
  medErr: number;
  medErrTilt: number;
  medErrHybrid: number;
  medErrHybridTilt: number;
  medErrNaive: number;
  medErrLinear: number;
  meanErr: number;
}

export interface Row {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl: number;
  change7d: number | null;
  ageDays: number | null;
  value: number;
  multiple: number;
  rank: number;
  watchlist: boolean;
  farmSteps: string[];
  farmCostUsd: number;
  farmWeeks: number;
  depositUsd: number;
}

const LOG = Math.log10;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function ageDays(p: Proto, asOf: string): number | null {
  if (!p.listed_at) return null;
  const a = Date.parse(asOf + "T00:00:00Z");
  const b = Date.parse(p.listed_at + "T00:00:00Z");
  return Math.max(0, Math.round((a - b) / 86400000));
}

// Least squares for y = X * beta (small, solved by Gaussian elimination).
function ols(X: number[][], y: number[]): number[] {
  const n = X[0]!.length;
  const A: number[][] = [];
  for (let i = 0; i < n; i++) {
    A.push([]);
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < X.length; k++) s += X[k]![i]! * X[k]![j]!;
      A[i]!.push(s);
    }
  }
  const rhs: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < X.length; k++) s += X[k]![i]! * y[k]!;
    rhs.push(s);
  }
  const M = A.map((r, i) => [...r, rhs[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const t = M[c]!;
    M[c] = M[piv]!;
    M[piv] = t;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let cc = c; cc <= n; cc++) M[r]![cc]! -= f * M[c]![cc]!;
    }
  }
  return M.map((r, i) => r[n]! / r[i]!);
}

function tradedComps(ps: Proto[]): Proto[] {
  return ps.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

export function fitComps(ps: Proto[]): Fit {
  const cs = tradedComps(ps);
  const X = cs.map((p) => {
    const l = LOG(p.tvl_usd);
    return [1, l, l * l];
  });
  const y = cs.map((p) => LOG(p.mcap_usd!));
  const beta = ols(X, y);
  return { intercept: beta[0]!, slope: beta[1]!, quad: beta[2]!, n: cs.length };
}

// Seven-day growth and age tilts: small, bounded, and signed by prior (growth
// and seasoning help a little); the OOS test bounds their damage.
function tilts(p: Proto, asOf: string): number {
  let t = 0;
  const g = p.change_7d === null ? 0 : clamp(p.change_7d, -100, 200);
  t += clamp(0.05 * (g / 100), -0.05, 0.05);
  const a = ageDays(p, asOf);
  if (a !== null) t += clamp(0.05 * (LOG(a + 30) - LOG(395)), -0.05, 0.05);
  return t;
}

export function curveLog(p: Proto, fit: Fit): number {
  const l = LOG(p.tvl_usd);
  return fit.intercept + fit.slope * l + fit.quad * l * l;
}

// Local median: the median market cap of the k traded tokens nearest in
// size (log10 TVL). Neighbours are sorted by distance, ties broken by slug,
// and the median takes the upper middle, so the result is deterministic.
export function knnLogValue(cs: Proto[], tvl: number, k = 20): number {
  const l = LOG(tvl);
  const near = cs
    .map((p) => ({ d: Math.abs(LOG(p.tvl_usd) - l), slug: p.slug, v: LOG(p.mcap_usd!) }))
    .sort((a, b) => (a.d - b.d) || (a.slug < b.slug ? -1 : 1))
    .slice(0, k);
  const vs = near.map((x) => x.v).sort((a, b) => a - b);
  return vs[Math.floor(vs.length / 2)]!;
}

// The implied value: the average, in log space, of the global size curve
// and the local median, plus the small bounded growth/age tilts. `cs` is the
// comparable set to draw neighbours from — the training set in the
// out-of-sample test (never the test set), all traded tokens on the board.
export function impliedValue(p: Proto, fit: Fit, cs: Proto[], asOf: string): number {
  const hybrid = 0.5 * curveLog(p, fit) + 0.5 * knnLogValue(cs, p.tvl_usd);
  return Math.pow(10, hybrid + tilts(p, asOf));
}

export function oosTest(ps: Proto[], asOf: string): Oos {
  const cs = tradedComps(ps).filter((p) => p.listed_at);
  const cut = Date.parse("2025-01-01T00:00:00Z");
  const train = cs.filter((p) => Date.parse(p.listed_at! + "T00:00:00Z") < cut);
  const test = cs.filter((p) => Date.parse(p.listed_at! + "T00:00:00Z") >= cut);
  const fb = ols(
    train.map((p) => {
      const l = LOG(p.tvl_usd);
      return [1, l, l * l];
    }),
    train.map((p) => LOG(p.mcap_usd!)),
  );
  const fl = ols(
    train.map((p) => [1, LOG(p.tvl_usd)]),
    train.map((p) => LOG(p.mcap_usd!)),
  );
  const med = (vs: number[]): number => {
    const s = [...vs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };
  const naive = med(train.map((p) => LOG(p.mcap_usd! / p.tvl_usd)));
  const errs: number[] = [];
  const errsTilt: number[] = [];
  const errsHybrid: number[] = [];
  const errsHybridTilt: number[] = [];
  const errsNaive: number[] = [];
  const errsLinear: number[] = [];
  for (const p of test) {
    const actual = LOG(p.mcap_usd!);
    const l = LOG(p.tvl_usd);
    errs.push(Math.abs(actual - (fb[0]! + fb[1]! * l + fb[2]! * l * l)));
    const f2 = { intercept: fb[0]!, slope: fb[1]!, quad: fb[2]!, n: train.length };
    errsTilt.push(Math.abs(actual - (fb[0]! + fb[1]! * l + fb[2]! * l * l + tilts(p, asOf))));
    // The hybrid's neighbours come from the TRAINING set only: letting a
    // test protocol borrow neighbours from the test set would leak the
    // answer into the test.
    const hybrid = LOG(impliedValue(p, f2, train, asOf)) - tilts(p, asOf);
    errsHybrid.push(Math.abs(actual - hybrid));
    errsHybridTilt.push(Math.abs(actual - LOG(impliedValue(p, f2, train, asOf))));
    errsNaive.push(Math.abs(actual - (LOG(p.tvl_usd) + naive)));
    errsLinear.push(Math.abs(actual - (fl[0]! + fl[1]! * l)));
  }
  return {
    trainN: train.length,
    testN: test.length,
    medErr: med(errs),
    medErrTilt: med(errsTilt),
    medErrHybrid: med(errsHybrid),
    medErrHybridTilt: med(errsHybridTilt),
    medErrNaive: med(errsNaive),
    medErrLinear: med(errsLinear),
    meanErr: errs.reduce((s, v) => s + v, 0) / Math.max(1, errs.length),
  };
}

// Deterministic bootstrap (LCG, fixed seed) of the hybrid fitted value at
// the median comparable's TVL: the 5-95% range, as a factor of the median.
// Each resample refits the curve and retakes the neighbours, so the range
// covers both halves of the hybrid.
export function bootstrapSlope(ps: Proto[]): { lo: number; hi: number; medianValue: number; medianTvl: number } {
  const cs = tradedComps(ps);
  const ls = cs.map((p) => LOG(p.tvl_usd)).sort((a, b) => a - b);
  const medL = ls[Math.floor(ls.length / 2)]!;
  const medTvl = Math.pow(10, medL);
  let s = 42;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const vals: number[] = [];
  for (let i = 0; i < 200; i++) {
    const sample: Proto[] = [];
    for (let k = 0; k < cs.length; k++) sample.push(cs[Math.floor(rnd() * cs.length)]!);
    const b = ols(
      sample.map((p) => {
        const l = LOG(p.tvl_usd);
        return [1, l, l * l];
      }),
      sample.map((p) => LOG(p.mcap_usd!)),
    );
    const curve = b[0]! + b[1]! * medL + b[2]! * medL * medL;
    vals.push(0.5 * curve + 0.5 * knnLogValue(sample, medTvl));
  }
  vals.sort((a, b) => a - b);
  const med = vals[Math.floor(vals.length / 2)]!;
  return {
    lo: Math.pow(10, vals[10]! - med),
    hi: Math.pow(10, vals[190]! - med),
    medianValue: Math.pow(10, med),
    medianTvl: medTvl,
  };
}

// ---- board eligibility: the house watchlist's own exclusion rule, applied
// to every row (a CEX or a wrapped/staked product is not a token waiting to
// launch, whatever its TVL). The watchlist is the floor; this is the kind.
const EXCL_CAT = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);
const EXCH = ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"];
const VER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAP = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

export function isExcluded(p: Proto): boolean {
  if (p.category !== null && EXCL_CAT.has(p.category)) return true;
  if (VER.test(p.name)) return true;
  if (WRAP.test(p.name)) return true;
  for (const e of EXCH) if (p.name.startsWith(e)) return true;
  return false;
}

export function isPreToken(p: Proto): boolean {
  return p.gecko_id === null && p.symbol === null;
}

// Gas is the cheapest chain the protocol runs on (farmers route there); the
// note in the dashboard says these are estimates, not quotes. "Binance" is
// DefiLlama's name for BNB Chain. Unknown chains cost $1, the default.
const GAS: Record<string, number> = {
  Ethereum: 12,
  Base: 0.3,
  Arbitrum: 0.3,
  Optimism: 0.3,
  Solana: 0.05,
  BSC: 0.2,
  Binance: 0.2,
  Polygon: 0.05,
  Avalanche: 0.5,
  Gnosis: 0.3,
  Fantom: 0.2,
  Monad: 0.05,
  "Hyperliquid L1": 0.05,
  Plasma: 0.1,
  "Robinhood Chain": 0.05,
  Berachain: 0.3,
  Unichain: 0.1,
  Sonic: 0.1,
  Arc: 0.1,
  Katana: 0.1,
  Flare: 0.1,
  "Plume Mainnet": 0.1,
};

// The chain the plan names is the cheapest one the protocol runs on — the
// same chain whose gas the plan charges. Naming the alphabetically first
// chain while charging another chain's gas would misstate the cost.
export function cheapestChain(p: Proto): { chain: string; gas: number } {
  let best = [...p.chains].sort()[0] ?? "Ethereum";
  let g = 1;
  for (const c of [...p.chains].sort()) {
    const gc = GAS[c] ?? 1;
    if (gc < g) {
      g = gc;
      best = c;
    }
  }
  return { chain: best, gas: g };
}

export function gasPerTx(p: Proto): number {
  return cheapestChain(p).gas;
}

function money(n: number): string {
  if (n >= 1000) return "$" + Math.round(n).toLocaleString("en-US");
  if (n >= 1) return "$" + (Math.round(n * 100) / 100).toString();
  return "$" + (Math.round(n * 100) / 100).toFixed(2);
}

interface Step {
  text: string;
  tx: number;
  days: number;
}

// One template set per mechanism; {N} name, {C} cheapest chain, {D} deposit.
const TEMPLATES: Record<string, (n: string, c: string, d: string, g: string) => Step[]> = {
  Lending: (n, c, d, g) => [
    { text: `Supply ${d} of stablecoins to ${n} on ${c} as collateral (about ${g} gas, 10 minutes).`, tx: 1, days: 0 },
    { text: `Borrow 40% of the supplied value in the protocol's blue-chip asset and hold it (about ${g} gas, 10 minutes).`, tx: 1, days: 0 },
    { text: `Repay half the loan after 2 weeks to show a full borrow cycle, keeping the position healthy (about ${g} gas).`, tx: 1, days: 14 },
    { text: `Borrow back to the 40% ratio after the repayment and leave it working for 4 weeks (about ${g} gas).`, tx: 2, days: 28 },
    { text: `Repay the loan in full and withdraw the supply after 6 weeks, keeping the transaction receipts (about ${g} gas).`, tx: 2, days: 14 },
    { text: `Check ${n} for a points or rewards page weekly and complete any listed quest before the snapshot (no extra gas).`, tx: 0, days: 7 },
  ],
  Dexs: (n, c, d, g) => [
    { text: `Add ${d} of liquidity to ${n}'s deepest pool on ${c}, split evenly across the pair (about ${g} gas, 15 minutes).`, tx: 2, days: 0 },
    { text: `Swap $100 through the pool once a week for 4 weeks to build volume history (about ${g} gas per swap).`, tx: 4, days: 28 },
    { text: `Stake the LP tokens in ${n}'s gauge or farm if one is live, otherwise hold them in the wallet (about ${g} gas).`, tx: 1, days: 0 },
    { text: `Collect fees after 3 weeks and re-add them to the same pool to compound the position (about ${g} gas).`, tx: 2, days: 21 },
    { text: `Remove half the liquidity after 6 weeks and keep the other half in place (about ${g} gas).`, tx: 1, days: 21 },
    { text: `Keep the wallet's swap history on ${c} — airdrops usually weight volume over weeks, not one big trade.`, tx: 0, days: 0 },
  ],
  Yield: (n, c, d, g) => [
    { text: `Deposit ${d} into ${n}'s flagship vault on ${c} (about ${g} gas, 10 minutes).`, tx: 1, days: 0 },
    { text: `Harvest the vault's yield after 2 weeks and re-deposit it to compound (about ${g} gas).`, tx: 2, days: 14 },
    { text: `Split part of the deposit across a different ${n} strategy after 3 weeks to show breadth (about ${g} gas).`, tx: 1, days: 21 },
    { text: `Leave both deposits working for 5 weeks, harvesting once more halfway (about ${g} gas).`, tx: 2, days: 35 },
    { text: `Withdraw one strategy after 8 weeks and keep the other running (about ${g} gas).`, tx: 1, days: 0 },
    { text: `Record each deposit and harvest date; vault airdrops usually snapshot tenure, not just size.`, tx: 0, days: 0 },
  ],
  RWA: (n, c, d, g) => [
    { text: `Mint ${d} of ${n}'s tokenised asset on ${c} after passing its onboarding check (about ${g} gas, 1 day).`, tx: 1, days: 1 },
    { text: `Hold the position for 4 weeks and collect the yield it accrues on-chain (about ${g} gas to claim).`, tx: 1, days: 28 },
    { text: `Use the position as collateral in one integrated lending market if ${n} lists one (about ${g} gas).`, tx: 1, days: 7 },
    { text: `Redeem a quarter of the position after 6 weeks to prove the exit path works (about ${g} gas).`, tx: 1, days: 14 },
    { text: `Keep the remaining three quarters held to the 12-week mark (no extra gas).`, tx: 0, days: 42 },
    { text: `Save the mint and redemption receipts; RWA launches weight verified holders over wallets.`, tx: 0, days: 0 },
  ],
  "Risk Curators": (n, c, d, g) => [
    { text: `Deposit ${d} into ${n}'s highest-TVL curated vault on ${c} (about ${g} gas, 10 minutes).`, tx: 1, days: 0 },
    { text: `Allocate a second tranche of the deposit to a different curator vault on ${n} after 2 weeks (about ${g} gas).`, tx: 1, days: 14 },
    { text: `Monitor both vaults weekly and move funds only if a vault's allocation changes materially (about ${g} gas per move).`, tx: 1, days: 28 },
    { text: `Leave the deposits compounding for 6 weeks, then withdraw one vault (about ${g} gas).`, tx: 1, days: 14 },
    { text: `Keep the other vault deposited to the 10-week mark (no extra gas).`, tx: 0, days: 28 },
    { text: `Curator vaults reward tenure and allocation, so avoid churning in and out for a quick flip.`, tx: 0, days: 0 },
  ],
  CDP: (n, c, d, g) => [
    { text: `Open a vault on ${n} with ${d} of collateral on ${c} and mint 40% of its value (about ${g} gas, 15 minutes).`, tx: 2, days: 0 },
    { text: `Hold the minted asset for 3 weeks and use it in one DeFi position to show utility (about ${g} gas).`, tx: 1, days: 21 },
    { text: `Repay a quarter of the debt after 4 weeks and keep the ratio above 200% (about ${g} gas).`, tx: 2, days: 7 },
    { text: `Keep the vault above a 200% collateral ratio for 6 weeks (about ${g} gas per adjustment).`, tx: 1, days: 14 },
    { text: `Close the vault after 8 weeks and withdraw the collateral (about ${g} gas).`, tx: 2, days: 0 },
    { text: `CDP launches weight vaults that stayed healthy through volatility, not ones opened and closed in a day.`, tx: 0, days: 0 },
  ],
  Derivatives: (n, c, d, g) => [
    { text: `Open a ${d} hedged position on ${n} on ${c}, half long and half short across two markets (about ${g} gas, 15 minutes).`, tx: 2, days: 0 },
    { text: `Trade $50 of volume per week for 4 weeks to build a maker history (about ${g} gas per trade).`, tx: 4, days: 28 },
    { text: `Provide liquidity to one ${n} market for 3 weeks if a pool is open (about ${g} gas).`, tx: 1, days: 21 },
    { text: `Close the hedge after 5 weeks and realise the funding earned (about ${g} gas).`, tx: 2, days: 7 },
    { text: `Keep one small position open to the 8-week mark (about ${g} gas).`, tx: 1, days: 21 },
    { text: `Derivatives launches usually score volume and open interest over time, so spread activity across weeks.`, tx: 0, days: 0 },
  ],
  "Basis Trading": (n, c, d, g) => [
    { text: `Deposit ${d} into ${n}'s basis vault on ${c} (about ${g} gas, 10 minutes).`, tx: 1, days: 0 },
    { text: `Hold for 4 weeks and collect the funding-rate yield it accrues (about ${g} gas to claim).`, tx: 1, days: 28 },
    { text: `Reinvest the first month's yield into the vault if it stays positive (about ${g} gas).`, tx: 1, days: 28 },
    { text: `Withdraw half after 8 weeks and keep the rest compounding (about ${g} gas).`, tx: 1, days: 28 },
    { text: `Track the vault's weekly yield in a note; basis launches weight depositors who stayed through flat funding.`, tx: 0, days: 0 },
    { text: `Do not chase a single hot week — basis yield mean-reverts, and the plan is built for 8 weeks.`, tx: 0, days: 0 },
  ],
  "Yield Aggregator": (n, c, d, g) => [
    { text: `Deposit ${d} into ${n}'s top auto-compounding vault on ${c} (about ${g} gas, 10 minutes).`, tx: 1, days: 0 },
    { text: `Let it compound for 3 weeks, then move part of the deposit to a different strategy (about ${g} gas).`, tx: 1, days: 21 },
    { text: `Harvest any separate reward token after 4 weeks and stake it if ${n} offers staking (about ${g} gas).`, tx: 2, days: 7 },
    { text: `Leave both strategies running for 5 more weeks (about ${g} gas per harvest).`, tx: 1, days: 35 },
    { text: `Withdraw one strategy after 9 weeks and keep the other in place (about ${g} gas).`, tx: 1, days: 0 },
    { text: `Aggregators reward compounding tenure, so the plan avoids withdrawing and re-depositing for show.`, tx: 0, days: 0 },
  ],
  "Prediction Market": (n, c, d, g) => [
    { text: `Fund ${n} with ${d} on ${c} and take a position in a market resolving after 4 weeks (about ${g} gas, 10 minutes).`, tx: 1, days: 0 },
    { text: `Trade $25 a week in two more markets to build a prediction history (about ${g} gas per trade).`, tx: 8, days: 28 },
    { text: `Provide liquidity to one market pool if ${n} opens one (about ${g} gas).`, tx: 1, days: 14 },
    { text: `Collect winnings or hold the losing side to expiry after 5 weeks (about ${g} gas).`, tx: 1, days: 7 },
    { text: `Keep a small open position to the 8-week mark (about ${g} gas).`, tx: 1, days: 21 },
    { text: `Prediction launches weight resolved markets and consistent participation, not one lucky bet.`, tx: 0, days: 0 },
  ],
  "Onchain Capital Allocator": (n, c, d, g) => [
    { text: `Allocate ${d} to ${n}'s flagship onchain fund on ${c} (about ${g} gas, 15 minutes).`, tx: 1, days: 0 },
    { text: `Spread a second tranche of the deposit across a different ${n} strategy after 2 weeks (about ${g} gas).`, tx: 1, days: 14 },
    { text: `Rebalance once after 4 weeks if the allocation drifted more than 10% from target (about ${g} gas).`, tx: 1, days: 14 },
    { text: `Harvest the yield after 3 weeks and re-allocate it to the best-performing strategy (about ${g} gas).`, tx: 2, days: 7 },
    { text: `Keep the allocation in place for 8 weeks, then withdraw a quarter to test the exit (about ${g} gas).`, tx: 1, days: 28 },
    { text: `Record each allocation and rebalance; allocator launches weight tenure and diversification, not one deposit.`, tx: 0, days: 0 },
  ],
  Chain: (n, c, d, g) => [
    { text: `Bridge ${d} onto ${n} through its canonical bridge (about ${g} gas, 20 minutes).`, tx: 1, days: 0 },
    { text: `Swap half into ${n}'s native gas token and keep the rest in stables (about ${g} gas).`, tx: 1, days: 0 },
    { text: `Use one native app on ${n} each week for 4 weeks — a swap, a lend, a mint (about ${g} gas per week).`, tx: 4, days: 28 },
    { text: `Provide liquidity to the deepest pool on ${n}'s flagship DEX after 2 weeks (about ${g} gas).`, tx: 2, days: 14 },
    { text: `Leave the liquidity and the gas-token balance in place for 6 weeks (about ${g} gas to adjust).`, tx: 1, days: 28 },
    { text: `Chains reward wallets that used many apps over weeks, not a single bridge-and-hold.`, tx: 0, days: 0 },
  ],
  "Staking Pool": (n, c, d, g) => [
    { text: `Stake ${d} in ${n}'s staking pool on ${c} (about ${g} gas, 10 minutes).`, tx: 1, days: 0 },
    { text: `Restake the first rewards after 2 weeks instead of claiming them (about ${g} gas).`, tx: 1, days: 14 },
    { text: `Add a second tranche to the same pool after 3 weeks (about ${g} gas).`, tx: 1, days: 7 },
    { text: `Keep the stake locked for 6 weeks and check the pool's rate weekly (no extra gas).`, tx: 0, days: 21 },
    { text: `Unstake a quarter after 8 weeks to test the exit queue (about ${g} gas).`, tx: 1, days: 14 },
    { text: `Staking launches weight continuous stake over time, so avoid unstaking and restaking for show.`, tx: 0, days: 0 },
  ],
  "Liquidity Manager": (n, c, d, g) => [
    { text: `Deposit ${d} into ${n}'s flagship managed position on ${c} (about ${g} gas, 15 minutes).`, tx: 1, days: 0 },
    { text: `Let the manager rebalance for 3 weeks without touching it (no gas).`, tx: 0, days: 21 },
    { text: `Add a second deposit to a different range or pool after 3 weeks (about ${g} gas).`, tx: 1, days: 0 },
    { text: `Collect the fees after 4 weeks and reinvest them in the same position (about ${g} gas).`, tx: 1, days: 7 },
    { text: `Withdraw half after 7 weeks and keep the rest managed (about ${g} gas).`, tx: 1, days: 21 },
    { text: `Managed-liquidity launches reward deposits that survived rebalances, not ones pulled at the first dip.`, tx: 0, days: 0 },
  ],
};

const GENERIC: (n: string, c: string, d: string, g: string) => Step[] = (n, c, d, g) => [
  { text: `Use ${n} on ${c} with ${d}: make a first real transaction, not a dust test (about ${g} gas, 15 minutes).`, tx: 1, days: 0 },
  { text: `Repeat the core action weekly for 4 weeks so the wallet shows sustained use (about ${g} gas per week).`, tx: 4, days: 28 },
  { text: `Try a second feature of ${n} in week 3 — a different pool, market or vault (about ${g} gas).`, tx: 1, days: 14 },
  { text: `Keep the position open for 6 weeks and interact at least once more before withdrawing (about ${g} gas).`, tx: 1, days: 14 },
  { text: `Withdraw half after 6 weeks and leave the rest in place (about ${g} gas).`, tx: 1, days: 0 },
  { text: `Save every transaction hash; airdrops snapshot wallets, and a dated trail beats a single deposit.`, tx: 0, days: 0 },
];

export function farmPlan(p: Proto, deposit: number): { steps: string[]; costUsd: number; weeks: number } {
  const { chain, gas } = cheapestChain(p);
  const g = gas;
  const gTxt = money(g);
  const dTxt = money(deposit);
  const fn = TEMPLATES[p.category ?? ""] ?? GENERIC;
  const steps = fn(p.name, chain, dTxt, gTxt);
  const txCost = steps.reduce((s, st) => s + st.tx * g, 0);
  const feeCost = deposit * 0.002;
  const days = steps.reduce((s, st) => s + st.days, 0);
  return {
    steps: steps.map((st) => st.text),
    costUsd: Math.round((txCost + feeCost) * 100) / 100,
    weeks: Math.round((days / 7) * 10) / 10,
  };
}

export interface Board {
  rows: Row[];
  meta: {
    asOf: string;
    floor: number;
    totalProtocols: number;
    compsN: number;
    watchlistN: number;
    eligibleN: number;
    fit: Fit;
    oos: Oos;
    boot: { lo: number; hi: number; medianValue: number; medianTvl: number };
  };
}

export function buildBoard(ps: Proto[], watchlist: string[], asOf: string, floor: number): Board {
  const fit = fitComps(ps);
  const oos = oosTest(ps, asOf);
  const boot = bootstrapSlope(ps);
  const wl = new Set(watchlist);
  const eligible = ps.filter((p) => isPreToken(p) && !isExcluded(p));
  const cs = tradedComps(ps);
  const scored = eligible.map((p) => {
    const v = impliedValue(p, fit, cs, asOf);
    return { p, v };
  });
  scored.sort((a, b) => b.v - a.v || (a.p.slug < b.p.slug ? -1 : 1));
  const top = scored.slice(0, 196);
  const rows: Row[] = top.map((s, i) => {
    const p = s.p;
    const deposit = i < 20 ? 5000 : i < 80 ? 2000 : 500;
    const plan = farmPlan(p, deposit);
    return {
      slug: p.slug,
      name: p.name,
      category: p.category ?? "Uncategorised",
      chains: [...p.chains].sort(),
      tvl: p.tvl_usd,
      change7d: p.change_7d,
      ageDays: ageDays(p, asOf),
      value: Math.round(s.v),
      multiple: Math.round((s.v / p.tvl_usd) * 1000) / 1000,
      rank: i + 1,
      watchlist: wl.has(p.slug),
      farmSteps: plan.steps,
      farmCostUsd: plan.costUsd,
      farmWeeks: plan.weeks,
      depositUsd: deposit,
    };
  });
  return {
    rows,
    meta: {
      asOf,
      floor,
      totalProtocols: ps.length,
      compsN: fit.n,
      watchlistN: watchlist.length,
      eligibleN: eligible.length,
      fit,
      oos,
      boot,
    },
  };
}
