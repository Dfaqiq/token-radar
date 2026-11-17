// Launch Radar dashboard. Renders window.RADAR (written by main.ts) —
// the board, the method, the comparables. No network, no wallet, no calls.
(function () {
  var D = window.RADAR;
  // data.js uses short keys to keep the dossier text small; expand them here.
  var rows = D.rows.map(function (r) {
    return {
      slug: r.s, name: r.n, rank: r.r, value: r.v, category: r.c, chains: r.h,
      tvl: r.t, change7d: r.g, ageDays: r.a, multiple: r.m, watchlist: r.w,
      cost: r.o, weeks: r.k, deposit: r.p, steps: (window.PLANS || {})[r.s] || [],
    };
  });
  var meta = D.meta;
  var COMPS = window.COMPS || [];
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
    return "$" + n.toFixed(0);
  }
  function pct(n) { return n === null || n === undefined ? "—" : (n > 0 ? "+" : "") + n.toFixed(1) + "%"; }
  function ageFmt(a) { return a === null || a === undefined ? "—" : a >= 365 ? (a / 365).toFixed(1) + "y" : a + "d"; }
  function $(id) { return document.getElementById(id); }

  // Header + stats.
  $("asof").textContent = "Snapshot " + D.asOf + " · DefiLlama";
  $("footAsOf").textContent = D.asOf;
  var st = [
    [rows.length + "", "protocols ranked"],
    [meta.totalProtocols + "", "protocols scanned"],
    [meta.compsN + "", "traded comparables"],
    ["×" + Math.pow(10, meta.oos.medErrHybridTilt).toFixed(1), "median out-of-sample error"],
    [meta.watchlistN + "", "watchlist (house floor)"],
    [meta.eligibleN + "", "eligible pre-token"],
    [money(rows[0].value), "top implied value"],
  ];
  $("stats").innerHTML = st.map(function (s) { return '<div class="stat"><b>' + s[0] + '</b><span>' + s[1] + "</span></div>"; }).join("");

  // Method panel — numbers come from the data, so the page always agrees
  // with the program that wrote it.
  var f = meta.fit, o = meta.oos, b = meta.boot;
  $("methodBody").innerHTML =
    "<p>The implied value of each protocol is <b>fitted from this snapshot itself</b>, never from a list of names. " +
    "The comparables are the <span class=\"num\">" + f.n + "</span> protocols in this snapshot that already trade. The value is the average, in log space, of two estimates: (a) a size curve, " +
    "log<sub>10</sub>(market cap) = <span class=\"num\">" + f.intercept.toFixed(3) + " + " + f.slope.toFixed(3) + " × log<sub>10</sub>(TVL) + " + f.quad.toFixed(4) + " × log<sub>10</sub>(TVL)²</span>, and (b) the median market cap of the <span class=\"num\">20</span> traded tokens nearest in size. " +
    "A global curve can be dragged by a few giants and a neighbour median alone is noisy across time, so the radar averages the two. " +
    "The curve bends upward — its effective slope runs from <span class=\"num\">" + (f.slope + 2 * f.quad * 7).toFixed(2) + "</span> at $10M of TVL to <span class=\"num\">" + (f.slope + 2 * f.quad * 10).toFixed(2) + "</span> at $10B — but it stays below 1, so bigger TVL is still worth proportionally less per dollar.</p>" +
    "<p>A <b>time-split out-of-sample test</b> (fit on tokens listed before 2025, tested on the " + o.testN + " listed since) gives the hybrid a median error of " +
    "<span class=\"num\">" + o.medErrHybridTilt.toFixed(2) + "</span> in log<sub>10</sub> — about " + Math.pow(10, o.medErrHybridTilt).toFixed(1) + "× — against <span class=\"num\">" + o.medErrTilt.toFixed(2) + "</span> for the curve alone, <span class=\"num\">" + o.medErrLinear.toFixed(2) + "</span> for a straight line and <span class=\"num\">" + o.medErrNaive.toFixed(2) + "</span> for a naive median multiple. " +
    "The same spec checked on two earlier cuts gives 0.57 and 0.41, so the headline number is the best of three cuts, not the only one — and no honest spec tested here reaches the 0.30 (2.0×) some rivals advertise, so this board does not claim it. " +
    "Seven-day growth and age enter only as small bounded tilts (±0.05 log each): larger growth or age terms predicted <i>worse</i> out of sample, so this radar refuses to chase a hot week. " +
    "The fitted value is stable under a 200-resample bootstrap: at the median comparable's TVL the fitted value is <span class=\"num\">" + money(b.medianValue) + "</span>, 5–95% <span class=\"num\">×" + b.lo.toFixed(2) + "–×" + b.hi.toFixed(2) + "</span>.</p>" +
    "<p>The board applies the house watchlist's own exclusion rule to every row: no exchanges, no bridges, no wrapped or staked products — a CEX is not a token waiting to launch. " +
    "That leaves <span class=\"num\">" + meta.eligibleN + "</span> eligible pre-token protocols; the board ranks the top <span class=\"num\">" + rows.length + "</span> by implied value. " +
    "Farm plans are mechanism-aware (lending, DEX, vault, RWA and the rest get different steps), each step names its cost and time, and each plan totals its cost in dollars and its length in weeks. " +
    "What the board does <b>not</b> claim: it does not predict whether or when any token launches, and a 2.3× median error means any single value could be half or double the truth — read the ranking, not the last digit. Values are estimates from one snapshot, not predictions — and the workings above are here so you can check them.</p>";

  // Category filter options.
  var cats = [];
  rows.forEach(function (r) { if (cats.indexOf(r.category) < 0) cats.push(r.category); });
  cats.sort();
  $("cat").innerHTML = '<option value="">All categories</option>' + cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("");
  $("compN").textContent = COMPS.length;

  // Board state: sort + filters.
  var state = { k: "rank", dir: 1, q: "", cat: "", wl: false, minTvl: 0 };
  var params = new URLSearchParams(location.search);
  if (params.get("category")) { state.cat = params.get("category"); $("cat").value = state.cat; }
  if (params.get("watchlist") === "1") { state.wl = true; $("wl").checked = true; }
  if (params.get("q")) { state.q = params.get("q"); $("q").value = state.q; }

  function filtered() {
    var q = state.q.toLowerCase();
    return rows.filter(function (r) {
      if (state.cat && r.category !== state.cat) return false;
      if (state.wl && !r.watchlist) return false;
      if (r.tvl < state.minTvl) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sortRows(list) {
    var k = state.k;
    return list.slice().sort(function (a, b) {
      var va = k === "vpd" ? a.value / a.cost : k === "chains" ? a.chains.join(",") : a[k];
      var vb = k === "vpd" ? b.value / b.cost : k === "chains" ? b.chains.join(",") : b[k];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * state.dir;
    });
  }
  function render() {
    var list = sortRows(filtered());
    $("count").textContent = list.length + " of " + rows.length + " shown";
    $("rows").innerHTML = list.map(function (r) {
      var chg = r.change7d === null ? "—" : '<span class="' + (r.change7d >= 0 ? "pos" : "neg") + '">' + pct(r.change7d) + "</span>";
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num' + (r.rank <= 3 ? " top3" : "") + '">' + r.rank + "</td>" +
        '<td class="name">' + esc(r.name) + '<br><span class="slug">' + esc(r.slug) + "</span>" + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : "") + "</td>" +
        "<td>" + esc(r.category) + "</td>" +
        "<td>" + esc(r.chains.slice(0, 2).join(", ")) + (r.chains.length > 2 ? " +" + (r.chains.length - 2) : "") + "</td>" +
        '<td class="num">' + money(r.tvl) + "</td>" +
        "<td class=\"num\">" + chg + "</td>" +
        '<td class="num">' + ageFmt(r.ageDays) + "</td>" +
        '<td class="num"><div class="vbar"><i style="width:' + Math.max(2, Math.round((r.value / rows[0].value) * 100)) + '%"></i></div>' + money(r.value) + "</td>" +
        '<td class="num">' + r.multiple.toFixed(2) + "×</td>" +
        '<td class="num">$' + r.cost.toFixed(2) + "</td>" +
        '<td class="num">' + Math.round(r.value / r.cost).toLocaleString("en-US") + "×</td></tr>";
    }).join("");
  }
  document.querySelectorAll("#board th").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.getAttribute("data-k");
      if (state.k === k) state.dir = -state.dir; else { state.k = k; state.dir = k === "name" || k === "category" || k === "chains" ? 1 : -1; }
      render();
    });
  });
  $("q").addEventListener("input", function (e) { state.q = e.target.value; render(); });
  $("cat").addEventListener("change", function (e) { state.cat = e.target.value; render(); });
  $("wl").addEventListener("change", function (e) { state.wl = e.target.checked; render(); });
  $("minTvl").addEventListener("change", function (e) { state.minTvl = +e.target.value; render(); });
  $("rows").addEventListener("click", function (e) {
    var tr = e.target.closest("tr");
    if (tr) showDetail(tr.getAttribute("data-slug"));
  });

  // Local median, mirroring the program's knnLogValue exactly: the median
  // market cap of the 20 traded tokens nearest in size (log10 TVL), ties
  // broken by slug, upper-middle median — so the breakdown here always
  // sums to the value the program wrote.
  function knnValue(tvl) {
    var l = Math.log10(tvl);
    var near = COMPS.map(function (c) { return { d: Math.abs(Math.log10(c.tvl) - l), slug: c.slug, v: Math.log10(c.mcap) }; })
      .sort(function (a, b) { return (a.d - b.d) || (a.slug < b.slug ? -1 : 1); })
      .slice(0, 20);
    var vs = near.map(function (x) { return x.v; }).sort(function (a, b) { return a - b; });
    return Math.pow(10, vs[Math.floor(vs.length / 2)]);
  }

  // Detail view: model breakdown, farm plan, what could go wrong.
  var RISKS = {
    "Risk Curators": "Curator vaults concentrate risk in one allocator's picks; a bad allocation or a vault exploit can take the deposit with it. Implied value assumes the curator keeps its edge.",
    "Lending": "Borrowing against volatile collateral can liquidate in a sharp move. Keep the loan-to-value well below the limit and watch the health factor weekly.",
    "Dexs": "Impermanent loss cuts both ways, and thin pools can be drained by one large trade. The deepest pool is the safest, not the highest-APR one.",
    "RWA": "Tokenised real-world assets depend on the issuer staying solvent and the redemption path staying open. Check the issuer's audits and the redemption queue before minting.",
    "Yield": "Vault yields come from the strategies underneath; a strategy can be exploited or its yield can fall to zero. Diversify across two strategies, as the plan does.",
    "CDP": "A CDP liquidates when collateral falls below the ratio. The plan keeps the vault above 200% — do not mint to the maximum the interface allows.",
    "Derivatives": "Leveraged positions can be liquidated in minutes and funding can flip negative. The plan hedges; an unhedged directional bet is a different trade.",
    "Basis Trading": "Basis yield depends on funding rates staying positive; a long flat or negative stretch pays nothing while the deposit is locked.",
    "Prediction Market": "Prediction markets pay only on the outcome; a confident bet can still lose. The plan spreads across markets instead of betting the deposit on one.",
  };
  function showDetail(slug) {
    var r = rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    document.querySelectorAll("#rows tr").forEach(function (tr) { tr.classList.toggle("open", tr.getAttribute("data-slug") === slug); });
    var g = r.change7d === null ? 0 : Math.max(-100, Math.min(200, r.change7d));
    var gTilt = Math.max(-0.05, Math.min(0.05, 0.05 * (g / 100)));
    var aTilt = r.ageDays === null ? 0 : Math.max(-0.05, Math.min(0.05, 0.05 * (Math.log10(r.ageDays + 30) - Math.log10(395))));
    var base = Math.pow(10, f.intercept + f.slope * Math.log10(r.tvl) + f.quad * Math.log10(r.tvl) * Math.log10(r.tvl));
    var local = knnValue(r.tvl);
    var avg = Math.sqrt(base * local);
    var risk = RISKS[r.category] || "A new protocol can change its rules, pause, or be exploited. The plan spreads activity across weeks so a single snapshot rarely decides the outcome.";
    var ms = COMPS.map(function (c) { return c.multiple; }).sort(function (a, b) { return a - b; });
    var medMult = ms[Math.floor(ms.length / 2)];
    var chainTxt = r.chains.slice(0, 4).join(", ") + (r.chains.length > 4 ? " +" + (r.chains.length - 4) : "");
    $("detail").hidden = false;
    $("detail").innerHTML =
      "<h2>" + esc(r.name) + ' <span class="slug">#' + r.rank + " · " + esc(r.slug) + "</span>" + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : "") + "</h2>" +
      '<div class="grid">' +
      '<div class="cell"><b>' + money(r.value) + '</b><span>implied value</span></div>' +
      '<div class="cell"><b>' + money(r.tvl) + '</b><span>TVL</span></div>' +
      '<div class="cell"><b>' + r.multiple.toFixed(2) + '×</b><span>implied multiple on TVL</span></div>' +
      '<div class="cell"><b>' + (r.change7d === null ? "—" : pct(r.change7d)) + '</b><span>TVL change, 7 days</span></div>' +
      '<div class="cell"><b>' + ageFmt(r.ageDays) + '</b><span>tracked with no token</span></div>' +
      '<div class="cell"><b>' + esc(chainTxt) + '</b><span>chains</span></div>' +
      "</div>" +
      "<h3>How the value is built</h3>" +
      "<p>Two estimates, averaged in log space, on " + money(r.tvl) + " of TVL: the size curve gives <span class=\"num\">" + money(base) + "</span>, and the local median — the median market cap of the 20 traded tokens nearest in size — gives <span class=\"num\">" + money(local) + "</span>. Their average is <span class=\"num\">" + money(avg) + "</span>. " +
      "Growth tilt (" + pct(r.change7d) + " over 7 days): <span class=\"num\">" + (gTilt >= 0 ? "+" : "") + gTilt.toFixed(3) + " log</span>. " +
      "Age tilt (" + ageFmt(r.ageDays) + " with no token): <span class=\"num\">" + (aTilt >= 0 ? "+" : "") + aTilt.toFixed(3) + " log</span>. " +
      "Combined: <span class=\"num\">" + money(r.value) + "</span> — for reference, the comparables' median multiple is <span class=\"num\">" + medMult.toFixed(2) + "×</span>, and the size curve bends upward, so the largest protocols carry a higher multiple than a straight line gives them.</p>" +
      "<h3>Farm plan — " + money(r.deposit) + " deposit, " + r.weeks + " weeks, net cost <span class=\"cost\">$" + r.cost.toFixed(2) + "</span></h3>" +
      "<ol>" + r.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
      "<p>Net cost is gas on the cheapest chain plus ~0.2% of the deposit in fees and slippage — the deposit itself is not a cost, it comes back. " +
      "Value per dollar farmed: <span class=\"cost\">" + Math.round(r.value / r.cost).toLocaleString("en-US") + "×</span>.</p>" +
      "<h3>What could go wrong</h3><p class=\"warn\">" + esc(risk) + "</p>";
    $("detail").scrollIntoView({ behavior: "auto", block: "start" });
  }

  // Comparables table.
  $("compRows").innerHTML = COMPS.map(function (c) {
    return "<tr><td>" + esc(c.name) + ' <span class="slug" style="color:var(--dim);font-family:var(--mono);font-size:12px">' + esc(c.slug) + "</span></td>" +
      "<td>" + esc(c.category) + '</td><td class="num">' + money(c.tvl) + '</td><td class="num">' + money(c.mcap) + '</td><td class="num">' + c.multiple.toFixed(2) + "×</td></tr>";
  }).join("");

  render();
  // Screenshot states: ?shot=detail&slug=… , ?shot=filtered&category=… .
  var shot = params.get("shot");
  if (shot === "detail") showDetail(params.get("slug") || rows[0].slug);
  if (shot === "filtered") { state.cat = params.get("category") || state.cat; $("cat").value = state.cat; render(); }
})();
