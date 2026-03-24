// ── NYSE Time Utilities ──────────────────────────────────────────────────────
// All times are in America/New_York (Eastern Time)

const NY_TZ = 'America/New_York';

/**
 * Get the current NYSE (Eastern Time) Date object components.
 */
export function getNYSETime() {
  const now = new Date();
  // Get components in ET
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ,
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);

  const get = (type) => {
    const p = parts.find(p => p.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };

  return {
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
    year: get('year'),
    month: get('month'),
    day: get('day'),
  };
}

/**
 * Format current NYSE time as a readable clock string, e.g. "3:45:12 PM ET"
 */
export function formatNYSEClock() {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: NY_TZ,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }) + ' ET';
}

/**
 * Check if the NYSE is currently in regular trading hours (9:30 AM - 4:00 PM ET, Mon-Fri).
 * Does not account for holidays.
 */
export function isMarketOpen() {
  const now = new Date();
  const nyDay = new Intl.DateTimeFormat('en-US', { timeZone: NY_TZ, weekday: 'short' }).format(now);
  if (nyDay === 'Sat' || nyDay === 'Sun') return false;

  const { hour, minute } = getNYSETime();
  const minutesSinceMidnight = hour * 60 + minute;
  const open = 9 * 60 + 30;  // 9:30 AM
  const close = 16 * 60;     // 4:00 PM

  return minutesSinceMidnight >= open && minutesSinceMidnight < close;
}

// ── Time-of-Day Volume Curve ─────────────────────────────────────────────────
// Anchor points: [minutesSinceOpen, expectedCumulativePercentage]
const VOLUME_CURVE = [
  [0,   0.00],  // 9:30 AM — Open
  [60,  0.20],  // 10:30 AM — End of Hour 1
  [195, 0.45],  // 12:45 PM — Midday
  [330, 0.70],  // 3:00 PM — Entering Final Hour
  [390, 1.00],  // 4:00 PM — Close
];

/**
 * Get the expected cumulative volume percentage for the current time of day.
 * Uses linear interpolation between the anchor points.
 * Returns a number between 0 and 1, or null if market is closed.
 */
export function getExpectedVolumePercent() {
  if (!isMarketOpen()) return null;

  const { hour, minute } = getNYSETime();
  const minutesSinceMidnight = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30;
  const elapsed = minutesSinceMidnight - marketOpen;

  // Clamp to curve bounds
  if (elapsed <= 0) return VOLUME_CURVE[0][1];
  if (elapsed >= 390) return VOLUME_CURVE[VOLUME_CURVE.length - 1][1];

  // Linear interpolation between anchor points
  for (let i = 1; i < VOLUME_CURVE.length; i++) {
    const [t0, v0] = VOLUME_CURVE[i - 1];
    const [t1, v1] = VOLUME_CURVE[i];
    if (elapsed <= t1) {
      const ratio = (elapsed - t0) / (t1 - t0);
      return v0 + ratio * (v1 - v0);
    }
  }

  return 1.0;
}

/**
 * Adjust a naive RVOL value using the Time-of-Day volume curve.
 * 
 * Adjusted_RVOL = Naive_RVOL / Expected_Cumulative_Volume_Percentage
 * 
 * If the market is closed, returns the naive RVOL unchanged.
 * Applies a small floor (1%) to prevent division-by-near-zero at market open.
 */
export function adjustRvol(naiveRvol) {
  if (naiveRvol == null) return naiveRvol;

  const expectedPct = getExpectedVolumePercent();

  // Market is closed — return raw RVOL
  if (expectedPct === null) return naiveRvol;

  // Floor at 1% to prevent extreme spikes in the first seconds of trading
  const safePct = Math.max(expectedPct, 0.01);

  return naiveRvol / safePct;
}
