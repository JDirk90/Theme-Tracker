import { useState, useEffect } from 'react';
import { formatNYSEClock } from '../services/timeUtils';

export default function Header({ marketState, lastUpdated, loading, onRefresh, onMenuToggle }) {
  const [clock, setClock] = useState(formatNYSEClock());

  useEffect(() => {
    const timer = setInterval(() => setClock(formatNYSEClock()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getMarketLabel = () => {
    switch (marketState) {
      case 'REGULAR':
        return { label: 'Market Open', className: 'open' };
      case 'PRE':
        return { label: 'Pre-Market', className: 'pre' };
      case 'POST':
      case 'POSTPOST':
        return { label: 'After Hours', className: 'post' };
      case 'PREPRE':
        return { label: 'Pre-Market', className: 'pre' };
      default:
        return { label: 'Market Closed', className: 'closed' };
    }
  };

  const { label, className } = getMarketLabel();

  return (
    <header className="header">
      <div className="content-wrapper header-inner">
        <div className="header-left">
          <button
            className="menu-toggle"
            onClick={onMenuToggle}
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '1.2rem',
              cursor: 'pointer',
            }}
          >
            ☰
          </button>
          <h2 className="header-title">Dashboard</h2>
          <div className="market-status">
            <span className={`market-status-dot ${className}`} />
            <span>{label}</span>
          </div>
        </div>

        <div className="header-right">
          <span className="nyse-clock">{clock}</span>
          <button
            className={`refresh-btn ${loading ? 'loading' : ''}`}
            onClick={onRefresh}
            disabled={loading}
          >
            <span className={loading ? 'spin' : ''}>↻</span>
            {loading ? 'Fetching…' : 'Refresh'}
          </button>
        </div>
      </div>
    </header>
  );
}
