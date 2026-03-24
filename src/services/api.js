// ── API Service — communicates with our Express proxy ────────────────────────
import { adjustRvol } from './timeUtils';

const API_BASE = '/api';

/**
 * Fetch quotes for an array of ticker symbols.
 * Deduplicates and sends a POST request to the Express proxy.
 */
export async function fetchQuotes(symbols) {
  if (!symbols || symbols.length === 0) return [];

  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];

  const res = await fetch(`${API_BASE}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: unique })
  });
  
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.results || [];
}

/**
 * Fetch all quotes for every sector, deduplicating tickers globally.
 * Returns a Map: symbol → quote data
 */
export async function fetchAllQuotes(categories, customTickers = [], timeframe = '1D', force = false) {
  try {
    const categoryTickers = categories.flatMap(cat => 
      cat.themes.flatMap(theme => theme.tickers)
    );
    
    // Deduplicate array
    const allSymbols = [...new Set([...categoryTickers, ...customTickers])];

    const response = await fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: allSymbols, timeframe, force })
    });
  
    if (!response.ok) {
      let msg = response.statusText;
      try {
        const errData = await response.json();
        if (errData.message || errData.error) {
          msg = errData.message || errData.error;
        }
      } catch (e) {
        // Fall back to statusText if response isn't JSON
      }
      throw new Error(`API error ${response.status}: ${msg}`);
    }

    const data = await response.json();
    const allResults = data.results || [];

    // Build lookup map
    const quoteMap = new Map();
    for (const q of allResults) {
      if (q && q.symbol) {
        quoteMap.set(q.symbol.toUpperCase(), q);
      }
    }

    return quoteMap;

  } catch (error) {
    console.error("Error fetching all quotes:", error);
    throw error; // Re-throw so App.jsx can display an error banner
  }
}

/**
 * Calculate sector-level aggregate from individual ticker quotes
 */
export function computeSectorPerformance(sector, quoteMap, timeframe = '1D') {
  const tickers = sector.tickers.map((t) => t.toUpperCase());
  const quotes = tickers
    .map((t) => quoteMap.get(t))
    .filter((q) => q && q.changePercent != null && !q.error);

  if (quotes.length === 0) {
    return { ...sector, avgChange: 0, tickerData: [], loaded: false };
  }

  // Set mapped properties (note ps and sg are pulled natively now)
  const tickerData = quotes
    .map((q) => {
      const rawRvol = (q.volume && q.avgVolume && q.avgVolume > 0) ? q.volume / q.avgVolume : null;
      const rvol = adjustRvol(rawRvol);
      const eg = (q.epsForward !== null && q.epsTrailingTwelveMonths !== null && q.epsTrailingTwelveMonths !== 0) 
        ? ((q.epsForward - q.epsTrailingTwelveMonths) / Math.abs(q.epsTrailingTwelveMonths)) * 100 
        : null;
      const peg = (q.trailingPE !== null && eg !== null && eg > 0) ? q.trailingPE / eg : null;
      const psg = (q.ps != null && q.sg != null && q.sg > 0) ? q.ps / (q.sg * 100) : null;

      let changePercent = q.changePercent;
      if (timeframe !== '1D') {
        if (q.anchorPrice !== undefined && q.anchorPrice !== null) {
          changePercent = ((q.price - q.anchorPrice) / q.anchorPrice) * 100;
        } else if (q.anchorPrice === undefined) {
          changePercent = undefined; // trigger loading state for queue
        } else {
          changePercent = null;
        }
      }

      return {
        symbol: q.symbol,
        name: q.shortName,
        price: q.price,
        change: q.change,
        changePercent,
        volume: q.volume,
        avgVolume: q.avgVolume,
        rvol,
        marketCap: q.marketCap,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow,
        trailingPE: q.trailingPE,
        forwardPE: q.forwardPE,
        epsTrailingTwelveMonths: q.epsTrailingTwelveMonths,
        epsForward: q.epsForward,
        ps: q.ps,
        sg: q.sg,
        eg,
        peg,
        psg,
      };
    })
    .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));

  // ── EQUAL-WEIGHTED AGGREGATE MATH ──
  // Helpers
  const simpleAvg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const harmonicMean = (arr) => {
    // MVD Gate: only use strictly positive values for yield inversion
    const positives = arr.filter(v => v != null && v > 0);
    // 60% threshold: need at least 3 of 5 valid data points
    if (positives.length < 3) return null;
    const yields = positives.map(v => 1 / v);
    const yieldSum = yields.reduce((a, b) => a + b, 0);
    // Negative/Cash-Burn Guardrail: if total basket yield ≤ 0, output null
    if (yieldSum <= 0) return null;
    return positives.length / yieldSum;
  };

  // Track loading states
  let hasUndefinedPS = false;
  let hasUndefinedSG = false;
  let hasUndefinedChange = false;

  for (const t of tickerData) {
    if (t.ps === undefined) hasUndefinedPS = true;
    if (t.sg === undefined) hasUndefinedSG = true;
    if (t.changePercent === undefined) hasUndefinedChange = true;
  }

  // 1. MOMENTUM & FUNDAMENTAL GROWTH (Simple Average)
  const changeVals = tickerData.filter(t => t.changePercent != null).map(t => t.changePercent);
  const rvolVals = tickerData.filter(t => t.rvol != null).map(t => t.rvol);
  const sgVals = tickerData.filter(t => t.sg != null).map(t => t.sg);
  const egVals = tickerData.filter(t => t.eg != null).map(t => t.eg);

  const avgChange = hasUndefinedChange ? undefined : simpleAvg(changeVals);
  const avgRvol = simpleAvg(rvolVals);
  const avgSG = hasUndefinedSG ? undefined : simpleAvg(sgVals);
  const avgEG = simpleAvg(egVals);

  // 2. VALUATION MULTIPLES (Harmonic Mean / Yield Inversion)
  const peVals = tickerData.map(t => t.trailingPE).filter(v => v != null);
  const fpeVals = tickerData.map(t => t.forwardPE).filter(v => v != null);
  const psVals = tickerData.map(t => t.ps).filter(v => v != null);
  const pegVals = tickerData.map(t => t.peg).filter(v => v != null);
  const psgVals = tickerData.map(t => t.psg).filter(v => v != null);

  const avgPE = harmonicMean(peVals);
  const avgFwdPE = harmonicMean(fpeVals);
  const avgPS = hasUndefinedPS ? undefined : harmonicMean(psVals);
  const avgPEG = harmonicMean(pegVals);
  const avgPSG = (hasUndefinedPS || hasUndefinedSG) ? undefined : harmonicMean(psgVals);

  // 3. DISPERSION (Population Standard Deviation of CHANGE values)
  let dispersion = 0;
  if (changeVals.length > 1) {
    const mean = changeVals.reduce((a, b) => a + b, 0) / changeVals.length;
    const variance = changeVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / changeVals.length;
    dispersion = Math.sqrt(variance);
  }

  return { 
    ...sector, 
    avgChange, 
    avgRvol, 
    avgEG,
    avgPE, 
    avgSG,
    avgFwdPE, 
    avgPS,
    avgPEG,
    avgPSG,
    dispersion, 
    tickerData, 
    loaded: true 
  };
}
