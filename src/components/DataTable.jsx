import { useState, useMemo, useRef, Fragment } from 'react';
import { CATEGORIES } from '../data/sectors';

export default function DataTable({ sectors, timeframe, setTimeframe }) {
  const [sortKey, setSortKey] = useState('avgChange');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedSectors, setExpandedSectors] = useState(new Set());
  const [showTickers, setShowTickers] = useState(false);
  const [hoverTicker, setHoverTicker] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  // Build a lookup: ticker → { theme, sector, sectorIcon, sectorColor, siblings }
  const tickerThemeMap = useMemo(() => {
    const map = new Map();
    for (const cat of CATEGORIES) {
      for (const theme of cat.themes) {
        for (const ticker of theme.tickers) {
          if (!map.has(ticker)) {
            map.set(ticker, {
              theme: theme.name,
              sector: cat.sector,
              sectorIcon: cat.icon,
              sectorColor: cat.color,
              siblings: theme.tickers.filter(t => t !== ticker),
            });
          }
        }
      }
    }
    return map;
  }, []);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const toggleAccordion = (sectorName) => {
    setExpandedSectors(prev => {
      const next = new Set(prev);
      if (next.has(sectorName)) {
        next.delete(sectorName);
      } else {
        next.add(sectorName);
      }
      return next;
    });
  };

  // ── Theme-level sort ────────────────────────────────────────────────────
  const sortedData = useMemo(() => {
    return [...sectors].sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      if (valA === undefined || valA === null) valA = a.loaded ? -Infinity : -Infinity;
      if (valB === undefined || valB === null) valB = b.loaded ? -Infinity : -Infinity;

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sectors, sortKey, sortDir]);

  // ── Ticker-level flatten + deduplicate + sort ───────────────────────────
  const flatTickers = useMemo(() => {
    if (!showTickers) return [];
    const seen = new Map();
    for (const s of sectors) {
      if (!s.tickerData) continue;
      for (const t of s.tickerData) {
        if (!t.symbol) continue;
        // Keep the first occurrence (from the highest-ranked theme)
        if (!seen.has(t.symbol)) {
          seen.set(t.symbol, { ...t, _theme: s.name, _category: s.category, _categoryColor: s.categoryColor, _categoryIcon: s.categoryIcon });
        }
      }
    }
    const list = [...seen.values()];

    // Map sort keys: theme-level keys → ticker-level keys
    const keyMap = {
      'name': 'symbol',
      'avgChange': 'changePercent',
      'avgPE': 'trailingPE',
      'avgFwdPE': 'forwardPE',
      'avgEG': 'eg',
      'avgPEG': 'peg',
      'avgPS': 'ps',
      'avgSG': 'sg',
      'avgPSG': 'psg',
      'avgRvol': 'rvol',
      'dispersion': 'rvol', // fallback — no dispersion at ticker level
    };
    const actualKey = keyMap[sortKey] || sortKey;

    list.sort((a, b) => {
      let valA = a[actualKey];
      let valB = b[actualKey];
      if (valA === undefined || valA === null) valA = -Infinity;
      if (valB === undefined || valB === null) valB = -Infinity;
      if (typeof valA === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [sectors, showTickers, sortKey, sortDir]);

  const SortIcon = ({ column }) => {
    if (sortKey !== column) return <span className="sort-icon inactive">↕</span>;
    return <span className="sort-icon active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const formatVal = (val, suffix = '', precision = 2) => {
    if (val === undefined) return <span className="text-muted" style={{ opacity: 0.5 }}>...</span>;
    if (val === null || isNaN(val)) return '--';
    return `${val.toFixed(precision)}${suffix}`;
  };

  const formatMultiple = (val, precision = 2) => {
    if (val === undefined) return <span className="text-muted" style={{ opacity: 0.5 }}>...</span>;
    if (val === null || isNaN(val) || val < 0 || val > 500) return <span className="text-muted">NM</span>;
    return val.toFixed(precision);
  };

  const TimeframeSelector = () => (
    <div className="timeframe-selector" style={{ display: 'flex', alignItems: 'center' }}>
      <label style={{ fontSize: '0.85rem', color: '#a0aec0', marginRight: '8px' }}>Period:</label>
      <select
        value={timeframe}
        onChange={(e) => setTimeframe(e.target.value)}
        style={{
          padding: '4px 8px', borderRadius: '4px', background: '#1a1f2e', color: 'white',
          border: '1px solid #2d3748', outline: 'none', cursor: 'pointer', fontFamily: 'monospace'
        }}
      >
        <option value="1D">1D</option>
        <option value="7D">7D</option>
        <option value="1M">1M</option>
        <option value="3M">3M</option>
        <option value="YTD">YTD</option>
        <option value="1Y">1Y</option>
        <option value="2Y">2Y</option>
        <option value="5Y">5Y</option>
      </select>
    </div>
  );

  // Column headers — shared between both views
  const colLabel = showTickers ? 'Ticker' : 'Theme';

  return (
    <div className="data-table-container">
      <div className="table-header-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3>{showTickers ? 'All Tickers' : 'Theme Analytics'}</h3>
          <p>{showTickers ? 'Every individual ticker across all themes, deduplicated and fully sortable.' : 'Advanced metrics and component breakdowns. Click any row to view individual tickers.'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <label className="ticker-toggle">
            <input
              type="checkbox"
              checked={showTickers}
              onChange={(e) => setShowTickers(e.target.checked)}
            />
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            <span className="toggle-label">Individual Tickers</span>
          </label>
          <TimeframeSelector />
        </div>
      </div>
      
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {!showTickers && <th></th>}
              <th onClick={() => handleSort('name')} className="sortable text-left">{colLabel} <SortIcon column="name" /></th>
              <th onClick={() => handleSort('avgChange')} className="sortable text-left" title="Daily price movement percentage.">Change <SortIcon column="avgChange" /></th>
              <th onClick={() => handleSort('avgPE')} className="sortable text-left hide-mobile" title="Price-to-Earnings Ratio">PE <SortIcon column="avgPE" /></th>
              <th onClick={() => handleSort('avgFwdPE')} className="sortable text-left hide-mobile" title="Forward P/E Ratio">FPE <SortIcon column="avgFwdPE" /></th>
              <th onClick={() => handleSort('avgEG')} className="sortable text-left hide-mobile" title="Earnings Growth %">EG <SortIcon column="avgEG" /></th>
              <th onClick={() => handleSort('avgPEG')} className="sortable text-left hide-mobile" title="PEG Ratio">PEG <SortIcon column="avgPEG" /></th>
              <th onClick={() => handleSort('avgPS')} className="sortable text-left hide-mobile" title="Price-to-Sales Ratio">PS <SortIcon column="avgPS" /></th>
              <th onClick={() => handleSort('avgSG')} className="sortable text-left hide-mobile" title="Sales Growth %">SG <SortIcon column="avgSG" /></th>
              <th onClick={() => handleSort('avgPSG')} className="sortable text-left hide-mobile" title="PSG Ratio">PSG <SortIcon column="avgPSG" /></th>
              <th onClick={() => handleSort('avgRvol')} className="sortable text-left" title="Relative Volume">RVOL <SortIcon column="avgRvol" /></th>
              {!showTickers && <th onClick={() => handleSort('dispersion')} className="sortable text-left hide-mobile" title="Intra-theme dispersion">DISP <SortIcon column="dispersion" /></th>}
            </tr>
          </thead>
          <tbody>
            {!sectors.length || !sectors[0]?.loaded ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="skeleton-table-row">
                  {!showTickers && <td></td>}
                  <td><div className="skeleton-cell w-40" /></td>
                  <td><div className="skeleton-cell w-20" /></td>
                  <td className="hide-mobile"><div className="skeleton-cell w-20" /></td>
                  <td className="hide-mobile"><div className="skeleton-cell w-20" /></td>
                  <td className="hide-mobile"><div className="skeleton-cell w-20" /></td>
                  <td className="hide-mobile"><div className="skeleton-cell w-20" /></td>
                  <td className="hide-mobile"><div className="skeleton-cell w-20" /></td>
                  <td className="hide-mobile"><div className="skeleton-cell w-20" /></td>
                  <td className="hide-mobile"><div className="skeleton-cell w-20" /></td>
                  <td><div className="skeleton-cell w-20" /></td>
                  {!showTickers && <td className="hide-mobile"><div className="skeleton-cell w-20" /></td>}
                </tr>
              ))
            ) : showTickers ? (
              /* ── FLAT TICKER VIEW ──────────────────────────────────────── */
              flatTickers.map((t) => {
                const tPos = t.changePercent >= 0;
                const info = tickerThemeMap.get(t.symbol);
                return (
                  <tr
                    key={t.symbol}
                    onMouseEnter={(e) => { setHoverTicker(t.symbol); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                    onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setHoverTicker(null)}
                  >
                    <td>
                      <div className="font-bold text-primary">{t.symbol}</div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>{t.name}</div>
                    </td>
                    <td className={`font-mono font-bold ${tPos ? 'text-gain' : 'text-loss'}`}>
                      {tPos ? '+' : ''}{formatVal(t.changePercent, '%')}
                    </td>
                    <td className="text-muted hide-mobile">{formatMultiple(t.trailingPE)}</td>
                    <td className="text-muted hide-mobile">{formatMultiple(t.forwardPE)}</td>
                    <td className="text-muted hide-mobile">{formatVal(t.eg, '%')}</td>
                    <td className="text-muted hide-mobile">{formatMultiple(t.peg)}</td>
                    <td className="text-muted hide-mobile">{formatMultiple(t.ps)}</td>
                    <td className="text-muted hide-mobile">{formatVal(t.sg, '%')}</td>
                    <td className="text-muted hide-mobile">{formatMultiple(t.psg)}</td>
                    <td className="text-muted">{formatVal(t.rvol, 'x')}</td>
                  </tr>
                );
              })
            ) : (
              /* ── THEME ACCORDION VIEW ─────────────────────────────────── */
              sortedData.map((s) => {
                const isPos = s.avgChange >= 0;
                const isExpanded = expandedSectors.has(s.name);
                
                return (
                  <Fragment key={s.name}>
                    <tr 
                      className={`accordion-trigger ${isExpanded ? 'active' : ''}`}
                      onClick={() => toggleAccordion(s.name)}
                    >
                      <td className="accordion-icon text-muted">
                        {isExpanded ? '▼' : '▶'}
                      </td>
                      <td>
                        <div className="font-medium text-primary">{s.name}</div>
                        <div className="category-badge micro" style={{ '--badge-color': s.categoryColor, marginTop: '4px' }}>
                          {s.categoryIcon} {s.category}
                        </div>
                      </td>
                      <td className={`font-mono font-bold ${isPos ? 'text-gain' : 'text-loss'}`}>
                        {isPos ? '+' : ''}{formatVal(s.avgChange, '%')}
                      </td>
                      <td className="text-muted hide-mobile">{formatMultiple(s.avgPE)}</td>
                      <td className="text-muted hide-mobile">{formatMultiple(s.avgFwdPE)}</td>
                      <td className="text-muted hide-mobile">{formatVal(s.avgEG, '%')}</td>
                      <td className="text-muted hide-mobile">{formatMultiple(s.avgPEG)}</td>
                      <td className="text-muted hide-mobile">{formatMultiple(s.avgPS)}</td>
                      <td className="text-muted hide-mobile">{formatVal(s.avgSG, '%')}</td>
                      <td className="text-muted hide-mobile">{formatMultiple(s.avgPSG)}</td>
                      <td className="text-muted">{formatVal(s.avgRvol, 'x')}</td>
                      <td className="text-muted hide-mobile">{formatVal(s.dispersion, '%')}</td>
                    </tr>
                    
                    {isExpanded && s.tickerData && s.tickerData.map(tData => {
                      const tPos = tData.changePercent >= 0;
                      
                      return (
                        <tr key={`${s.name}-${tData.symbol}`} className="accordion-content-row">
                          <td></td>
                          <td>
                            <span className="text-primary font-bold">{tData.symbol}</span>
                            <span className="text-muted text-sm hide-mobile" style={{ marginLeft: '8px' }}>{tData.name}</span>
                          </td>
                          <td className={`font-mono ${tPos ? 'text-gain' : 'text-loss'}`}>
                            {tPos ? '+' : ''}{formatVal(tData.changePercent, '%')}
                          </td>
                          <td className="text-muted hide-mobile">{formatMultiple(tData.trailingPE)}</td>
                          <td className="text-muted hide-mobile">{formatMultiple(tData.forwardPE)}</td>
                          <td className="text-muted hide-mobile">{formatVal(tData.eg, '%')}</td>
                          <td className="text-muted hide-mobile">{formatMultiple(tData.peg)}</td>
                          <td className="text-muted hide-mobile">{formatMultiple(tData.ps)}</td>
                          <td className="text-muted hide-mobile">{formatVal(tData.sg, '%')}</td>
                          <td className="text-muted hide-mobile">{formatMultiple(tData.psg)}</td>
                          <td className="text-muted">{formatVal(tData.rvol, 'x')}</td>
                          <td className="text-muted hide-mobile">--</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Ticker Hover Tooltip */}
      {showTickers && hoverTicker && (() => {
        const info = tickerThemeMap.get(hoverTicker);
        if (!info) return null;
        return (
          <div
            className="ticker-info-tooltip"
            style={{
              left: hoverPos.x + 16,
              top: hoverPos.y - 10,
            }}
          >
            <div className="ticker-tip-header">
              <span className="category-badge micro" style={{ '--badge-color': info.sectorColor }}>
                {info.sectorIcon} {info.sector}
              </span>
            </div>
            <div className="ticker-tip-theme">{info.theme}</div>
            <div className="ticker-tip-siblings">
              {info.siblings.map(s => (
                <span key={s} className="ticker-tip-tag">{s}</span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
