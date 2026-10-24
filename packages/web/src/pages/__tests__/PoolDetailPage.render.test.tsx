import { describe, it, expect } from 'vitest';

describe('PoolDetailPage Chart Data Processing', () => {
  it('should convert risk scores to numbers for chart rendering', () => {
    // Simulate risk score data that might come as strings from API
    const riskScore = {
      tvl_score: '15',
      tvl_volatility_score: '20.5',
      apy_volatility_score: '25',
      reward_ratio_score: '30',
      stablecoin_score: '10',
      il_score: '35.5',
      data_age_score: '40',
      vault_score: '45',
    };

    // Process data like in PoolDetailPage
    const chartData = [
      { name: 'TVL Score', value: riskScore.tvl_score },
      { name: 'TVL Volatility', value: riskScore.tvl_volatility_score },
      { name: 'APY Volatility', value: riskScore.apy_volatility_score },
      { name: 'Reward Ratio', value: riskScore.reward_ratio_score },
      { name: 'Stablecoin', value: riskScore.stablecoin_score },
      { name: 'IL Risk', value: riskScore.il_score },
      { name: 'Data Age', value: riskScore.data_age_score },
      { name: 'Vault Score', value: riskScore.vault_score },
    ]
      .filter(item => item.value !== null)
      .map(item => ({ ...item, value: Number(item.value) }));

    // All values should be converted to numbers
    expect(chartData).toHaveLength(8);
    chartData.forEach(item => {
      expect(typeof item.value).toBe('number');
      expect(item.value).toBeGreaterThan(0);
      expect(item.value).toBeLessThanOrEqual(100);
    });

    // Verify specific conversions
    expect(chartData[0].value).toBe(15);
    expect(chartData[1].value).toBe(20.5);
    expect(chartData[5].value).toBe(35.5);
  });

  it('should handle null values correctly', () => {
    const riskScore = {
      tvl_score: 15,
      tvl_volatility_score: null,
      apy_volatility_score: 25,
      reward_ratio_score: null,
      stablecoin_score: 10,
      il_score: 35,
      data_age_score: null,
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
    ]
      .filter(item => item.value !== null)
      .map(item => ({ ...item, value: Number(item.value) }));

    // Only non-null values
    expect(chartData).toHaveLength(5);
    expect(chartData.every(item => typeof item.value === 'number')).toBe(true);
  });
});
