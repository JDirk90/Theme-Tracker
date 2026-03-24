import { useMemo } from 'react';

export default function SectorBar({ sector, categoryColor, onHover, onMove, onLeave, maxSwing = 8 }) {
  const { name, avgChange, avgRvol, dispersion, loaded, tickerData } = sector;

  const isPending = avgChange === undefined;
  const safeAvg = isPending ? 0 : avgChange;
  const isPositive = safeAvg >= 0;

  const isRvolPending = avgRvol === undefined;
  const isDispPending = dispersion === undefined;

  // Compute bar width dynamically proportional to the highest performer across all themes
  const barWidth = useMemo(() => {
    if (!loaded || isPending) return 0;
    const clamped = Math.min(Math.abs(safeAvg), maxSwing);
    // Render out of 50% since the track is centered at 50% left/right
    return (clamped / maxSwing) * 50; 
  }, [safeAvg, loaded, isPending, maxSwing]);

  const getRvolClass = (val) => {
    if (val == null) return 'neutral';
    if (val >= 2.0) return 'rvol-orange-3';
    if (val >= 1.5) return 'rvol-orange-2';
    if (val >= 1.2) return 'rvol-orange-1';
    if (val <= 0.5) return 'rvol-blue-2';
    if (val <= 0.8) return 'rvol-blue-1';
    return 'neutral';
  };

  const handleMouseEnter = (e) => {
    if (loaded && tickerData.length > 0) {
      onHover(sector, e);
    }
  };

  if (!loaded) {
    return (
      <div className="skeleton-row">
        <div className="skeleton-label" style={{ width: '45%' }} />
        <div className="skeleton-bar" style={{ width: '45%' }} />
      </div>
    );
  }

  return (
    <div
      className="sector-bar-row"
      onMouseEnter={handleMouseEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="sector-info-panel">
        <div className="sector-label-group">
          <div className="sector-label" title={name}>
            {name}
          </div>
          <div className="category-badge micro hide-mobile" style={{ '--badge-color': categoryColor }}>
            {sector.categoryIcon} {sector.category}
          </div>
        </div>

        <div className="sector-metrics-group">
          <div className="metric-block">
            <span className="metric-label">Change</span>
            <span className={`metric-value ${isPending ? 'neutral' : (isPositive ? 'positive' : 'negative')}`}>
              {isPending ? '...' : `${isPositive ? '+' : ''}${safeAvg.toFixed(2)}%`}
            </span>
          </div>
        </div>
      </div>

      <div className="sector-bar-container">
        <div className="sector-bar-track">
          <div
            className={`sector-bar-fill ${isPositive ? 'positive' : 'negative'}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      <div className="sector-trailing-metrics">
        <div className="metric-block">
          <span className="metric-label">RVOL</span>
          <span className={`metric-value ${getRvolClass(avgRvol)}`}>
            {isRvolPending ? '...' : (avgRvol != null ? avgRvol.toFixed(1) + 'x' : '--')}
          </span>
        </div>

        <div className="metric-block hide-mobile">
          <span className="metric-label">DISP</span>
          <span className="metric-value neutral">
            {isDispPending ? '...' : (dispersion != null ? dispersion.toFixed(2) + '%' : '--')}
          </span>
        </div>
      </div>
    </div>
  );
}
