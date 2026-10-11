# U.S. Treasury Bond Auctions Live Intelligence Terminal

A high-performance live dashboard and analytics terminal to monitor, inspect, and analyze results of **2-Year, 5-Year, 10-Year, 20-Year, and 30-Year** U.S. Treasury bond and note auctions.

Built following the official **[U.S. Treasury Fiscal Data API Quick Guide](https://fiscaldata.treasury.gov/datasets/treasury-securities-auctions-data/treasury-securities-auctions-data)**.

---

## 🚀 Key Features

- **Live Fiscal Data API Connectivity:** Direct integration with `api.fiscaldata.treasury.gov`, with zero third-party data vendor fees or authentication barriers.
- **Dedicated Tenor Coverage:** Full tracking for benchmark sovereign debt maturities:
  - 🟢 **2-Year Treasury Note** (Short-term policy rate expectations)
  - 🔵 **5-Year Treasury Note** (Medium-term economic outlook)
  - 🔷 **10-Year Benchmark Note** (Global risk-free benchmark rate)
  - 🟣 **20-Year Treasury Bond** (Long-end supply absorption)
  - 🟡 **30-Year Treasury Bond** (Long-term inflation & liability matching)
- **Institutional Analytics & KPIs:**
  - **Clearing High Yield & Δ (bps):** Latest cut-off yield vs previous auction change.
  - **2s10s & Yield Curve Spreads:** Inversion signals, slope steepening/flattening metrics.
  - **Bid-to-Cover Demand Indicator:** Real-time demand grading (*Strong*, *Normal*, *Soft*).
  - **Indirect Bidder Appetite:** Foreign central bank and institutional allotment tracking.
  - **Primary Dealer Absorption / Concession:** Measures supply overhang taken down by dealers of last resort.
  - **Auction Tail (bps):** Clearing high yield minus median yield (measuring whether an auction stopped through or tailed).
- **Interactive Visualizations (Chart.js):**
  - **Yield & Coupon Evolution:** Historical clearing yields and coupons across all 5 tenors.
  - **Current Yield Curve Snapshot:** Active 2Y-30Y curve with prior auction comparison and spread matrix.
  - **Bid-to-Cover Ratio & Demand Health:** Bar trend with historical 2.50x benchmark.
  - **Allotment Distribution Stack:** Visualizing Indirect % vs Direct % vs Primary Dealer %.
- **Upcoming Auctions Watchlist:** Pulls real-time schedule from `/v1/accounting/od/upcoming_auctions`.
- **Searchable Results Ledger:** Filter by tenor, issue type (New vs Reopening), date horizon, or search by CUSIP.
- **Auction Inspector Modal:** Complete telemetry for any selected issue, including competitive vs non-competitive bids, SOMA Fed rollovers, prices, and direct links to official Treasury press releases.
- **Interactive API Quick Guide:** Built-in modal demonstrating live `curl`, JavaScript `fetch()`, Python `requests`, and query syntax.
- **CSV Data Export:** One-click export of any filtered dataset.
- **Theme Switcher:** Dark institutional terminal aesthetic and light theme.

---

## 📡 Fiscal Data API Integration

The application follows the official Fiscal Data REST standards:

### 1. Auctions Results Query
- **Base Endpoint:**
  ```http
  GET https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query
  ```
- **Filter for 2, 5, 10, 20, 30 Year Bonds:**
  ```http
  ?filter=original_security_term:in:(2-Year,5-Year,10-Year,20-Year,30-Year)&sort=-issue_date&page[size]=1000
  ```

### 2. Upcoming Auctions Feed
- **Base Endpoint:**
  ```http
  GET https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions?page[size]=100
  ```

---

## 💻 Quick Start & Running Locally

### Option 1: Using Node.js (Recommended)
```bash
# Clone or navigate to the project directory
cd bond-auctions

# Start the dev server
npm start
# or
node server.js
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### Option 2: Standalone Static Opening
Because the U.S. Treasury API supports **CORS (`Access-Control-Allow-Origin: *`)**, you can also open `index.html` directly in any modern web browser or serve it with any HTTP server (e.g. `python -m http.server 3000`).

---

## 📂 File Architecture

```
bond-auctions/
├── index.html            # Main dashboard interface
├── styles.css            # Dark financial terminal design system & responsive layout
├── app.js                # State management, API client, Chart.js integrations & filters
├── server.js             # Lightweight zero-dependency Node HTTP server with proxy & fallback
├── package.json          # Node scripts and metadata
├── vendor/
│   └── chart.umd.min.js  # Local offline Chart.js bundle
└── data/
    ├── sample_auctions.json   # Cached baseline auctions data
    └── upcoming_auctions.json # Cached baseline upcoming calendar
```
