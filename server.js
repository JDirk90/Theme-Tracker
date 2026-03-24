import express from 'express';
import cors from 'cors';
import YahooFinance from 'yahoo-finance2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// ── Instantiate yahoo-finance2 ───────────────────────────────────────────────
const yf = new YahooFinance({
  fetchOptions: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
    }
  }
});
try { YahooFinance.suppressNotices?.(['yahooSurvey']); } catch (_) { /* ignore */ }

// ── In-memory cache ──────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 60_000; // 60 seconds

// ── Force-refresh rate limiting ──────────────────────────────────────────────
const FORCE_COOLDOWN = 5_000; // 5 seconds between forced refreshes
let lastForceTimestamp = 0;
let queuePausedUntil = 0; // Pause background queues when user forces a refresh

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ── Background Fundamentals Queue ────────────────────────────────────────────
const CACHE_FILE = path.join(__dirname, 'fundamentals-cache.json');
let fundamentalsCache = new Map();
const FUNDAM_TTL = 24 * 60 * 60 * 1000; // 24 hours
const pendingQueue = new Set();
let isQueueRunning = false;

// ── Background Historical Queue ──────────────────────────────────────────────
const HIST_CACHE_FILE = path.join(__dirname, 'history-cache.json');
let historyCache = new Map();
const historyQueue = new Set();
let isHistoryQueueRunning = false;

// Load from disk on boot
try {
  if (fs.existsSync(CACHE_FILE)) {
    const data = fs.readFileSync(CACHE_FILE, 'utf-8');
    fundamentalsCache = new Map(Object.entries(JSON.parse(data)));
    console.log(`[Queue] Loaded ${fundamentalsCache.size} tickers from persistent cache.`);
  }
} catch (err) {
  console.log(`[Queue] Starting fresh cache (No disk file found)`);
}

try {
  if (fs.existsSync(HIST_CACHE_FILE)) {
    const histData = fs.readFileSync(HIST_CACHE_FILE, 'utf-8');
    historyCache = new Map(Object.entries(JSON.parse(histData)));
    console.log(`[History Queue] Loaded ${historyCache.size} tickers from persistent cache.`);
  }
} catch (err) {
  console.log(`[History Queue] Starting fresh history cache (No disk file found)`);
}

function saveFundamentalsCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(fundamentalsCache), null, 2), 'utf-8');
  } catch (err) { }
}

