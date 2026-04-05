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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
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
        fiftyDayAverage: q.fiftyDayAverage ?? null,
        twoHundredDayAverage: q.twoHundredDayAverage ?? null,
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

// ── SMA Endpoint (50 / 125 / 200-day for ^GSPC) ─────────────────────────────
const SMA_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
app.get('/api/sma', async (req, res) => {
  const cacheKey = 'sma_gspc';
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SMA_CACHE_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 365); // fetch ~1 year to ensure 200 trading days

    const result = await yf.historical('^GSPC', {
      period1: start,
      period2: end,
      interval: '1d',
    });

    if (!result || result.length < 50) {
      return res.status(500).json({ error: 'Insufficient historical data' });
    }

    const closes = result.map(d => d.close).filter(Boolean);
    const sma = (arr, period) => {
      if (arr.length < period) return null;
      const slice = arr.slice(-period);
      return slice.reduce((a, b) => a + b, 0) / period;
    };

    const currentPrice = closes[closes.length - 1];
    const sma50 = sma(closes, 50);
    const sma125 = sma(closes, 125);
    const sma200 = sma(closes, 200);

    const data = { price: currentPrice, sma50, sma125, sma200 };
    cache.set(cacheKey, { data, ts: Date.now() });
    res.json({ ...data, cached: false });
  } catch (err) {
    console.error('SMA fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

setInterval(processHistoryQueue, 2500);

// ── Sentiment Signals Endpoint (Pro-Standard MA-Based + Percentile Rank) ─────
const SENTIMENT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const SENTIMENT_TICKERS = [
  'SPHB', 'ARKK', 'IBIT', 'MEME',   // Risk-On basket
  'GLD', 'TLT', 'XLU', 'XLP',        // Safe-Haven basket
  'HYG', 'IEF',                       // Credit Stress
  'RSP', 'SPY', 'IWM',                // Market Breadth
  'HG=F', 'GC=F',                     // Doctor Copper / Gold
  '^TNX', 'DX-Y.NYB',                 // Financial Conditions (10Y Yield + Dollar)
  '^VIX', '^VIX3M', '^GSPC',          // Contrarian (Panic Curve + Rubber Band)
];

const SYSTEMIC_WEIGHTS = {
  breadth: 0.25,
  credit: 0.35,
  financial: 0.25,
  copperGold: 0.15,
};

const EMOTION_WEIGHTS = {
  breadth: 0.20,
  risk: 0.40,
  panicCurve: 0.25,
  rubberBand: 0.15,
};

function computeSMA(arr, period) {
  if (!arr || arr.length < period) return null;
  const slice = arr.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rollingSMA(arr, period) {
  const result = [];
  for (let i = period - 1; i < arr.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += arr[j];
    result.push(sum / period);
  }
  return result;
}

function computeDailyReturns(closes) {
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      returns.push(((closes[i] - closes[i - 1]) / closes[i - 1]) * 100);
    } else {
      returns.push(0);
    }
  }
  return returns;
}

/**
 * Percentile Rank: what % of historical values is the current value >= to?
 * Higher = more greedy. Caller must invert if the signal is inverse.
 */
function percentileRank(series, currentValue) {
  if (!series || series.length === 0 || currentValue == null) return null;
  const below = series.filter(v => v < currentValue).length;
  return (below / series.length) * 100;
}

app.get('/api/sentiment-signals', async (req, res) => {
  const cacheKey = 'sentiment_signals_v3';
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SENTIMENT_CACHE_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 400); // Extra padding for 200-day MA needing 200 days of lookback

    console.log(`[Sentiment] Fetching 1+ year history for ${SENTIMENT_TICKERS.length} tickers...`);

    // Fetch all historical data in parallel
    const histResults = {};
    const fetches = SENTIMENT_TICKERS.map(async (sym) => {
      try {
        const hist = await yf.historical(sym, { period1: start, period2: end, interval: '1d' });
        histResults[sym] = (hist || []).filter(d => d.close != null);
      } catch (err) {
        console.error(`[Sentiment] Failed to fetch ${sym}:`, err.message);
        histResults[sym] = [];
      }
    });
    await Promise.all(fetches);

    console.log(`[Sentiment] Historical data fetched. Computing signals + percentile ranks...`);

    const getCloses = (sym) => histResults[sym]?.map(d => d.close) || [];
    const getReturns = (sym) => computeDailyReturns(getCloses(sym));

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. RISK vs SAFETY — Multi-timeframe spread (1D, 5D, 21D)
    //    Percentile rank based on 1-year rolling 21D spread history
    // ═══════════════════════════════════════════════════════════════════════════
    const riskSyms = ['SPHB', 'ARKK', 'IBIT', 'MEME'];
    const safeSyms = ['GLD', 'TLT', 'XLU', 'XLP'];

    // Build rolling 21D cumulative spread series for percentile ranking
    const buildRollingSpreadSeries = (windowDays) => {
      // Get aligned closes for all basket tickers
      const riskCloses = riskSyms.map(s => getCloses(s));
      const safeCloses = safeSyms.map(s => getCloses(s));
      const minLen = Math.min(
        ...riskCloses.map(c => c.length),
        ...safeCloses.map(c => c.length)
      );
      if (minLen < windowDays + 1) return [];

      const series = [];
      for (let day = windowDays; day < minLen; day++) {
        const riskReturns = riskCloses.map(closes => {
          const endP = closes[closes.length - minLen + day];
          const startP = closes[closes.length - minLen + day - windowDays];
          return startP > 0 ? ((endP - startP) / startP) * 100 : null;
        }).filter(v => v != null);

        const safeReturns = safeCloses.map(closes => {
          const endP = closes[closes.length - minLen + day];
          const startP = closes[closes.length - minLen + day - windowDays];
          return startP > 0 ? ((endP - startP) / startP) * 100 : null;
        }).filter(v => v != null);

        if (riskReturns.length > 0 && safeReturns.length > 0) {
          const avgR = riskReturns.reduce((a, b) => a + b, 0) / riskReturns.length;
          const avgS = safeReturns.reduce((a, b) => a + b, 0) / safeReturns.length;
          series.push(avgR - avgS);
        }
      }
      return series;
    };

    // Current values (latest point in each series)
    const spreadSeries1D = buildRollingSpreadSeries(1);
    const spreadSeries5D = buildRollingSpreadSeries(5);
    const spreadSeries21D = buildRollingSpreadSeries(21);

    const spread1D = spreadSeries1D.length > 0 ? spreadSeries1D[spreadSeries1D.length - 1] : null;
    const spread5D = spreadSeries5D.length > 0 ? spreadSeries5D[spreadSeries5D.length - 1] : null;
    const spread21D = spreadSeries21D.length > 0 ? spreadSeries21D[spreadSeries21D.length - 1] : null;

    // Compute current avg risk/safe for the 1D and 21D (for basket breakdown)
    const cumReturn = (sym, n) => {
      const closes = getCloses(sym);
      if (closes.length < n + 1) return null;
      return ((closes[closes.length - 1] - closes[closes.length - 1 - n]) / closes[closes.length - 1 - n]) * 100;
    };
    const avgRisk1D = (() => { const v = riskSyms.map(s => cumReturn(s, 1)).filter(x => x != null); return v.length ? v.reduce((a,b) => a+b, 0) / v.length : null; })();
    const avgSafe1D = (() => { const v = safeSyms.map(s => cumReturn(s, 1)).filter(x => x != null); return v.length ? v.reduce((a,b) => a+b, 0) / v.length : null; })();
    const avgRisk21D = (() => { const v = riskSyms.map(s => cumReturn(s, 21)).filter(x => x != null); return v.length ? v.reduce((a,b) => a+b, 0) / v.length : null; })();
    const avgSafe21D = (() => { const v = safeSyms.map(s => cumReturn(s, 21)).filter(x => x != null); return v.length ? v.reduce((a,b) => a+b, 0) / v.length : null; })();

    const riskSymbolsData = riskSyms.reduce((acc, sym) => {
      acc[sym] = { '1d': cumReturn(sym, 1), '1w': cumReturn(sym, 5), '1m': cumReturn(sym, 21) };
      return acc;
    }, {});
    const safeSymbolsData = safeSyms.reduce((acc, sym) => {
      acc[sym] = { '1d': cumReturn(sym, 1), '1w': cumReturn(sym, 5), '1m': cumReturn(sym, 21) };
      return acc;
    }, {});

    // Percentile rank: higher spread = more greed
    const riskPercentile = percentileRank(spreadSeries21D, spread21D);

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. CREDIT STRESS — HYG/IEF ratio distance from its 50-day SMA
    //    Percentile rank: higher distance = healthier = more greed
    // ═══════════════════════════════════════════════════════════════════════════
    const hygCloses = getCloses('HYG');
    const iefCloses = getCloses('IEF');
    const minCreditLen = Math.min(hygCloses.length, iefCloses.length);

    let creditRatio = null;
    let creditSma50 = null;
    let creditDistancePct = null;
    let creditPercentile = null;

    if (minCreditLen >= 50) {
      const hygAligned = hygCloses.slice(-minCreditLen);
      const iefAligned = iefCloses.slice(-minCreditLen);
      const ratioSeries = hygAligned.map((h, i) => iefAligned[i] > 0 ? h / iefAligned[i] : null).filter(v => v != null);

      creditRatio = ratioSeries[ratioSeries.length - 1];
      creditSma50 = computeSMA(ratioSeries, 50);

      // Build historical distance series for percentile ranking
      const distanceSeries = [];
      for (let i = 49; i < ratioSeries.length; i++) {
        const sma = ratioSeries.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50;
        if (sma > 0) {
          distanceSeries.push(((ratioSeries[i] - sma) / sma) * 100);
        }
      }

      creditDistancePct = distanceSeries.length > 0 ? distanceSeries[distanceSeries.length - 1] : null;
      creditPercentile = percentileRank(distanceSeries, creditDistancePct);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. DOCTOR COPPER vs GOLD — 50-Day vs 200-Day MA crossover of ratio
    //    Percentile rank based on gap between 50-MA and 200-MA
    //    Higher gap = more growth = more greed
    // ═══════════════════════════════════════════════════════════════════════════
    const copperCloses = getCloses('HG=F');
    const goldCloses = getCloses('GC=F');
    const minCopperGoldLen = Math.min(copperCloses.length, goldCloses.length);

    let copperPrice = null;
    let goldPrice = null;
    let copperGoldRatio = null;
    let copperGoldSma50 = null;
    let copperGoldSma200 = null;
    let copperGoldCrossover = null;
    let copperGoldGapPct = null;
    let copperGoldPercentile = null;

    if (minCopperGoldLen >= 200) {
      const copperAligned = copperCloses.slice(-minCopperGoldLen);
      const goldAligned = goldCloses.slice(-minCopperGoldLen);
      const ratioSeries = copperAligned.map((c, i) => goldAligned[i] > 0 ? c / goldAligned[i] : null).filter(v => v != null);

      copperPrice = copperCloses[copperCloses.length - 1];
      goldPrice = goldCloses[goldCloses.length - 1];
      copperGoldRatio = ratioSeries[ratioSeries.length - 1];
      copperGoldSma50 = computeSMA(ratioSeries, 50);
      copperGoldSma200 = computeSMA(ratioSeries, 200);

      if (copperGoldSma50 != null && copperGoldSma200 != null) {
        copperGoldCrossover = copperGoldSma50 > copperGoldSma200 ? 'bullish' : 'bearish';
        copperGoldGapPct = ((copperGoldSma50 - copperGoldSma200) / copperGoldSma200) * 100;
      }

      // Build historical gap series for percentile ranking
      const sma50Series = rollingSMA(ratioSeries, 50);
      const sma200Series = rollingSMA(ratioSeries, 200);
      // sma50Series starts at index 49, sma200Series starts at index 199
      // Align: sma50 has (len - 49) entries, sma200 has (len - 199) entries
      // The overlap starts at entry [150] of sma50Series (which corresponds to ratioSeries[199])
      const overlap = Math.min(sma50Series.length, sma200Series.length);
      const gapSeries = [];
      for (let i = 0; i < overlap; i++) {
        const s50 = sma50Series[sma50Series.length - overlap + i];
        const s200 = sma200Series[sma200Series.length - overlap + i];
        if (s200 > 0) gapSeries.push(((s50 - s200) / s200) * 100);
      }

      copperGoldPercentile = percentileRank(gapSeries, copperGoldGapPct);
    } else if (minCopperGoldLen >= 50) {
      // Fallback: at least show current values even if we can't compute 200-day
      const copperAligned = copperCloses.slice(-minCopperGoldLen);
      const goldAligned = goldCloses.slice(-minCopperGoldLen);
      const ratioSeries = copperAligned.map((c, i) => goldAligned[i] > 0 ? c / goldAligned[i] : null).filter(v => v != null);
      copperPrice = copperCloses[copperCloses.length - 1];
      goldPrice = goldCloses[goldCloses.length - 1];
      copperGoldRatio = ratioSeries[ratioSeries.length - 1];
      copperGoldSma50 = computeSMA(ratioSeries, 50);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. MARKET BREADTH — 10-Day SMA of daily (RSP - SPY + IWM - SPY) / 2
    //    Percentile rank: higher = broader rally = more greed
    // ═══════════════════════════════════════════════════════════════════════════
    const rspReturns = getReturns('RSP');
    const spyReturns = getReturns('SPY');
    const iwmReturns = getReturns('IWM');
    const minBreadthLen = Math.min(rspReturns.length, spyReturns.length, iwmReturns.length);

    let breadthToday = null;
    let breadthSma10 = null;
    let breadthPercentile = null;

    if (minBreadthLen >= 10) {
      // Build full daily spread series
      const spreadSeries = [];
      for (let i = 0; i < minBreadthLen; i++) {
        const rspIdx = rspReturns.length - minBreadthLen + i;
        const spyIdx = spyReturns.length - minBreadthLen + i;
        const iwmIdx = iwmReturns.length - minBreadthLen + i;
        const rspSpread = rspReturns[rspIdx] - spyReturns[spyIdx];
        const iwmSpread = iwmReturns[iwmIdx] - spyReturns[spyIdx];
        spreadSeries.push((rspSpread + iwmSpread) / 2);
      }

      breadthToday = spreadSeries[spreadSeries.length - 1];

      // Build rolling 10-day SMA series for percentile ranking
      const sma10Series = rollingSMA(spreadSeries, 10);
      breadthSma10 = sma10Series.length > 0 ? sma10Series[sma10Series.length - 1] : null;
      breadthPercentile = percentileRank(sma10Series, breadthSma10);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. FINANCIAL CONDITIONS — 10Y Yield + DXY distance from 50-SMA
    //    INVERTED: higher distance = tighter = more FEAR
    //    percentileRank gives us "% of days that were LESS tight"
    //    Score = 100 - percentileRank (because tighter = more fear = lower score)
    // ═══════════════════════════════════════════════════════════════════════════
    const tnxCloses = getCloses('^TNX');
    const dxyCloses = getCloses('DX-Y.NYB');

    let yieldCurrent = null;
    let yieldSma50 = null;
    let yieldDistancePct = null;
    let dxyCurrent = null;
    let dxySma50 = null;
    let dxyDistancePct = null;
    let financialPercentile = null;

    // Build individual distance series
    const buildDistanceSeries = (closes) => {
      if (closes.length < 50) return { series: [], current: null, sma50: null, distPct: null };
      const distSeries = [];
      for (let i = 49; i < closes.length; i++) {
        const sma = closes.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50;
        if (sma > 0) distSeries.push(((closes[i] - sma) / sma) * 100);
      }
      const current = closes[closes.length - 1];
      const sma50Val = computeSMA(closes, 50);
      const distPct = sma50Val > 0 ? ((current - sma50Val) / sma50Val) * 100 : null;
      return { series: distSeries, current, sma50: sma50Val, distPct };
    };

    const yieldDist = buildDistanceSeries(tnxCloses);
    const dxyDist = buildDistanceSeries(dxyCloses);

    yieldCurrent = yieldDist.current;
    yieldSma50 = yieldDist.sma50;
    yieldDistancePct = yieldDist.distPct;
    dxyCurrent = dxyDist.current;
    dxySma50 = dxyDist.sma50;
    dxyDistancePct = dxyDist.distPct;

    // Combined financial stress: average both distance series, then percentile rank (inverted)
    const minFinLen = Math.min(yieldDist.series.length, dxyDist.series.length);
    if (minFinLen > 0) {
      const combinedSeries = [];
      for (let i = 0; i < minFinLen; i++) {
        const yIdx = yieldDist.series.length - minFinLen + i;
        const dIdx = dxyDist.series.length - minFinLen + i;
        combinedSeries.push((yieldDist.series[yIdx] + dxyDist.series[dIdx]) / 2);
      }
      const currentCombined = combinedSeries[combinedSeries.length - 1];
      // INVERT: higher combined = tighter conditions = more fear = LOWER score
      const rawPctile = percentileRank(combinedSeries, currentCombined);
      financialPercentile = rawPctile != null ? 100 - rawPctile : null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COMPOSITE: Weighted percentile-rank score (Systemic)
    // ═══════════════════════════════════════════════════════════════════════════
    const signalScores = {
      credit: creditPercentile,
      financial: financialPercentile,
      risk: riskPercentile,
      breadth: breadthPercentile,
      copperGold: copperGoldPercentile,
    };

    let systemicScore = null;
    let sTotalWeight = 0;
    let sWeightedSum = 0;
    for (const [key, weight] of Object.entries(SYSTEMIC_WEIGHTS)) {
      const score = signalScores[key];
      if (score != null) {
        sWeightedSum += score * weight;
        sTotalWeight += weight;
      }
    }
    if (sTotalWeight > 0) {
      systemicScore = sWeightedSum / sTotalWeight;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONTRARIAN COMPOSITE (Behavioral Emotion)
    // ═══════════════════════════════════════════════════════════════════════════

    // 1. PANIC CURVE (VIX / VIX3M)
    const vixCloses = getCloses('^VIX');
    const vix3mCloses = getCloses('^VIX3M');
    const minVixLen = Math.min(vixCloses.length, vix3mCloses.length);

    let panicCurveCurrent = null;
    let panicCurvePercentile = null;
    let vixCurrent = null;
    let vix3mCurrent = null;

    if (minVixLen > 0) {
      vixCurrent = vixCloses[vixCloses.length - 1];
      vix3mCurrent = vix3mCloses[vix3mCloses.length - 1];
      const vixAligned = vixCloses.slice(-minVixLen);
      const vix3mAligned = vix3mCloses.slice(-minVixLen);
      const ratioSeries = vixAligned.map((v, i) => vix3mAligned[i] > 0 ? v / vix3mAligned[i] : null).filter(val => val != null);
      
      if (ratioSeries.length > 0) {
        panicCurveCurrent = ratioSeries[ratioSeries.length - 1];
        // Invert: High ratio (>1.0) = Panic = Low Score (0)
        // Low ratio (<1.0) = Contango/Greed = High Score (100)
        // Percentile rank tells us "% of days that were LOWER than current". 
        // If current is very high panic, percentile is high. So we do 100 - percentile.
        const rawPctile = percentileRank(ratioSeries, panicCurveCurrent);
        panicCurvePercentile = rawPctile != null ? 100 - rawPctile : null;
      }
    }

    // 2. RUBBER BAND (^GSPC distance from 200 SMA)
    const spxCloses = getCloses('^GSPC');
    let rubberBandCurrentPct = null;
    let rubberBandPercentile = null;
    let spxPrice = null;
    let spxSma200 = null;
    let spxSma50 = null;

    if (spxCloses.length >= 200) {
      spxPrice = spxCloses[spxCloses.length - 1];
      spxSma200 = computeSMA(spxCloses, 200);
      spxSma50 = computeSMA(spxCloses, 50);
      
      // Build historical distance series for percentile ranking
      const distSeries = [];
      for (let i = 199; i < spxCloses.length; i++) {
        const sma200 = spxCloses.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200;
        if (sma200 > 0) {
          distSeries.push(((spxCloses[i] - sma200) / sma200) * 100);
        }
      }
      
      if (distSeries.length > 0) {
        rubberBandCurrentPct = distSeries[distSeries.length - 1];
        // Higher distance (%) = more overbought = more GREED (High score)
        rubberBandPercentile = percentileRank(distSeries, rubberBandCurrentPct);
      }
    }

    // Contrarian Composite
    const emotionScores = {
      breadth: breadthPercentile,
      risk: riskPercentile,
      panicCurve: panicCurvePercentile,
      rubberBand: rubberBandPercentile,
    };

    let contrarianScore = null;
    let eTotalWeight = 0;
    let eWeightedSum = 0;
    
    for (const [key, weight] of Object.entries(EMOTION_WEIGHTS)) {
      const score = emotionScores[key];
      if (score != null) {
        eWeightedSum += score * weight;
        eTotalWeight += weight;
      }
    }
    if (eTotalWeight > 0) {
      contrarianScore = eWeightedSum / eTotalWeight;
    }

    // ─── Assemble Response ───────────────────────────────────────────────────
    const data = {
      risk: {
        spread1D: spread1D,
        spread5D: spread5D,
        spread21D: spread21D,
        avgRisk1D, avgSafe1D,
        avgRisk21D, avgSafe21D,
        percentile: riskPercentile,
        riskSymbolsData,
        safeSymbolsData,
      },
      credit: {
        ratio: creditRatio,
        sma50: creditSma50,
        distancePct: creditDistancePct,
        percentile: creditPercentile,
      },
      copperGold: {
        copperPrice,
        goldPrice,
        ratio: copperGoldRatio,
        sma50: copperGoldSma50,
        sma200: copperGoldSma200,
        crossover: copperGoldCrossover,
        gapPct: copperGoldGapPct,
        percentile: copperGoldPercentile,
      },
      breadth: {
        today: breadthToday,
        sma10: breadthSma10,
        percentile: breadthPercentile,
      },
      financial: {
        yieldCurrent,
        yieldSma50,
        yieldDistancePct,
        dxyCurrent,
        dxySma50,
        dxyDistancePct,
        percentile: financialPercentile,
      },
      panic: {
        vix: vixCurrent,
        vix3m: vix3mCurrent,
        curve: panicCurveCurrent,
        percentile: panicCurvePercentile
      },
      rubberband: {
        price: spxPrice,
        sma50: spxSma50,
        sma200: spxSma200,
        pct: rubberBandCurrentPct,
        percentile: rubberBandPercentile
      },
      systemic: {
        score: systemicScore,
        weights: SYSTEMIC_WEIGHTS,
        signalScores,
      },
      contrarian: {
        score: contrarianScore,
        weights: EMOTION_WEIGHTS,
        signalScores: emotionScores,
      }
    };

    console.log(`[Sentiment] Signals computed. Systemic: ${systemicScore?.toFixed(1)} | Contrarian: ${contrarianScore?.toFixed(1)}`);
    console.log(`  Credit: ${creditPercentile?.toFixed(1)} | Financial: ${financialPercentile?.toFixed(1)} | Risk: ${riskPercentile?.toFixed(1)} | Breadth: ${breadthPercentile?.toFixed(1)} | Copper: ${copperGoldPercentile?.toFixed(1)}`);
    cache.set(cacheKey, { data, ts: Date.now() });
    res.json({ ...data, cached: false });
  } catch (err) {
    console.error('[Sentiment] Endpoint error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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
