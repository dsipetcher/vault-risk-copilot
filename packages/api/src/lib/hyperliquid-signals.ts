export const HYPERLIQUID_SIGNAL_MODEL_VERSION = 'hl-perp-1.1';
export const HOURS_PER_YEAR = 24 * 365;

/** Hyperliquid's typical 1h funding of 0.0000125 annualizes to ~10.95%. Score only the excess. */
export const FUNDING_BASELINE_ANN_PCT = 12;
export const FUNDING_EXTREME_ANN_PCT = 80;
export const FUNDING_VOLATILITY_SNAPSHOT_LIMIT = 48;
export const DEFAULT_COLLECTION_INTERVAL_MS = 300_000;

export function collectionIntervalMinutes(
  intervalMs: number = DEFAULT_COLLECTION_INTERVAL_MS
): number {
  const minutes = intervalMs / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_COLLECTION_INTERVAL_MS / 60_000;
  }
  return Math.round(minutes * 10) / 10;
}

export function collectionIntervalLabel(intervalMs: number = DEFAULT_COLLECTION_INTERVAL_MS): string {
  const minutes = collectionIntervalMinutes(intervalMs);
  const text = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
  return `${text}-minute`;
}

export type RiskCategory = 'low' | 'medium' | 'high' | 'critical';

export interface PerpMarketInput {
  coin: string;
  funding_rate: number | null;
  open_interest: number | null;
  mark_px: number | null;
  oracle_px: number | null;
  premium: number | null;
  day_ntl_vlm: number | null;
  recent_funding_rates?: number[];
}

export interface PerpSignal {
  id: string;
  label: string;
  score: number | null;
  value: string;
  explanation: string;
  applicable: boolean;
}

export interface PerpRiskBreakdown {
  total_risk_score: number;
  risk_category: RiskCategory;
  model_version: string;
  signals: {
    funding_extreme: PerpSignal;
    funding_volatility: PerpSignal;
    oi_concentration: PerpSignal;
    mark_oracle_deviation: PerpSignal;
  };
}

const WEIGHTS = {
  funding_extreme: 0.35,
  funding_volatility: 0.25,
  oi_concentration: 0.2,
  mark_oracle_deviation: 0.2,
} as const;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function annualizedFundingPct(hourlyRate: number): number {
  return hourlyRate * HOURS_PER_YEAR * 100;
}

export function riskCategory(score: number): RiskCategory {
  if (score <= 25) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'critical';
}

export function oiUsd(openInterest: number | null, markPx: number | null): number | null {
  if (openInterest == null || markPx == null) return null;
  return openInterest * markPx;
}

export function markOracleDeviationPct(markPx: number | null, oraclePx: number | null): number | null {
  if (markPx == null || oraclePx == null || oraclePx === 0) return null;
  return (Math.abs(markPx - oraclePx) / Math.abs(oraclePx)) * 100;
}

function linearScore(value: number, start: number, end: number): number {
  if (value <= start) return 0;
  if (value >= end) return 100;
  return ((value - start) / (end - start)) * 100;
}

function sampleStdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function fundingExtremeSignal(fundingRate: number | null): PerpSignal {
  if (fundingRate == null) {
    return {
      id: 'funding_extreme',
      label: 'Extreme annualized funding',
      score: null,
      value: 'n/a',
      explanation: 'No funding rate in this snapshot.',
      applicable: false,
    };
  }

  const ann = annualizedFundingPct(fundingRate);
  const score = round2(linearScore(Math.abs(ann), FUNDING_BASELINE_ANN_PCT, FUNDING_EXTREME_ANN_PCT));
  const side = fundingRate >= 0 ? 'longs pay shorts' : 'shorts pay longs';
  return {
    id: 'funding_extreme',
    label: 'Extreme annualized funding',
    score,
    value: `${ann >= 0 ? '+' : ''}${ann.toFixed(2)}% / yr`,
    explanation:
      `Hourly funding annualizes to ${ann.toFixed(2)}% (${side}). ` +
      `Score starts above Hyperliquid's typical ~${FUNDING_BASELINE_ANN_PCT - 1}–${FUNDING_BASELINE_ANN_PCT}%/yr baseline. ` +
      'Very high absolute funding usually means one side of the trade is crowded.',
    applicable: true,
  };
}

