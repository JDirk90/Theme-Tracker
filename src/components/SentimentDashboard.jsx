import { useEffect, useState } from 'react';

// ── Sentiment Ticker Baskets ─────────────────────────────────────────────────
const RISK_ON = ['SPHB', 'ARKK', 'IBIT', 'MEME'];
const SAFE_HAVEN = ['GLD', 'TLT', 'XLU', 'XLP'];

// ── Tooltip Explanations (Pro-Standard) ──────────────────────────────────────
const SIGNAL_TOOLTIPS = {
  risk: 'Compares cumulative performance of high-beta (SPHB, ARKK, IBIT, MEME) vs safe-haven (GLD, TLT, XLU, XLP). The 1-Month spread is the primary structured metric. Weight: 40% (Emotion).',
  credit: 'HYG/IEF price ratio relative to 50-Day Moving Average. The most important structural indicator. Weight: 35% (Systemic).',
  panic: 'VIX / VIX3M Term Structure. Ranges from Contango (healthy) to Backwardation (panic). Weight: 25% (Emotion).',
  breadth: '10-Day SMA of daily spread between RSP/IWM and SPY. The ultimate hybrid indicator. Weight: 25% (Systemic) / 20% (Emotion).',
  copper: 'Copper/Gold 50-Day vs 200-Day MAs. The macro "cargo ship" indicator. Weight: 15% (Systemic).',
  liquidity: '10-Year Yield and DXY distance from 50-Day MAs. Tight liquidity chokes markets. Weight: 25% (Systemic).',
  rubberband: 'Distance of S&P 500 from its 200-SMA. Evaluates mean-reversion risk. Weight: 15% (Emotion).',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v, decimals = 2) {
  if (v == null) return '--';
  return v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(v) {
  if (v == null) return '--';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function fmtPrice(v) {
  if (v == null) return '--';
  if (v >= 100) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toFixed(2);
}

function fmtRatio(v, decimals = 5) {
  if (v == null) return '--';
  return v.toFixed(decimals);
}

function getSystemicLabel(score) {
  if (score == null) return { text: 'Loading', className: 'neutral' };
  if (score <= 20) return { text: 'Broken', className: 'extreme-fear' };
  if (score <= 35) return { text: 'Danger', className: 'fear' };
  if (score <= 45) return { text: 'Weak', className: 'mild-fear' };
  if (score <= 55) return { text: 'Neutral', className: 'neutral' };
  if (score <= 65) return { text: 'Stable', className: 'mild-greed' };
  if (score <= 80) return { text: 'Healthy', className: 'greed' };
  return { text: 'Robust', className: 'extreme-greed' };
}

function getContrarianLabel(score) {
  if (score == null) return { text: 'Loading', className: 'neutral' };
  if (score <= 20) return { text: 'Extreme Panic', className: 'extreme-fear' };
  if (score <= 35) return { text: 'Fear', className: 'fear' };
  if (score <= 45) return { text: 'Nervous', className: 'mild-fear' };
  if (score <= 55) return { text: 'Neutral', className: 'neutral' };
  if (score <= 65) return { text: 'Complacent', className: 'mild-greed' };
  if (score <= 80) return { text: 'Greedy', className: 'greed' };
  return { text: 'Extreme Euphoria', className: 'extreme-greed' };
}

function getPercentileLabel(score) {
  if (score == null) return { text: '--', cls: 'badge-neutral' };
  if (score <= 20) return { text: 'Very Low', cls: 'badge-extreme-fear' };
  if (score <= 35) return { text: 'Low', cls: 'badge-fear' };
  if (score <= 45) return { text: 'Slightly Low', cls: 'badge-mild-fear' };
  if (score <= 55) return { text: 'Neutral', cls: 'badge-neutral' };
  if (score <= 65) return { text: 'Slightly High', cls: 'badge-mild-greed' };
  if (score <= 80) return { text: 'High', cls: 'badge-greed' };
  return { text: 'Very High', cls: 'badge-greed' };
}

// ── Percentile Score Pill (small inline display) ────────────────────────────
function PercentilePill({ score, weightStr }) {
  const label = getPercentileLabel(score);
  return (
    <div className="percentile-pill">
      <span className={`percentile-score font-mono ${label.cls}`}>
        {score != null ? Math.round(score) : '--'}
      </span>
      {weightStr && (
        <span className="percentile-weight font-mono">{weightStr}</span>
      )}
    </div>
  );
}

// ── Linear Gauge Subcomponent ────────────────────────────────────────────────
function LinearGauge({ title, score, labelInfo }) {
  const needlePos = score != null ? Math.max(0, Math.min(100, score)) : 50;
  return (
    <div className="sentiment-gauge-wrapper compact-gauge">
      <div className="sentiment-gauge-header">
        <span className="sentiment-gauge-title">{title}</span>
        <span className={`sentiment-gauge-label ${labelInfo.className}`}>
          {labelInfo.text}
        </span>
      </div>
      <div className="sentiment-gauge-track">
        <div className="sentiment-gauge-gradient" />
        <div className="sentiment-gauge-needle" style={{ left: `${needlePos}%` }}>
          <div className="needle-line" />
          <div className="needle-score font-mono">{score != null ? Math.round(score) : '--'}</div>
        </div>
        <div className="sentiment-gauge-labels">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
    </div>
  );
}

// ── 2D Sentiment Matrix ──────────────────────────────────────────────────────
function SentimentMatrix({ x, y }) {
  const plotX = x != null ? Math.max(0, Math.min(100, x)) : 50;
  const plotY = y != null ? Math.max(0, Math.min(100, y)) : 50;

  let zoneText = 'NEUTRAL';
  let zoneCls = 'matrix-neutral';
  let zoneDesc = 'Wait for extremes.';

  if (plotX >= 50 && plotY <= 50) {
    zoneText = 'HEALTHY + PANIC'; zoneCls = 'matrix-buy';
    zoneDesc = 'Market plumbing is stable, but behavioral emotion is highly fearful.';
  } else if (plotX < 50 && plotY > 50) {
    zoneText = 'WEAK + EUPHORIA'; zoneCls = 'matrix-sell';
    zoneDesc = 'Structural reality is deteriorating, but behavioral emotion remains highly complacent or euphoric.';
  } else if (plotX >= 50 && plotY > 50) {
    zoneText = 'HEALTHY + EUPHORIA'; zoneCls = 'matrix-bull';
    zoneDesc = 'Market plumbing is stable, and behavioral emotion is highly complacent or euphoric.';
  } else if (plotX < 50 && plotY <= 50) {
    zoneText = 'WEAK + PANIC'; zoneCls = 'matrix-bear';
    zoneDesc = 'Structural reality is deteriorating, and behavioral emotion aligns with deep fear.';
  }

  // Force dot into center if loading
  const px = x == null ? 50 : plotX;
  const py = y == null ? 50 : plotY;

  return (
    <div className="matrix-hero-container">
      <div className="sentiment-matrix">
        <div className="matrix-quadrant quad-tl" />
        <div className="matrix-quadrant quad-tr" />
        <div className="matrix-quadrant quad-bl" />
        <div className="matrix-quadrant quad-br" />

        <div className="matrix-axis-x" />
        <div className="matrix-axis-y" />
        <div className="matrix-dot" style={{ left: `${px}%`, bottom: `${py}%` }}>
          {x != null && <div className={`matrix-dot-pulse ${zoneCls}`} />}
          <div className="matrix-dot-core" />
        </div>

        <div className="matrix-label grid-top">Euphoria</div>
        <div className="matrix-label grid-bottom">Panic</div>
        <div className="matrix-label grid-left">Danger</div>
        <div className="matrix-label grid-right">Healthy</div>

        <div className="matrix-title-x">Structural Health</div>
        <div className="matrix-title-y">Emotion</div>
      </div>

      <div className="matrix-readout">
        <div className="matrix-readout-title">Current Market Zone</div>
        <div className={`matrix-zone-badge ${zoneCls}`}>{zoneText}</div>
        <div className="matrix-zone-desc">{zoneDesc}</div>
        <div className="matrix-coords">
          <div className="coord"><span className="coord-lbl">Systemic:</span> <span className="font-mono">{x != null ? Math.round(x) : '--'}</span></div>
          <div className="coord"><span className="coord-lbl">Emotion:</span> <span className="font-mono">{y != null ? Math.round(y) : '--'}</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export default function SentimentDashboard({ quoteMap }) {
  const [smaData, setSmaData] = useState(null);
  const [signals, setSignals] = useState(null);

  // Fetch SMA data (Rubber Band front-end fallback) on mount
  useEffect(() => {
    fetch('/api/sma')
      .then(r => r.json())
      .then(data => { if (!data.error) setSmaData(data); })
      .catch(() => { });
  }, []);

  // Fetch sentiment signals on mount
  useEffect(() => {
    fetch('/api/sentiment-signals')
      .then(r => r.json())
      .then(data => { if (!data.error) setSignals(data); })
      .catch(() => { });
  }, []);

  // ── Backend Processed Data ───────────────────────────────────────────────
  const systemicScore = signals?.systemic?.score ?? null;
  const weights = signals?.systemic?.weights ?? {};
  const signalScores = signals?.systemic?.signalScores ?? {};

  const contrarianScore = signals?.contrarian?.score ?? null;

  const systemicLabel = getSystemicLabel(systemicScore);
  const contrarianLabel = getContrarianLabel(contrarianScore);

  // ── Fallbacks from Quote Map if Backend Loading ───────────────────────────
  const getPrice = (sym) => quoteMap.get(sym)?.price ?? null;
  const vixPrice = getPrice('^VIX');
  const vix3mPrice = getPrice('^VIX3M');
  const fallbackPanic = (vixPrice != null && vix3mPrice != null && vix3mPrice > 0) ? vixPrice / vix3mPrice : null;

  const rbPrice = smaData?.price;
  const rb200 = smaData?.sma200;
  const rb125 = smaData?.sma125;
  const rb50 = smaData?.sma50;
  const fallbackRbPct = (rbPrice != null && rb200 != null && rb200 > 0) ? ((rbPrice - rb200) / rb200) * 100 : null;

  // ── Systemic Cards ───────────────────────────────────────────────────────
  const renderRiskCard = () => {
    const spread21D = signals?.risk?.spread21D;
    const spread5D = signals?.risk?.spread5D;
    const spread1D = signals?.risk?.spread1D;
    const pctile = signals?.risk?.percentile;
    const badge = getPercentileLabel(pctile);

    return (
      <div className="sentiment-card" data-tooltip={SIGNAL_TOOLTIPS.risk}>
        <div className="sentiment-card-icon">⚔️</div>
        <div className="sentiment-card-body">
          <div className="sentiment-card-header-row">
            <div>
              <div className="sentiment-card-title">Risk vs. Safety</div>
              <div className="sentiment-card-subtitle">SPHB/ARKK/IBIT/MEME vs GLD/TLT/XLU/XLP</div>
            </div>
            <PercentilePill score={pctile} weightStr="40% EMO" />
          </div>

          <div className="signal-timeframes">
            <div className="signal-tf">
              <span className="signal-tf-label">Today</span>
              <span className={`signal-tf-value font-mono ${spread1D == null ? '' : spread1D >= 0 ? 'text-gain' : 'text-loss'}`}>
                {fmtPct(spread1D)}
              </span>
            </div>
            <div className="signal-tf">
              <span className="signal-tf-label">This Week</span>
              <span className={`signal-tf-value font-mono ${spread5D == null ? '' : spread5D >= 0 ? 'text-gain' : 'text-loss'}`}>
                {fmtPct(spread5D)}
              </span>
            </div>
            <div className="signal-tf signal-tf-hero">
              <span className="signal-tf-label">This Month</span>
              <span className={`signal-hero-value font-mono ${spread21D == null ? '' : spread21D >= 0 ? 'text-gain' : 'text-loss'}`}>
                {fmtPct(spread21D)}
              </span>
            </div>
          </div>

          <div className="sentiment-card-metrics">
            <span className={`sentiment-signal-badge ${badge.cls}`}>
              {badge.text}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderCreditCard = () => {
    const ratio = signals?.credit?.ratio;
    const sma50 = signals?.credit?.sma50;
    const distPct = signals?.credit?.distancePct;
    const pctile = signals?.credit?.percentile;
    const badge = getPercentileLabel(pctile);

    return (
      <div className="sentiment-card" data-tooltip={SIGNAL_TOOLTIPS.credit}>
        <div className="sentiment-card-icon">🏦</div>
        <div className="sentiment-card-body">
          <div className="sentiment-card-header-row">
            <div>
              <div className="sentiment-card-title">Credit Stress</div>
              <div className="sentiment-card-subtitle">HYG / IEF Ratio — Distance from 50-SMA</div>
            </div>
            <PercentilePill score={pctile} weightStr="35% SYS" />
          </div>

          <div className="signal-detail-grid">
            <div className="signal-detail">
              <span className="signal-detail-label">Ratio</span>
              <span className="signal-detail-value font-mono">{fmtRatio(ratio, 4)}</span>
            </div>
            <div className="signal-detail">
              <span className="signal-detail-label">50-SMA</span>
              <span className="signal-detail-value font-mono">{fmtRatio(sma50, 4)}</span>
            </div>
          </div>

          <div className="sentiment-card-metrics">
            <span className={`sentiment-card-value font-mono ${distPct == null ? '' : distPct >= 0 ? 'text-gain' : 'text-loss'}`}>
              {fmtPct(distPct)}
            </span>
            <span className="sentiment-card-value-label">vs 50-SMA</span>
            <span className={`sentiment-signal-badge ${badge.cls}`}>
              {badge.text}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderCopperGoldCard = () => {
    const cg = signals?.copperGold;
    const isBullish = cg?.crossover === 'bullish';
    const pctile = cg?.percentile;
    const badge = getPercentileLabel(pctile);

    return (
      <div className="sentiment-card" data-tooltip={SIGNAL_TOOLTIPS.copper}>
        <div className="sentiment-card-icon">🔬</div>
        <div className="sentiment-card-body">
          <div className="sentiment-card-header-row">
            <div>
              <div className="sentiment-card-title">Doctor Copper vs Gold</div>
              <div className="sentiment-card-subtitle">50-Day vs 200-Day MA Crossover</div>
            </div>
            <PercentilePill score={pctile} weightStr="15% SYS" />
          </div>

          <div className="signal-detail-grid">
            <div className="signal-detail">
              <span className="signal-detail-label">50-Day MA</span>
              <span className="signal-detail-value font-mono">{fmtRatio(cg?.sma50)}</span>
            </div>
            <div className="signal-detail">
              <span className="signal-detail-label">200-Day MA</span>
              <span className="signal-detail-value font-mono">{fmtRatio(cg?.sma200)}</span>
            </div>
          </div>

          <div className="sentiment-card-metrics">
            <span className={`signal-crossover font-mono ${isBullish ? 'text-gain' : 'text-loss'}`}>
              {cg?.crossover === 'bullish' ? '50 > 200' : cg?.crossover === 'bearish' ? '50 < 200' : '--'}
            </span>
            <span className={`sentiment-signal-badge ${badge.cls}`}>
              {badge.text}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderBreadthCard = () => {
    const breadthToday = signals?.breadth?.today;
    const sma10 = signals?.breadth?.sma10;
    const pctile = signals?.breadth?.percentile;
    const badge = getPercentileLabel(pctile);

    return (
      <div className="sentiment-card" data-tooltip={SIGNAL_TOOLTIPS.breadth}>
        <div className="sentiment-card-icon">📐</div>
        <div className="sentiment-card-body">
          <div className="sentiment-card-header-row">
            <div>
              <div className="sentiment-card-title">Market Breadth</div>
              <div className="sentiment-card-subtitle">10-Day SMA of (RSP + IWM vs SPY)</div>
            </div>
            <PercentilePill score={pctile} weightStr="25% SYS | 20% EMO" />
          </div>

          <div className="signal-detail-grid">
            <div className="signal-detail">
              <span className="signal-detail-label">Today</span>
              <span className={`signal-detail-value font-mono ${breadthToday == null ? '' : breadthToday >= 0 ? 'text-gain' : 'text-loss'}`}>
                {fmtPct(breadthToday)}
              </span>
            </div>
            <div className="signal-detail">
              <span className="signal-detail-label">10-Day Avg</span>
              <span className={`signal-detail-value font-mono ${sma10 == null ? '' : sma10 >= 0 ? 'text-gain' : 'text-loss'}`}>
                {fmtPct(sma10)}
              </span>
            </div>
          </div>

          <div className="sentiment-card-metrics">
            <span className={`sentiment-signal-badge ${badge.cls}`}>
              {badge.text}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderLiquidity = () => {
    const fin = signals?.financial;
    const pctile = fin?.percentile;
    const badge = getPercentileLabel(pctile);

    return (
      <div className="sentiment-card" data-tooltip={SIGNAL_TOOLTIPS.liquidity}>
        <div className="sentiment-card-icon">💧</div>
        <div className="sentiment-card-body">
          <div className="sentiment-card-header-row">
            <div>
              <div className="sentiment-card-title">Liquidity Conditions</div>
              <div className="sentiment-card-subtitle">DXY + 10Y Yield — Distance from 50-SMA</div>
            </div>
            <PercentilePill score={pctile} weightStr="25% SYS" />
          </div>

          <div className="liq-detail-rows">
            <div className="liq-row">
              <span className="liq-sym font-mono">10Y</span>
              <span className={`liq-val font-mono ${fin?.yieldDistancePct == null ? '' : fin?.yieldDistancePct >= 0 ? 'text-loss' : 'text-gain'}`}>
                {fmtPct(fin?.yieldDistancePct)}
              </span>
            </div>
            <div className="liq-row">
              <span className="liq-sym font-mono">DXY</span>
              <span className={`liq-val font-mono ${fin?.dxyDistancePct == null ? '' : fin?.dxyDistancePct >= 0 ? 'text-loss' : 'text-gain'}`}>
                {fmtPct(fin?.dxyDistancePct)}
              </span>
            </div>
          </div>

          <div className="sentiment-card-metrics">
            <span className={`sentiment-signal-badge ${badge.cls}`}>
              {badge.text}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // ── Contrarian Cards ─────────────────────────────────────────────────────
  const renderPanicCard = () => {
    const val = signals?.panic?.curve ?? fallbackPanic;
    const vix = signals?.panic?.vix;
    const vix3m = signals?.panic?.vix3m;
    const pctile = signals?.panic?.percentile;
    const badge = getPercentileLabel(pctile);

    return (
      <div className="sentiment-card" data-tooltip={SIGNAL_TOOLTIPS.panic}>
        <div className="sentiment-card-icon">🌡️</div>
        <div className="sentiment-card-body" style={{ flex: 1 }}>
          <div className="sentiment-card-header-row">
            <div>
              <div className="sentiment-card-title">Panic Curve</div>
              <div className="sentiment-card-subtitle">VIX / VIX3M</div>
            </div>
            <PercentilePill score={pctile} weightStr="25% EMO" />
          </div>

          <div className="rb-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="rb-sma-block">
              <div className="rb-sma-label">VIX</div>
              <div className="rb-sma-value font-mono" style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{vix != null ? vix.toFixed(2) : '--'}</div>
            </div>
            <div className="rb-sma-block">
              <div className="rb-sma-label">VIX3M</div>
              <div className="rb-sma-value font-mono" style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{vix3m != null ? vix3m.toFixed(2) : '--'}</div>
            </div>
          </div>

          <div className="sentiment-card-metrics" style={{ marginTop: '12px' }}>
            <span className={`sentiment-card-value font-mono ${val == null ? '' : val >= 1.0 ? 'text-loss' : 'text-gain'}`}>
              {val != null ? val.toFixed(4) : '--'}
            </span>
            <span className="sentiment-card-value-label">RATIO</span>
            <span className={`sentiment-signal-badge ${badge.cls}`}>
              {badge.text}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderRubberBand = () => {
    const valPct = signals?.rubberband?.pct ?? fallbackRbPct;
    const pctile = signals?.rubberband?.percentile;
    const badge = getPercentileLabel(pctile);

    // Front-end calculated SMAs vs Backend
    const dispPrice = signals?.rubberband?.price ?? rbPrice;
    const dispSma200 = signals?.rubberband?.sma200 ?? rb200;
    const dispSma50 = signals?.rubberband?.sma50 ?? rb50;
    const sma50Pct = (dispPrice != null && dispSma50 != null && dispSma50 > 0) ? ((dispPrice - dispSma50) / dispSma50) * 100 : null;

    return (
      <div className="sentiment-card sentiment-card-wide" data-tooltip={SIGNAL_TOOLTIPS.rubberband}>
        <div className="sentiment-card-icon">🎯</div>
        <div className="sentiment-card-body" style={{ flex: 1 }}>
          <div className="sentiment-card-header-row">
            <div>
              <div className="sentiment-card-title">Rubber Band Extension</div>
              <div className="sentiment-card-subtitle">S&P 500 distance from major moving averages</div>
            </div>
            <PercentilePill score={pctile} weightStr="15% EMO" />
          </div>

          <div className="rb-grid">
            <div className="rb-price-block">
              <div className="rb-price-label">S&P 500</div>
              <div className="rb-price-value font-mono" style={{ fontSize: '1.2rem', fontWeight: 800 }}>{fmt(dispPrice)}</div>
            </div>
            <div className="rb-sma-block">
              <div className="rb-sma-label" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>200-Day SMA</div>
              <div className="rb-sma-value font-mono">{fmt(dispSma200)}</div>
              <div className={`rb-sma-pct font-mono ${valPct == null ? '' : valPct >= 0 ? 'text-gain' : 'text-loss'}`}>
                {fmtPct(valPct)}
              </div>
            </div>
            <div className="rb-sma-block">
              <div className="rb-sma-label">50-Day SMA</div>
              <div className="rb-sma-value font-mono">{fmt(dispSma50)}</div>
              <div className={`rb-sma-pct font-mono ${sma50Pct == null ? '' : sma50Pct >= 0 ? 'text-gain' : 'text-loss'}`}>
                {fmtPct(sma50Pct)}
              </div>
            </div>
          </div>

          <div className="sentiment-card-metrics" style={{ marginTop: '12px' }}>
            <span className={`sentiment-card-value font-mono ${valPct == null ? '' : valPct >= 0 ? 'text-gain' : 'text-loss'}`}>
              {fmtPct(valPct)}
            </span>
            <span className="sentiment-card-value-label">vs 200-SMA</span>
            <span className={`sentiment-signal-badge ${badge.cls}`}>
              {badge.text}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // ── Basket Breakdown ──────────────────────────────────────────────────────
  const avgRiskOn = signals?.risk?.avgRisk21D;
  const avgSafeHaven = signals?.risk?.avgSafe21D;

  return (
    <section className="sentiment-dashboard">

      {/* ── Top Hero Layer: Matrix + Linear Gauges ─────────────────────── */}
      <div className="sentiment-hero-layout">

        <SentimentMatrix x={systemicScore} y={contrarianScore} />

        <div className="hero-gauges-container">
          <LinearGauge
            title="Systemic Health (Structural)"
            score={systemicScore}
            labelInfo={systemicLabel}
          />
          <LinearGauge
            title="Emotion (Behavioral)"
            score={contrarianScore}
            labelInfo={contrarianLabel}
          />
        </div>

      </div>

      {/* ── Categorized Cards ────────────────────────────────────────── */}
      <div className="sentiment-category-header mt-8">Systemic Health Indicators</div>
      <div className="sentiment-cards-row-top" style={{ gridTemplateColumns: 'minmax(280px, 1.2fr) minmax(220px, 0.8fr) minmax(280px, 1.2fr)' }}>
        {renderCreditCard()}
        {renderLiquidity()}
        {renderCopperGoldCard()}
      </div>

      <div className="sentiment-category-header mt-8">Hybrid Indicators</div>
      <div className="sentiment-cards-row-top" style={{ marginTop: '16px', gridTemplateColumns: '1fr 1fr' }}>
        {renderBreadthCard()}
      </div>

      <div className="sentiment-category-header mt-8">Behavioral Emotion Indicators</div>
      <div className="sentiment-cards-row-top" style={{ gridTemplateColumns: 'minmax(280px, 1.2fr) minmax(220px, 0.85fr) minmax(320px, 1.3fr)' }}>
        {renderRiskCard()}
        {renderPanicCard()}
        {renderRubberBand()}
      </div>

      {/* ── Basket Breakdown ─────────────────────────────────────────── */}
      <div className="sentiment-breakdown mt-8">
        <div className="breakdown-section">
          <div className="breakdown-header">
            <span className="breakdown-title">Risk-On Basket (This Month)</span>
            <span className={`breakdown-avg font-mono ${avgRiskOn != null ? (avgRiskOn >= 0 ? 'text-gain' : 'text-loss') : ''}`}>
              {avgRiskOn != null ? fmtPct(avgRiskOn) : '--'}
            </span>
          </div>
          <div className="breakdown-tickers">
            <div className="breakdown-ticker-header-row">
              <span className="breakdown-sym" style={{ opacity: 0 }}>SYM</span>
              <span className="breakdown-name"></span>
              <span className="breakdown-tf-header">1D</span>
              <span className="breakdown-tf-header">1W</span>
              <span className="breakdown-tf-header">1M</span>
            </div>
            {RISK_ON.map(sym => {
              const q = quoteMap.get(sym);
              const hist = signals?.risk?.riskSymbolsData?.[sym];
              const pct1d = hist?.['1d'];
              const pct1w = hist?.['1w'];
              const pct1m = hist?.['1m'];
              return (
                <div key={sym} className="breakdown-ticker">
                  <span className="breakdown-sym font-mono">{sym}</span>
                  <span className="breakdown-name">{q?.shortName || sym}</span>
                  <span className={`breakdown-pct font-mono ${pct1d != null ? (pct1d >= 0 ? 'text-gain' : 'text-loss') : ''}`}>
                    {pct1d != null ? fmtPct(pct1d) : '--'}
                  </span>
                  <span className={`breakdown-pct font-mono ${pct1w != null ? (pct1w >= 0 ? 'text-gain' : 'text-loss') : ''}`}>
                    {pct1w != null ? fmtPct(pct1w) : '--'}
                  </span>
                  <span className={`breakdown-pct font-mono ${pct1m != null ? (pct1m >= 0 ? 'text-gain' : 'text-loss') : ''}`}>
                    {pct1m != null ? fmtPct(pct1m) : '--'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="breakdown-section">
          <div className="breakdown-header">
            <span className="breakdown-title">Safe Haven Basket (This Month)</span>
            <span className={`breakdown-avg font-mono ${avgSafeHaven != null ? (avgSafeHaven >= 0 ? 'text-gain' : 'text-loss') : ''}`}>
              {avgSafeHaven != null ? fmtPct(avgSafeHaven) : '--'}
            </span>
          </div>
          <div className="breakdown-tickers">
            <div className="breakdown-ticker-header-row">
              <span className="breakdown-sym" style={{ opacity: 0 }}>SYM</span>
              <span className="breakdown-name"></span>
              <span className="breakdown-tf-header">1D</span>
              <span className="breakdown-tf-header">1W</span>
              <span className="breakdown-tf-header">1M</span>
            </div>
            {SAFE_HAVEN.map(sym => {
              const q = quoteMap.get(sym);
              const hist = signals?.risk?.safeSymbolsData?.[sym];
              const pct1d = hist?.['1d'];
              const pct1w = hist?.['1w'];
              const pct1m = hist?.['1m'];
              return (
                <div key={sym} className="breakdown-ticker">
                  <span className="breakdown-sym font-mono">{sym}</span>
                  <span className="breakdown-name">{q?.shortName || sym}</span>
                  <span className={`breakdown-pct font-mono ${pct1d != null ? (pct1d >= 0 ? 'text-gain' : 'text-loss') : ''}`}>
                    {pct1d != null ? fmtPct(pct1d) : '--'}
                  </span>
                  <span className={`breakdown-pct font-mono ${pct1w != null ? (pct1w >= 0 ? 'text-gain' : 'text-loss') : ''}`}>
                    {pct1w != null ? fmtPct(pct1w) : '--'}
                  </span>
                  <span className={`breakdown-pct font-mono ${pct1m != null ? (pct1m >= 0 ? 'text-gain' : 'text-loss') : ''}`}>
                    {pct1m != null ? fmtPct(pct1m) : '--'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
