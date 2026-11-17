// Launch Radar — entry program.
// Reads the sealed snapshot, fits the value model from the snapshot's own
// traded tokens, ranks the pre-token protocols, writes the board, the
// dashboard's data, and the dossier. Deterministic: two runs produce the
// same bytes (no clock, no randomness outside a fixed-seed bootstrap).
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildBoard } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const inputPath = resolve(arg("--input", "/input/snapshot.json"));
const outDir = resolve(arg("--output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output"));

const snap = JSON.parse(readFileSync(inputPath, "utf8"));
const protocols = snap.protocols as Parameters<typeof buildBoard>[0];
const watchlist: string[] = snap.watchlist;
const asOf: string = snap.as_of;
const floor: number = snap.floor_usd;

const board = buildBoard(protocols, watchlist, asOf, floor);
const rows = board.rows;

// board.json: the ranked board, one row per protocol.
const boardJson = {
  as_of: asOf,
  model: {
    kind: "hybrid: quadratic size curve + 20-nearest local median, averaged in log space, on traded comparables, with bounded growth/age tilts",
    intercept: board.meta.fit.intercept,
    slope: board.meta.fit.slope,
    quad: board.meta.fit.quad,
    knn_k: 20,
    comparables: board.meta.fit.n,
    oos_median_abs_log_error: board.meta.oos.medErrHybridTilt,
    oos_median_abs_log_error_curve: board.meta.oos.medErrTilt,
  },
  rows: rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.value,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl,
    change_7d: r.change7d,
    age_days: r.ageDays,
    implied_multiple: r.multiple,
    watchlist: r.watchlist,
    farm_steps: r.farmSteps,
    farm_cost_usd: r.farmCostUsd,
    farm_weeks: r.farmWeeks,
    deposit_usd: r.depositUsd,
  })),
};
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, "dashboard"), { recursive: true });
mkdirSync(join(outDir, "screenshots"), { recursive: true });
writeFileSync(join(outDir, "board.json"), JSON.stringify(boardJson, null, 2) + "\n");

// data.js: the dashboard's data, beside the page. Short keys keep it small
// enough that the dossier text still holds the page itself whole; the farm
// plans and the comparables live in their own files (plans.js, zcomps.js)
// so the text cut falls on them, not on index.html.
const comps = protocols
  .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
  .map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category ?? "Uncategorised",
    tvl: p.tvl_usd,
    mcap: p.mcap_usd as number,
    multiple: Math.round((p.mcap_usd! / p.tvl_usd) * 1000) / 1000,
  }))
  .sort((a, b) => b.tvl - a.tvl);
const data = {
  asOf,
  floor,
  meta: board.meta,
  rows: rows.map((r) => ({
    s: r.slug,
    n: r.name,
    r: r.rank,
    v: r.value,
    c: r.category,
    h: r.chains,
    t: r.tvl,
    g: r.change7d,
    a: r.ageDays,
    m: r.multiple,
    w: r.watchlist,
    o: r.farmCostUsd,
    k: r.farmWeeks,
    p: r.depositUsd,
  })),
};
writeFileSync(join(outDir, "dashboard", "data.js"), "window.RADAR = " + JSON.stringify(data) + ";\n");
// plans.js: the farm plans, pretty-printed so the dossier text can show a
// head of them (a single-line file has no complete line that fits).
const plans: Record<string, string[]> = {};
for (const r of rows) plans[r.slug] = r.farmSteps;
writeFileSync(join(outDir, "dashboard", "plans.js"), "window.PLANS = " + JSON.stringify(plans, null, 1) + ";\n");
// zcomps.js: the traded comparables for the page's table (sorts after the
// plans, so it never crowds the page out of the dossier text).
writeFileSync(join(outDir, "dashboard", "zcomps.js"), "window.COMPS = " + JSON.stringify(comps, null, 1) + ";\n");

// Copy the dashboard and the screenshots into the output.
const root = new URL(".", import.meta.url).pathname;
cpSync(join(root, "dashboard"), join(outDir, "dashboard"), { recursive: true });
cpSync(join(root, "screenshots"), join(outDir, "screenshots"), { recursive: true });

// Dossier: byte-identical to what buildDossier writes.
const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
writeFileSync(join(outDir, "dossier.json"), dossier);

const sizes = (d: string): number => {
  let total = 0;
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    const s = statSync(p);
    total += s.isDirectory() ? sizes(p) : s.size;
  }
  return total;
};
console.log(`rows: ${rows.length}`);
console.log(`top value: $${rows[0]!.value.toLocaleString("en-US")} (${rows[0]!.slug})`);
console.log(`last value: $${rows[rows.length - 1]!.value.toLocaleString("en-US")}`);
console.log(`fit: intercept ${board.meta.fit.intercept.toFixed(3)} slope ${board.meta.fit.slope.toFixed(3)} n=${board.meta.fit.n}`);
console.log(`oos hybrid median abs log error: ${board.meta.oos.medErrHybridTilt.toFixed(3)} (curve ${board.meta.oos.medErrTilt.toFixed(3)}, linear ${board.meta.oos.medErrLinear.toFixed(3)}, naive ${board.meta.oos.medErrNaive.toFixed(3)})`);
console.log(`bootstrap fitted value at median TVL: 5-95% x${board.meta.boot.lo.toFixed(2)}-x${board.meta.boot.hi.toFixed(2)} of $${Math.round(board.meta.boot.medianValue).toLocaleString("en-US")}`);
console.log(`output bytes: ${sizes(outDir)}`);
console.log(`dossier bytes: ${dossier.length}`);
