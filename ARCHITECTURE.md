# Market Dashboard - Complete Architecture & System Overview

## 1. Project Purpose & Scope
The **Market Dashboard** is a highly specialized, institutional-grade web application designed to track global capital flows, thematic performance, and macro-economic shifts. It processes real-time and historical financial data for over 265+ tickers organized into a strict taxonomy of **8 broader Sectors** and **53 specific Themes**.

## 2. The Tech Stack
*   **Frontend**: React + Vite (Fast HMR, component-driven UI).
*   **Backend**: Node.js + Express.js (Acts as a rate-limiting proxy and cache manager).
*   **Data Provider**: `yahoo-finance2` (NPM package interacting directly with Yahoo Finance APIs).
*   **Database**: Zero-dependency persistent JSON storage (`fundamentals-cache.json` and `history-cache.json`) built directly into the file system to survive container sleep cycles.

---

## 3. Core Frontend Features & UI

### The Theme Visualizer
*   Translates complex financial data into a condensed, 50/50 split horizontal bar chart.
*   **Proportional Scaling**: The visualization engine dynamically calculates the absolute maximum performance swing (`maxSwing`) across the entire market and scales all individual bars proportionally against it from $0 \rightarrow 100\%$. 
*   Displays critical inline metrics: **Change**, **RVOL** (Relative Volume), and **DISP** (Dispersion).

### The Data Table
*   A dense, sortable data grid featuring native responsive tooltips with strict mathematical definitions for every column header.
*   **Expandable Accordions**: Clicking any Theme row smoothly expands an accordion to reveal the exact 5 constituent tickers underlying that theme's aggregate valuations.
*   **Sticky Headers**: Engineered via nested CSS Scroll Containers (`overflow-y: auto` inside `.table-wrapper`) to ensure column headers strictly pin to `top: 0` without vanishing under the main navigation bar.
*   **NM (Not Meaningful) Interceptor**: Detects catastrophic raw data glitches from upstream providers (e.g., $P/S = -7047.17$) and forces a clean UI render of `NM` for any valuation multiple $<0$ or $>500$.

### Timeframe-Synced Macro Overview Cards
*   Tracks S&P 500 (`SPY`), S&P 500 Equal Weight (`RSP`), Small Caps (`IWM`), and the US Dollar Index (`DX-Y.NYB`).
*   Directly synchronized to the global Timeframe dropdown, computing `(live - anchor) / anchor` sequentially instead of relying on standard 1-day quote returns.

---

## 4. The Mathematical Aggregation Engine
The application strictly abandons Market-Cap weighting in favor of pure **Equal-Weighted Institutional Mathematics**.

### A. Momentum & Fundamental Growth (Simple Average)
*   **Metrics**: Change %, RVOL, Sales Growth (SG), Earnings Growth (EG).
*   **Logic**: Pure $\frac{\sum(x)}{n}$ simple arithmetic mean. Every constituent ticker carries exactly an equal 20% fractional allocation of the Theme's impact.

### B. Valuation Multiples (Harmonic Mean)
*   **Metrics**: P/E, Fwd P/E, P/S, PEG, PSG.
*   **Logic**: Directly resists extreme outlier distortion (e.g., one ticker having a P/E of 800 tearing the average). It converts every strictly positive multiple into a yield ($\frac{1}{x}$), sums them, and re-inverts the total basket: $\frac{n}{\sum (\frac{1}{x})}$.
*   **Negative-Yield Guardrail**: If the aggregated denominator yield implies a cash-burning/net-loss basket ($\le 0$), the application safely rejects the math and returns `null`.

### C. MVD (Minimum Viable Data) Gate
*   Enforces a strict **60% Confidence Threshold** before calculating Harmonic Means. 
*   If fewer than 3 of the 5 constituent tickers return valid, strictly-positive valuations, the engine completely aborts the aggregate calculation. This prevents a single profitable legacy stock from projecting a false positive valuation over a basket of 4 pre-revenue biotech startups.

### D. Dispersion (Population Standard Deviation)
*   **Metric**: DISP.
*   **Logic**: Calculates the mathematical variance ($\sigma$) of the daily `% Change` of the 5 individual tickers measured against the computed mean `avgChange` of that exact Theme, exposing whether stocks are trading unilaterally or violently diverging.

---

## 5. The Tri-Layer Data Architecture (The Secret Sauce)
Because Yahoo Finance aggressively rate-limits IP addresses, the app employs a localized **Stale-While-Revalidate (SWR)** caching ecosystem spread across three independent traffic lanes.

### Lane 1: The "Fast Lane" (Live Prices)
*   **Target**: The lightweight `/api/quote` batch endpoint.
*   **Behavior**: Fires every 60 seconds on the frontend. Node.js chunks 270 tickers into massive arrays and hits Yahoo. It instantly returns Live Prices, Volume, Market Cap, and trailing 1D %.

### Lane 2: The "Fundamentals Trickle Queue" 
*   **Target**: The heavy `quoteSummary` endpoint requiring DOM scraping for deep EPS/Valuations.
*   **Behavior**: Trickles exactly **2 tickers every 3 seconds** in the background to avoid IP bans.
*   **Event-Driven Caching Strategy**: Saved permanently to `fundamentals-cache.json`. When the app boots, it compares the current date against the ticker's `earningsTimestamp`. If the company has NOT physically reported new quarterly earnings in the last few weeks, the system **never re-fetches** the data. It serves the cache instantly forever. It only re-queues a ticker if: `earningsTimestamp + 3 days > cache_timestamp`.

### Lane 3: The "Precision History Queue" 
*   **Target**: The `/api/historical` endpoint utilized for `7D, 1M, 3M, 1Y, 5Y` rolling lookbacks.
*   **Behavior**: Trickles **5 tickers every 2 seconds** into a Rolling Cache.
*   **Smart Time-To-Live (TTL) Strategy**: Saved permanently to `history-cache.json`.
    *   `1D, 7D, 1M, 3M` anchor prices are kept alive for exactly 24 hours.
    *   `1Y, 2Y, 5Y` anchor prices are kept alive for exactly 7 days.
*   When a user selects `1M`, the frontend instantly reads the 1-month-old anchor price from the cache, grabs the 1-second-old Live Price from the Fast Lane, and mathematically computes the exact 1-Month percentage change instantly inside React.

## 6. Taxonomy Masterlist (`sectors.js`)
The application defines reality via a pure array structure.
*   **Hierarchy**: `Sector` (Parent) $\rightarrow$ `Themes` (Children) $\rightarrow$ `Tickers` (Constituents)
*   **Breadth**:
    1. Information Technology & Semiconductors (`cat.themes`)
    2. Communication Services
    3. Financials & Fintech
    4. Consumer Discretionary & Staples
    5. Industrials, Aerospace & Defense
    6. Energy, Utilities & Materials
    7. Healthcare & Pharmaceuticals
    8. Real Estate & Infrastructure
*   **Rule**: Modifying anything inside `src/data/sectors.js` globally propagates changes (and queue logic) across the entire stack safely.
