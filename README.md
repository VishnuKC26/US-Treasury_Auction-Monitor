# U.S. Treasury Bond Auctions Intelligence Terminal

A dependency-light, institutional macro terminal to monitor, inspect, and analyze results of benchmark **2-Year, 3-Year, 5-Year, 7-Year, 10-Year, 20-Year, and 30-Year** U.S. Treasury sovereign debt auctions.

Designed for analysts and traders to assess auction demand quality and market signals in under 10 seconds. Deployed on Vercel with zero build step, using vanilla ES modules, a vendored Chart.js distribution, and serverless proxies in `api/treasury/`.

Powered directly by the official [U.S. Treasury Fiscal Data API](https://fiscaldata.treasury.gov/datasets/treasury-securities-auctions-data/treasury-securities-auctions-data).

---

## ⚡ Core Institutional Analytics

1. **Strict Nominal Coupon Filtering:**
   - Excludes TIPS (`inflation_index_security: "Yes"`) and FRNs (`floating_rate: "Yes"`), preventing real yields and floating rates from distorting nominal benchmark curves and yield deltas.
2. **Transparent Demand Grading:**
   - Evaluates each auction based on trailing 20 auctions of the same tenor:
     - **STRONG:** Bid-to-cover percentile $\ge$ 67th and Primary Dealer share percentile $\le$ 33rd.
     - **SOFT:** Bid-to-cover percentile $\le$ 33rd and Primary Dealer share percentile $\ge$ 67th.
     - **IN LINE:** All other outcomes.
3. **Accurate Competitive Allotment Shares:**
   - Divides indirect, direct, and dealer acceptances strictly by `comp_accepted`, guaranteeing shares sum to exactly 100.0%.
   - Non-competitive awards and Federal Reserve SOMA rollovers are reported separately.
4. **Stop vs. Median Dispersion (bp):**
   - Correctly measures cut-off dispersion `(high_yield - avg_med_yield) * 100` alongside `allocation_pctage` ("Allocation at high %").
5. **Auction-Implied Curve & Spreads:**
   - Plots the benchmark curve (latest vs. ~1 month prior) across all 7 tenors.
   - Computes 2s5s, 5s10s, 10s30s, and 2s10s spreads with explicit date disclosures (*auction-implied, dates differ*).
6. **Live Upcoming Schedule:**
   - Filters upcoming auctions where `auction_date >= today (America/New_York)`, dedupes by `cusip + auction_date`, sorts ascending, and provides live ET countdowns to 1:00 pm ET (11:30 am for FRN).

---

## 📂 Architecture

```
bond-auctions/
├── index.html            # Main terminal UI & semantic layout
├── styles.css            # Institutional CSS design system (WCAG AA, responsive)
├── client.js             # UI orchestrator, lifecycle, and event coordination
├── analytics.js          # Pure, tested analytics & math functions (no DOM)
├── analytics.test.js     # Regression & fixture tests (node:test)
├── data.js               # Resilient data fetching (proxy -> direct -> sample fallback)
├── state.js              # Central reactive state store
├── charts.js             # Chart.js rendering & in-place updates (chart.update())
├── local-dev-server.js   # Local zero-dependency dev server & API proxy
├── package.json          # Node scripts (start, dev, test)
├── vercel.json           # Vercel deployment configuration
├── api/
│   └── treasury/
│       ├── auctions.js   # Serverless proxy for auctions_query
│       └── upcoming.js   # Serverless proxy for upcoming_auctions
├── vendor/
│   └── chart.umd.min.js  # Vendored Chart.js bundle
└── data/
    ├── sample_auctions.json   # Cached baseline auctions data (offline fallback)
    ├── upcoming_auctions.json # Cached baseline upcoming calendar (offline fallback)
    └── when_issued.json       # Optional when-issued yield data hook
```

---

## 🧪 Testing

Run the automated regression and fixture tests with Node's native test runner:

```bash
npm test
# or directly:
node --test
```

Tests verify:
- Non-nominal rejection (71 TIPS, 73 FRN correctly excluded).
- 10Y yield delta regression test (~+46.6 bp vs prior nominal, NOT ~+264.7 bp).
- Allotment shares sum to 100.0% against verified live October 2026 fixtures (10Y and 30Y).
- Safe numeric parsing (never converts missing values to 0).
- Transparent demand quality grading (STRONG, SOFT, IN LINE).
- Upcoming auction deduplication, New York date filtering, and ascending chronological ordering.

---

## 🚀 Running Locally

```bash
# Start local server on port 3000
npm start
# or
node local-dev-server.js
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
