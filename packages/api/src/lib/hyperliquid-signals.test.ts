import { describe, expect, it } from 'vitest';
import {
  annualizedFundingPct,
  fundingExtremeSignal,
  fundingVolatilitySignal,
  markOracleDeviationSignal,
  oiConcentrationSignal,
  riskCategory,
  scorePerpMarket,
  totalOpenInterestUsd,
} from './hyperliquid-signals.js';

const btc = {
  coin: 'BTC',
  funding_rate: 0.0000125,
  open_interest: 40000,
  mark_px: 77000,
  oracle_px: 77020,
  premium: -0.0003,
  day_ntl_vlm: 2_700_000_000,
};

describe('hyperliquid perp signals', () => {
  it('annualizes hourly funding the same way the dashboard does', () => {
    expect(annualizedFundingPct(0.0000125)).toBeCloseTo(10.95, 2);
  });

  it('scores mild funding as low and extreme funding as critical', () => {
    expect(fundingExtremeSignal(0.0000125).score).toBeLessThan(20);
    const extreme = fundingExtremeSignal(0.0002);
    expect(extreme.score).toBe(100);
    expect(extreme.explanation).toMatch(/crowded/i);
    expect(fundingExtremeSignal(null).applicable).toBe(false);
  });

  it('treats short history as not applicable and scores volatile funding higher', () => {
    expect(fundingVolatilitySignal([0.0000125]).applicable).toBe(false);
    const stable = fundingVolatilitySignal([0.0000125, 0.0000126, 0.0000124]);
    const jumpy = fundingVolatilitySignal([0.0000125, 0.00008, -0.00005, 0.00009]);
    expect(stable.score).toBeLessThan(jumpy.score ?? 0);
    expect(jumpy.explanation).toMatch(/crowding/i);
  });

  it('scores OI vs 24h volume as crowding, not "BTC is large"', () => {
    const total = totalOpenInterestUsd([
      btc,
      { ...btc, coin: 'ALT', open_interest: 100, mark_px: 1, day_ntl_vlm: 5 },
    ]);
    const liquid = oiConcentrationSignal(btc, total);
    const crowded = oiConcentrationSignal(
      { ...btc, coin: 'ALT', open_interest: 100, mark_px: 1, day_ntl_vlm: 5 },
      total
    );
    expect(liquid.score).toBeLessThan(crowded.score ?? 0);
    expect(crowded.explanation).toMatch(/exit liquidity/i);
  });

  it('scores mark/oracle gaps', () => {
    const tight = markOracleDeviationSignal(btc);
    const wide = markOracleDeviationSignal({ ...btc, mark_px: 79000, oracle_px: 77000 });
    expect(tight.score).toBeLessThan(20);
    expect(wide.score).toBe(100);
  });

  it('renormalizes weights when funding volatility is N/A', () => {
    const withVol = scorePerpMarket({ ...btc, recent_funding_rates: [0.0000125, 0.00008] }, 3.08e9);
    const withoutVol = scorePerpMarket(btc, 3.08e9);
    expect(withoutVol.signals.funding_volatility.applicable).toBe(false);
    expect(withVol.total_risk_score).toBeGreaterThanOrEqual(0);
    expect(withoutVol.total_risk_score).toBeGreaterThanOrEqual(0);
    expect(riskCategory(10)).toBe('low');
    expect(riskCategory(40)).toBe('medium');
    expect(riskCategory(70)).toBe('high');
    expect(riskCategory(90)).toBe('critical');
  });
});
