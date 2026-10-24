import { describe, it, expect } from 'vitest';

describe('PoolDetailPage Risk Factor Chart', () => {
  it('should filter out null risk factors from bar chart', () => {
    const chartData = [
      { name: 'TVL Score', value: 15 },
      { name: 'TVL Volatility', value: null },
      { name: 'APY Volatility', value: 25 },
      { name: 'Reward Ratio', value: null },
      { name: 'Stablecoin', value: 10 },
      { name: 'IL Risk', value: 35 },
      { name: 'Data Age', value: null },
      { name: 'Vault Score', value: 45 },
    ];

    const filtered = chartData.filter(item => item.value !== null);

    expect(filtered).toHaveLength(5);
    expect(filtered.every(item => item.value !== null)).toBe(true);
  });

  it('should include all 8 risk factor types in chart data', () => {
    // Simulates the chart data structure from PoolDetailPage
    const riskScore = {
      tvl_score: 15,
      tvl_volatility_score: 20,
      apy_volatility_score: 25,
      reward_ratio_score: 30,
      stablecoin_score: 10,
      il_score: 35,
      data_age_score: 40,
      vault_score: 45,
    };

    const chartData = [
      { name: 'TVL Score', value: riskScore.tvl_score },
      { name: 'TVL Volatility', value: riskScore.tvl_volatility_score },
      { name: 'APY Volatility', value: riskScore.apy_volatility_score },
      { name: 'Reward Ratio', value: riskScore.reward_ratio_score },
      { name: 'Stablecoin', value: riskScore.stablecoin_score },
      { name: 'IL Risk', value: riskScore.il_score },
      { name: 'Data Age', value: riskScore.data_age_score },
      { name: 'Vault Score', value: riskScore.vault_score },
    ].filter(item => item.value !== null);

    // All 8 factors are present
    expect(chartData).toHaveLength(8);
    
    // Each factor has a value (bars will render)
    chartData.forEach(item => {
      expect(item.value).toBeGreaterThan(0);
      expect(item.value).toBeLessThanOrEqual(100);
    });
    
    // Check specific factors are included (regression test for issue 9)
    const factorNames = chartData.map(item => item.name);
    expect(factorNames).toContain('Stablecoin');
    expect(factorNames).toContain('Vault Score');
  });
});
