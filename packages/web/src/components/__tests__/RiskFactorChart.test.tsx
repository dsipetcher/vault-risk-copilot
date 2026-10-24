import { describe, it, expect, beforeAll } from 'vitest';
import { prepareChartData } from '@/utils/chartData';

describe('Risk Factor Chart Rendering', () => {
  beforeAll(() => {
    // Mock ResizeObserver for recharts
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('should convert STRING scores to numbers in prepareChartData', () => {
    // Mock API risk_score with STRING values (critical: this tests Number() conversion)
    const mockRiskScore = {
      tvl_score: '15',
      tvl_volatility_score: '20.5',
      apy_volatility_score: '25',
      reward_ratio_score: '30',
      stablecoin_score: '10',
      il_score: '35.5',
      data_age_score: '40',
      vault_score: '45',
    };

    // Call prepareChartData with string scores (simulates API response)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chartData = prepareChartData(mockRiskScore as any);
    
    // Verify all 8 scores are converted to numbers
    expect(chartData).toHaveLength(8);
    chartData.forEach(item => {
      expect(typeof item.value).toBe('number');
      expect(item.value).toBeGreaterThan(0);
      expect(item.value).toBeLessThanOrEqual(100);
    });
    
    // Verify specific values match
    expect(chartData[0].value).toBe(15);
    expect(chartData[1].value).toBe(20.5);
    expect(chartData[2].value).toBe(25);
  });

});
