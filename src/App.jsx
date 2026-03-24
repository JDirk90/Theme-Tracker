import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CATEGORIES } from './data/sectors';
import { fetchAllQuotes, computeSectorPerformance } from './services/api';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import VisualizerView from './components/VisualizerView';
import DataTable from './components/DataTable';
import Tooltip from './components/Tooltip';

const REFRESH_INTERVAL = 60_000; // 60s matches cache TTL
const MACRO_INDICES = ['SPY', 'RSP', 'IWM', 'DX-Y.NYB', '^VIX', 'BTC-USD', 'GC=F', 'CL=F'];

const MACRO_INFO = {
  'SPY': { label: 'S&P 500', icon: '📈' },
  'RSP': { label: 'S&P 500 Eq Wgt', icon: '⚖️' },
  'IWM': { label: 'Small Caps', icon: '🏭' },
  'DX-Y.NYB': { label: 'US Dollar Index', icon: '💵' },
  '^VIX': { label: 'Volatility', icon: '📉', invert: true },
  'BTC-USD': { label: 'Bitcoin', icon: '₿' },
  'GC=F': { label: 'Gold', icon: '🪙' },
  'CL=F': { label: 'Crude Oil', icon: '🛢️' },
};

export default function App() {
  const [quoteMap, setQuoteMap] = useState(new Map());
  const [timeframe, setTimeframe] = useState('1D');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  // Tool navigation state ('Visualizer' | 'Table')
  const [activeTool, setActiveTool] = useState('Visualizer');
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const refreshTimerRef = useRef(null);

  // ── Fetch all quotes ─────────────────────────────────────────────────────
  const loadData = async (force = false) => {
    try {
      setError(null);
      const data = await fetchAllQuotes(CATEGORIES, MACRO_INDICES, timeframe, force);
      setQuoteMap(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadData(false);
    refreshTimerRef.current = setInterval(() => loadData(false), REFRESH_INTERVAL);
    return () => clearInterval(refreshTimerRef.current);
  }, [timeframe]); 

  const handleRefresh = () => {
    setLoading(true);
    loadData(true);
  };

  // ── Flatten and sort all sectors continuously ──────────────────────────────
  const allSectorsSorted = useMemo(() => {
    const flat = [];
    CATEGORIES.forEach((cat) => {
      cat.themes.forEach((s) => {
        flat.push({
          ...computeSectorPerformance(s, quoteMap, timeframe),
          category: cat.sector,
          categoryIcon: cat.icon,
          categoryColor: cat.color,
        });
      });
    });
    // Sort highest performer to lowest
    return flat.sort((a, b) => b.avgChange - a.avgChange);
  }, [quoteMap]);

  // ── Determine market state ────────────────────────────────────────────────
  const sampleQuote = quoteMap.values().next().value;
  const marketState = sampleQuote?.marketState || 'CLOSED';

  // ── Tooltip handlers ──────────────────────────────────────────────────────
  const handleSectorHover = (sector, e) => {
    setTooltipData(sector);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleSectorMove = (e) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleSectorLeave = () => {
    setTooltipData(null);
  };

  return (
    <div className="app-layout">
      <Sidebar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main-content">
        <Header
          marketState={marketState}
          lastUpdated={lastUpdated}
          loading={loading}
          onRefresh={loadData}
          onMenuToggle={() => setSidebarOpen(true)}
        />

        <div className="content-wrapper">
          {error && (
          <div className="error-banner">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {!loading && quoteMap.size > 0 && (
          <div className="summary-bar">
            {MACRO_INDICES.map((sym) => {
              const q = quoteMap.get(sym);
              if (!q || !q.price) return null;

              // Force the macro cards to respect the global timeframe selector
              let displayChange = q.changePercent;
              if (timeframe !== '1D') {
                if (q.anchorPrice !== undefined && q.anchorPrice !== null) {
                  displayChange = ((q.price - q.anchorPrice) / q.anchorPrice) * 100;
                } else if (q.anchorPrice === undefined) {
                  displayChange = undefined; // Waiting for trickle queue
                } else {
                  displayChange = null;
                }
              }
              
              const isPos = displayChange >= 0;
              const info = MACRO_INFO[sym] || { label: sym, icon: '📊' };
              
              // VIX inverts normal color logic (up = red, down = green)
              let colorClass = isPos ? 'text-gain' : 'text-loss';
              if (info.invert) {
                colorClass = isPos ? 'text-loss' : 'text-gain';
              }

              return (
                <div key={sym} className="summary-card">
                  {/* Large faded icon in background */}
                  <div className="summary-card-bg-icon">{info.icon}</div>
                  
                  <div className="summary-card-top">
                    <span className="summary-card-label">{info.label}</span>
                  </div>
                  
                  <div className="summary-card-bottom">
                    <div className={`summary-card-change font-mono font-bold ${colorClass}`} style={{ opacity: displayChange === undefined ? 0.5 : 1 }}>
                      {displayChange === undefined ? '...' : (
                        <>{isPos && displayChange > 0 ? '+' : ''}{displayChange != null ? displayChange.toFixed(2) + '%' : '--'}</>
                      )}
                    </div>
                    <div className="summary-card-price font-mono">
                      {q.price != null ? (q.price < 100 ? q.price.toFixed(2) : q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })) : '--'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {loading && quoteMap.size === 0 ? (
          <div className="loading-overlay">
            <div className="loading-spinner" />
            <div className="loading-text">Fetching market data…</div>
            <div className="loading-progress">Connecting to Yahoo Finance</div>
          </div>
        ) : (
          <>
            {activeTool === 'Visualizer' && (
              <VisualizerView
                sectors={allSectorsSorted}
                onSectorHover={handleSectorHover}
                onSectorMove={handleSectorMove}
                onSectorLeave={handleSectorLeave}
                timeframe={timeframe}
                setTimeframe={setTimeframe}
              />
            )}
            
            {activeTool === 'Table' && (
              <DataTable 
                sectors={allSectorsSorted} 
                timeframe={timeframe} 
                setTimeframe={setTimeframe} 
              />
            )}
          </>
        )}
        </div>
      </main>

      {tooltipData && activeTool === 'Visualizer' && (
        <Tooltip data={tooltipData} position={tooltipPos} />
      )}
    </div>
  );
}
