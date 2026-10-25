import { describe, it, expect } from 'vitest';
import { prepareChartData } from '@/utils/chartData';

describe('PoolDetailPage Chart Data Processing', () => {
  it('should convert risk scores to numbers for chart rendering', () => {
    // Simulate risk score data
    const riskScore = {
      tvl_score: 15,
      tvl_volatility_score: 20.5,
      apy_volatility_score: 25,
      reward_ratio_score: 30,
      stablecoin_score: 10,
      il_score: 35.5,
      data_age_score: 40,
      vault_score: 45,
    };

    const chartData = prepareChartData(riskScore);

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

    const chartData = prepareChartData(riskScore);

    // Only non-null values
    expect(chartData).toHaveLength(5);
    expect(chartData.every(item => typeof item.value === 'number')).toBe(true);
  });
});