export function fundingVolatilitySignal(
  recentFundingRates?: number[],
  collectionIntervalMs: number = DEFAULT_COLLECTION_INTERVAL_MS
): PerpSignal {
  const stdev = recentFundingRates ? sampleStdev(recentFundingRates) : null;
  if (stdev == null) {
    return {
      id: 'funding_volatility',
      label: 'Funding volatility',
      score: null,
      value: 'n/a',
      explanation:
        'Need at least two collector snapshots of this coin before funding volatility can be scored.',
      applicable: false,
    };
  }

  const annVolPct = Math.abs(stdev) * HOURS_PER_YEAR * 100;
  const score = round2(linearScore(annVolPct, 2, 40));
  const snapshotCount = recentFundingRates?.length ?? 0;
  const intervalMinutes = collectionIntervalMinutes(collectionIntervalMs);
  const windowHours = (snapshotCount * intervalMinutes) / 60;
  return {
    id: 'funding_volatility',
    label: 'Funding volatility',
    score,
    value: `${annVolPct.toFixed(2)} pp / yr`,
    explanation:
      `Sample stdev of the last ${snapshotCount} collector snapshots ` +
      `(~${collectionIntervalLabel(collectionIntervalMs)} interval, about ${windowHours.toFixed(1)} hours) ` +
      `annualizes to ${annVolPct.toFixed(2)} percentage points. ` +
      'Unstable funding often tracks rapidly changing crowding.',
    applicable: true,
  };
}

export function oiConcentrationSignal(input: PerpMarketInput, totalOiUsd: number): PerpSignal {
  const notional = oiUsd(input.open_interest, input.mark_px);
  const volume = input.day_ntl_vlm;
  if (notional == null || volume == null) {
    return {
      id: 'oi_concentration',
      label: 'OI concentration',
      score: null,
      value: 'n/a',
      explanation: 'Open interest or 24h volume is missing.',
      applicable: false,
    };
  }

  const sharePct = totalOiUsd > 0 ? (notional / totalOiUsd) * 100 : 0;
  const ratio = volume > 0 ? notional / volume : Number.POSITIVE_INFINITY;
  const score = round2(volume <= 0 ? 100 : linearScore(ratio, 0.5, 8));
  const ratioLabel = Number.isFinite(ratio) ? `${ratio.toFixed(2)}× 24h volume` : 'no 24h volume';
  return {
    id: 'oi_concentration',
    label: 'OI concentration',
    score,
    value: ratioLabel,
    explanation:
      `Open interest is ${ratioLabel} (${sharePct.toFixed(1)}% of listed perp OI). ` +
      'High OI relative to trading activity means positions are concentrated versus exit liquidity.',
    applicable: true,
  };
}

export function markOracleDeviationSignal(input: PerpMarketInput): PerpSignal {
  const devPct = markOracleDeviationPct(input.mark_px, input.oracle_px);
  if (devPct == null) {
    return {
      id: 'mark_oracle_deviation',
      label: 'Mark/oracle deviation',
      score: null,
      value: 'n/a',
      explanation: 'Mark or oracle price is missing.',
      applicable: false,
    };
  }

  const score = round2(linearScore(devPct, 0.05, 1.5));
  const premiumPct = input.premium != null ? input.premium * 100 : null;
  return {
    id: 'mark_oracle_deviation',
    label: 'Mark/oracle deviation',
    score,
    value: `${devPct.toFixed(3)}%`,
    explanation:
      `Mark and oracle differ by ${devPct.toFixed(3)}%` +
      (premiumPct != null ? ` (quoted premium ${premiumPct.toFixed(3)}%).` : '.') +
      ' Persistent gaps can indicate thin books or a stale/stressed oracle.',
    applicable: true,
  };
}

export function scorePerpMarket(
  input: PerpMarketInput,
  totalOiUsd: number,
  collectionIntervalMs: number = DEFAULT_COLLECTION_INTERVAL_MS
): PerpRiskBreakdown {
  const signals = {
    funding_extreme: fundingExtremeSignal(input.funding_rate),
    funding_volatility: fundingVolatilitySignal(input.recent_funding_rates, collectionIntervalMs),
    oi_concentration: oiConcentrationSignal(input, totalOiUsd),
    mark_oracle_deviation: markOracleDeviationSignal(input),
  };

  let weightSum = 0;
  let weighted = 0;
  (Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).forEach((key) => {
    const signal = signals[key];
    if (!signal.applicable || signal.score == null) return;
    weightSum += WEIGHTS[key];
    weighted += WEIGHTS[key] * signal.score;
  });

  const total = weightSum > 0 ? round2(weighted / weightSum) : 0;
  return {
    total_risk_score: total,
    risk_category: riskCategory(total),
    model_version: HYPERLIQUID_SIGNAL_MODEL_VERSION,
    signals,
  };
}

export function totalOpenInterestUsd(markets: PerpMarketInput[]): number {
  return markets.reduce((sum, market) => {
    const value = oiUsd(market.open_interest, market.mark_px);
    return sum + (value ?? 0);
  }, 0);
}
