# Market Dashboard — Capital Flow Tracker

A personalized dashboard for tracking equities and global capital flow. The app uses ordered bar charts for at-a-glance sector performance, hover tooltips for granular ticker-level detail, and batch-fetched Yahoo Finance data through a lightweight Express proxy.

## User Review Required

> [!IMPORTANT]
> **Yahoo Finance API access**: Yahoo doesn't provide an official free API. We'll use the unofficial `query2.finance.yahoo.com/v7/finance/quote` endpoint via a local Express proxy to bypass CORS. This is the same endpoint the Yahoo Finance website itself uses. It supports comma-separated symbols for batch fetching.

> [!NOTE]
> **Architecture choice**: Vite + vanilla JS for the frontend (fast, no framework overhead). Express.js backend as a thin proxy + cache layer. This keeps the stack lightweight while allowing full control over the UI.

> [!WARNING]
> **Analytical modules (Phase 4)** are scaffolded as navigation stubs in this initial build. The first delivery focuses on the core dashboard with live sector bar charts, tooltips, and the data pipeline. We can iterate on the advanced modules once the foundation is solid.

---

## Proposed Changes

### Backend — Express Proxy Server

#### [NEW] [server.js](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/server.js)
- Express server on port `3001`
- `/api/quote?symbols=AAPL,MSFT,...` → proxies to Yahoo Finance v7 quote endpoint
- In-memory cache with 60-second TTL to minimize external hits
- CORS enabled for `localhost:5173` (Vite dev server)

---

### Frontend — Vite + Vanilla JS

#### [NEW] [package.json](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/package.json)
- `vite` for dev/build, `express` + `cors` + `node-fetch` for the proxy server
- Scripts: `dev` (Vite), `server` (Express proxy), `start` (both concurrently)

#### [NEW] [vite.config.js](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/vite.config.js)
- Proxy `/api` requests to Express server during development

#### [NEW] [index.html](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/index.html)
- Root HTML shell with meta tags, Google Fonts (Inter), app container

#### [NEW] [src/style.css](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/src/style.css)
- Dark-mode-first design system
- CSS custom properties for colors, spacing, typography
- Glassmorphism effects, gradients, smooth animations
- Responsive grid layout for the dashboard

#### [NEW] [src/main.js](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/src/main.js)
- App entry point: initializes dashboard, attaches event listeners
- Orchestrates data fetching and rendering pipeline

#### [NEW] [src/data/sectors.js](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/src/data/sectors.js)
- Complete sector definitions organized by category (Tech, Financials, Energy, etc.)
- Each sector: `{ name, category, tickers: [...] }`
- All 50+ sectors from the user's masterlist

#### [NEW] [src/services/api.js](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/src/services/api.js)
- `fetchQuotes(symbols[])` → calls `/api/quote` with comma-separated tickers
- `fetchAllSectors(sectorList)` → batches all sector calls efficiently
- Deduplicates tickers across sectors before fetching
- Returns normalized data map: `{ symbol → { price, change, changePct, volume, ... } }`

#### [NEW] [src/components/barChart.js](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/src/components/barChart.js)
- Renders ordered horizontal bar chart per category
- Bars colored by performance (gradient: deep red → red → neutral → green → deep green)
- Bars sorted by % change (best to worst)
- Smooth entrance animations on load/refresh

#### [NEW] [src/components/tooltip.js](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/src/components/tooltip.js)
- Hover tooltip positioned near cursor
- Shows individual ticker breakdown for hovered sector:
  - Ticker symbol, price, % change, volume
  - Mini sparkline or ranked list
- Glassmorphism-styled card with backdrop blur

#### [NEW] [src/components/sidebar.js](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/src/components/sidebar.js)
- Navigation sidebar with category sections
- Links to sector groups + future analytical modules
- Collapsible on mobile, fixed on desktop

#### [NEW] [src/components/header.js](file:///c:/Users/jadir/OneDrive/Desktop/Apps/Market%20Dashboards/src/components/header.js)
- Top bar with app title, last-refreshed timestamp, refresh button
- Market status indicator (open/closed/pre-market/after-hours)

---

## Verification Plan

### Browser Verification
1. Run `npm run dev` to start the Vite dev server
2. Run `node server.js` to start the Express proxy
3. Open `http://localhost:5173` in the browser
4. Verify:
   - Dashboard loads with a dark, premium aesthetic
   - Sector bar charts render with color-coded performance bars
   - Hovering a sector bar shows tooltip with individual ticker data
   - Sidebar navigation is present and functional
   - Data auto-refreshes (or manual refresh button works)
   - No console errors

### API Verification
1. With the Express server running, visit `http://localhost:3001/api/quote?symbols=AAPL,MSFT,GOOGL`
2. Verify JSON response contains price, change, volume data for all 3 symbols
3. Hit the same endpoint again within 60s and verify cached response (faster)

### Manual Verification
- Resize the browser window to verify responsive layout
- Check that the color gradient on bars correctly reflects positive/negative performance
- Confirm tooltips follow cursor and dismiss on mouse leave
