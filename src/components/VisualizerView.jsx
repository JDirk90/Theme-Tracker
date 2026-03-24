import { useState, useMemo } from 'react';
import SectorBar from './SectorBar';

export default function VisualizerView({ sectors, onSectorHover, onSectorMove, onSectorLeave, timeframe, setTimeframe }) {
  const [sortMode, setSortMode] = useState('performance');
  const [sortDir, setSortDir] = useState('desc'); // Default to desc for performance

  const handleSortClick = (mode) => {
    if (sortMode === mode) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortMode(mode);
      // Defaults when switching
      if (mode === 'performance') setSortDir('desc');
      else setSortDir('asc'); // Sector and Theme default to A-Z
    }
  };

  const sortedSectors = useMemo(() => {
    const list = [...sectors];
    
    // Define comparison values
    list.sort((a, b) => {
      let valA, valB;
      if (sortMode === 'performance') {
        valA = a.avgChange !== undefined ? a.avgChange : (sortDir === 'asc' ? Infinity : -Infinity);
        valB = b.avgChange !== undefined ? b.avgChange : (sortDir === 'asc' ? Infinity : -Infinity);
      } else if (sortMode === 'sector') {
        valA = a.name; valB = b.name;
      } else if (sortMode === 'theme') {
        valA = a.category; valB = b.category;
      }
      
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      // Fallback for theme ties
      if (sortMode === 'theme') {
        return b.avgChange - a.avgChange; // Always fallback to performance desc
      }
      return 0;
    });
    
    return list;
  }, [sectors, sortMode, sortDir]);

  const maxSwing = useMemo(() => {
    let max = 0;
    for (const s of sectors) {
      if (s.avgChange !== undefined && s.avgChange !== null) {
        max = Math.max(max, Math.abs(s.avgChange));
      }
    }
    // Fallback to 1 to prevent division by zero gracefully
    return Math.max(max, 1);
  }, [sectors]);

  const SortIcon = ({ mode }) => {
    if (sortMode !== mode) return null;
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <section className="visualizer-view">
      <div className="visualizer-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="control-label">Sort by:</span>
          <div className="pill-group">
            <button 
              className={`pill-btn ${sortMode === 'performance' ? 'active' : ''}`}
              onClick={() => handleSortClick('performance')}
            >
              Gain / Loss <SortIcon mode="performance" />
            </button>
            <button 
              className={`pill-btn ${sortMode === 'sector' ? 'active' : ''}`}
              onClick={() => handleSortClick('sector')}
            >
              Theme <SortIcon mode="sector" />
            </button>
            <button 
              className={`pill-btn ${sortMode === 'theme' ? 'active' : ''}`}
              onClick={() => handleSortClick('theme')}
            >
              Sector <SortIcon mode="theme" />
            </button>
          </div>
        </div>

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
      </div>

      <div className="sector-bars">
        {sortedSectors.map((sector) => (
          <SectorBar
            key={sector.name}
            sector={sector}
            categoryColor={sector.categoryColor}
            onHover={onSectorHover}
            onMove={onSectorMove}
            onLeave={onSectorLeave}
            maxSwing={maxSwing}
          />
        ))}
      </div>
    </section>
  );
}