function saveHistoryCache() {
  try {
    fs.writeFileSync(HIST_CACHE_FILE, JSON.stringify(Object.fromEntries(historyCache), null, 2), 'utf-8');
  } catch (err) { }
}
async function processQueue() {
  if (isQueueRunning || pendingQueue.size === 0) return;
  if (Date.now() < queuePausedUntil) return; // Yield to user's forced refresh
  isQueueRunning = true;

  try {
    const batch = [...pendingQueue].slice(0, 2);
    batch.forEach(sym => pendingQueue.delete(sym));

    console.log(`[Queue] Fetching fundamentals for ${batch.join(', ')}... (${pendingQueue.size} remaining)`);
    
    for (const sym of batch) {
      try {
        const res = await yf.quoteSummary(sym, { modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail'] });
        const sg = res?.financialData?.revenueGrowth ?? null;
        const ps = res?.summaryDetail?.priceToSalesTrailing12Months ?? res?.defaultKeyStatistics?.priceToSalesTrailing12Months ?? null;
        
        fundamentalsCache.set(sym, { sg, ps, timestamp: Date.now() });
      } catch (err) {
        console.error(`[Queue] Failed to fetch ${sym}:`, err.message);
        fundamentalsCache.set(sym, { sg: null, ps: null, timestamp: Date.now() });
      }
    }

    if (batch.length > 0) {
      saveFundamentalsCache();
    }
  } finally {
    isQueueRunning = false;
  }
}

setInterval(processQueue, 3000);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

// ── Batch quote endpoint ─────────────────────────────────────────────────────
// POST /api/quote
// Body: { "symbols": "AAPL,MSFT,GOOGL", "timeframe": "1M" } or { "symbols": ["AAPL", "MSFT"] }
app.post('/api/quote', async (req, res) => {
  try {
    const { symbols, timeframe, force } = req.body;
    if (!symbols) {
      return res.status(400).json({ error: 'Missing "symbols" in request body' });
    }

    let symbolList = [];
    if (Array.isArray(symbols)) {
      symbolList = symbols.map(s => s.trim().toUpperCase()).filter(Boolean);
    } else if (typeof symbols === 'string') {
      symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    }

    if (symbolList.length === 0) {
      return res.status(400).json({ error: 'No valid symbols provided' });
    }

    // ── Force-refresh handling ──
    if (force) {
      const now = Date.now();
      const elapsed = now - lastForceTimestamp;
      if (elapsed < FORCE_COOLDOWN) {
        const remaining = Math.ceil((FORCE_COOLDOWN - elapsed) / 1000);
        return res.status(429).json({ error: `Rate limited. Try again in ${remaining}s.`, retryAfter: remaining });
      }
      lastForceTimestamp = now;
      queuePausedUntil = now + FORCE_COOLDOWN; // Pause background queues for 5s
      console.log(`🔄 Forced refresh — cache busted, background queues paused for 5s`);
    }

    // Check cache first (skip if force=true)
    const cacheKey = timeframe ? `${[...symbolList].sort().join(',')}:${timeframe}` : [...symbolList].sort().join(',');
    if (!force) {
      const cached = getCached(cacheKey);
      if (cached) {
        console.log(`✅ Cache hit for ${symbolList.length} symbols`);
        return res.json({ results: cached, cached: true });
      }
    }

    console.log(`📡 Fetching ${symbolList.length} symbols from Yahoo Finance...`);

    // Single call — the library handles large arrays internally
    const rawResults = await yf.quote(symbolList);
    const allResults = Array.isArray(rawResults) ? rawResults : [rawResults];

    console.log(`✅ Received ${allResults.length} results`);

    // Normalize the results and merge fundamentals
    const normalized = allResults.map((q) => {
      const sym = q.symbol.toUpperCase();
      const fundam = fundamentalsCache.get(sym);
      let sg = undefined;
      let ps = undefined;

      const earningsTime = q.earningsTimestamp ? new Date(q.earningsTimestamp).getTime() : 0;
      const BUFFER = 3 * 24 * 60 * 60 * 1000; // 3 days for analysts to update
      const MAX_STALE = 90 * 24 * 60 * 60 * 1000; // 90 days generic fallback

      if (fundam) {
        // Stale-While-Revalidate: instantly serve whatever is in the cache
        sg = fundam.sg;
        ps = fundam.ps;

        // Ensure we fetch fresh data if a new earnings report officially passed + buffer
        const passedEarnings = (earningsTime > fundam.timestamp && Date.now() > earningsTime + BUFFER);
        const passedStale = (Date.now() - fundam.timestamp > MAX_STALE);

        if (passedEarnings || passedStale) {
          pendingQueue.add(sym);
        }
      } else {
        // Hard miss
        pendingQueue.add(sym);
      }

      // ── HISTORY ANCHORS EVALUATION ──
      let anchorPrice = undefined; // trigger UI loader implicitly if missing
      if (timeframe && timeframe !== '1D') {
        const TIMEFRAME_TTL = {
          '7D': 24 * 60 * 60 * 1000,
          '1M': 24 * 60 * 60 * 1000,
          '3M': 24 * 60 * 60 * 1000,
          'YTD': 365 * 24 * 60 * 60 * 1000,
          '1Y': 7 * 24 * 60 * 60 * 1000,
          '2Y': 7 * 24 * 60 * 60 * 1000,
          '5Y': 7 * 24 * 60 * 60 * 1000,
        };

        const hCache = historyCache.get(sym) || {};
        const tfData = hCache[timeframe];
        
        if (tfData) {
          // Serve Stale-While-Revalidate immediately
          anchorPrice = tfData.price === null ? undefined : tfData.price; 

          // Trigger background fetch if expired
          const isStale = (Date.now() - tfData.timestamp) > (TIMEFRAME_TTL[timeframe] || 24 * 60 * 60 * 1000);
          if (isStale) historyQueue.add(`${sym}:${timeframe}`);
        } else {
          // Hard miss
          historyQueue.add(`${sym}:${timeframe}`);
        }
      }

      return {
        symbol: sym,
        shortName: q.shortName || q.longName || q.symbol,
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
        volume: q.regularMarketVolume ?? null,
        avgVolume: q.averageDailyVolume3Month ?? null,
        marketCap: q.marketCap ?? null,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
        trailingPE: q.trailingPE ?? null,
        forwardPE: q.forwardPE ?? null,
        epsTrailingTwelveMonths: q.epsTrailingTwelveMonths ?? null,
        epsForward: q.epsForward ?? null,
        marketState: q.marketState ?? null,
        exchange: q.exchange ?? null,
        earningsTimestamp: q.earningsTimestamp ?? null,
        sg,
        ps,
        anchorPrice: anchorPrice === null ? undefined : anchorPrice,
        error: false,
      };
    });

    setCache(cacheKey, normalized);
    res.json({ results: normalized, cached: false });
  } catch (err) {
    console.error('Quote endpoint error:', err.message);
    res.status(500).json({ error: 'Failed to fetch quotes', message: err.message });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', cacheSize: cache.size, uptime: process.uptime() });
});

async function processHistoryQueue() {
  if (isHistoryQueueRunning || historyQueue.size === 0) return;
  if (Date.now() < queuePausedUntil) return; // Yield to user's forced refresh
  isHistoryQueueRunning = true;

  try {
    const batch = [...historyQueue].slice(0, 3);
    batch.forEach(i => historyQueue.delete(i));

    console.log(`[History] Batching ${batch.join(', ')}... (${historyQueue.size} pending)`);

    const TIMEFRAME_DAYS = { '7D': 7, '1M': 31, '3M': 91, '1Y': 365, '2Y': 730, '5Y': 1825 };

    for (const item of batch) {
      const [sym, tf] = item.split(':');

      // Calculate days for this timeframe
      let days = TIMEFRAME_DAYS[tf];
      if (tf === 'YTD') {
        const now = new Date();
        const jan1 = new Date(now.getFullYear(), 0, 1);
        days = Math.ceil((now - jan1) / (1000 * 60 * 60 * 24));
      }
      if (!days) continue;

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - days);
      
      const p1 = new Date(targetDate);
      p1.setDate(p1.getDate() - 5); // Pad backwards for weekends/holidays
      const p2 = new Date(targetDate);
      p2.setDate(p2.getDate() + 1);

      try {
        const hist = await yf.historical(sym, { period1: p1, period2: p2 });
        const hCache = historyCache.get(sym) || {};
        
        if (hist && hist.length > 0) {
          const closest = hist[hist.length - 1]; // closest backwards match before p2 bounds
          hCache[tf] = { price: closest.close, timestamp: Date.now() };
        } else {
          // If a company IPO'd recently, there is no historical data. We cache null to prevent infinite polling.
          hCache[tf] = { price: null, timestamp: Date.now() };
        }
        
        historyCache.set(sym, hCache);
      } catch (err) {
        console.error(`[History] Failed ${sym}:${tf} ->`, err.message);
      }
    }

    if (batch.length > 0) saveHistoryCache();
  } finally {
    isHistoryQueueRunning = false;
  }
}

setInterval(processHistoryQueue, 2500);

// ── Serve Vite production build ──────────────────────────────────────────────
const distPath = path.resolve(__dirname, 'dist');
app.use(express.static(distPath));

// Catch-all: serve index.html for any non-API request (client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.resolve(distPath, 'index.html'));
});

// ── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Theme Tracker running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Quote:  http://localhost:${PORT}/api/quote?symbols=AAPL,MSFT\n`);
});
