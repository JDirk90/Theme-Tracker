import { useRef, useLayoutEffect, useState } from 'react';

// Tooltip helper for price


function formatPrice(price) {
  if (price == null) return '—';
  return price.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Tooltip({ data, position }) {
  const ref = useRef(null);
  const [adjustedPos, setAdjustedPos] = useState(position);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const pad = 16;
    let x = position.x + 20;
    let y = position.y - 10;

    // Keep tooltip within viewport
    if (x + rect.width + pad > window.innerWidth) {
      x = position.x - rect.width - 20;
    }
    if (y + rect.height + pad > window.innerHeight) {
      y = window.innerHeight - rect.height - pad;
    }
    if (y < pad) y = pad;
    if (x < pad) x = pad;

    setAdjustedPos({ x, y });
  }, [position]);

  const { name, avgChange, tickerData } = data;
  const isPending = avgChange == null;
  const safeAvg = isPending ? 0 : avgChange;
  const isPositive = safeAvg >= 0;

  return (
    <div
      ref={ref}
      className="sector-tooltip"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      <div className="tooltip-header">
        <span className="tooltip-title">{name}</span>
        <span
          className="tooltip-avg"
          style={{ color: isPending ? 'var(--text-muted)' : (isPositive ? 'var(--gain-strong)' : 'var(--loss-strong)') }}
        >
          Eq Wt Avg: {isPending ? '...' : `${isPositive ? '+' : ''}${safeAvg.toFixed(2)}%`}
        </span>
      </div>

      <div className="tooltip-tickers">
        {tickerData.map((t) => {
          const tPending = t.changePercent == null;
          const tSafe = tPending ? 0 : t.changePercent;
          const tPositive = tSafe >= 0;
          return (
            <div className="tooltip-ticker" key={t.symbol}>
              <span className="tooltip-symbol">{t.symbol}</span>
              <span className="tooltip-name">{t.name}</span>
              <span className="tooltip-price">{formatPrice(t.price)}</span>
              <span
                className="tooltip-change"
                style={{ color: tPending ? 'var(--text-muted)' : (tPositive ? 'var(--gain-strong)' : 'var(--loss-strong)') }}
              >
                {tPending ? '...' : `${tPositive ? '+' : ''}${tSafe.toFixed(2)}%`}
              </span>
              <span className="tooltip-volume">{t.rvol !== null ? t.rvol.toFixed(2) + 'x' : '--'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
