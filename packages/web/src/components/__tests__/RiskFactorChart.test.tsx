import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import PoolDetailPage from '@/pages/PoolDetailPage';
import { prepareChartData } from '@/utils/chartData';
import type { RiskScore } from '@/types';

// Mock react-router-dom params
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'test-pool-id' }),
  };
});

describe('Risk Factor Chart Rendering', () => {
  beforeAll(() => {
    // Mock ResizeObserver for recharts
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('should render chart with numeric values from STRING scores (API response)', async () => {
    // Mock API response with STRING scores (critical: this tests Number() conversion)
    const mockApiResponse = {
      pool_id: 'test-pool-id',
      pool_name: 'Test Pool',
      total_risk_score: '50',
      risk_category: 'medium',
      tvl_score: '15',
      tvl_volatility_score: '20.5',
      apy_volatility_score: '25',
      reward_ratio_score: '30',
      stablecoin_score: '10',
      il_score: '35.5',
      data_age_score: '40',
      vault_score: '45',
    };

    // Mock fetch to return string scores
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/risk/test-pool-id')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockApiResponse,
        } as Response);
      }
      return Promise.reject(new Error('Not found'));
    });

    const { container } = render(
      <BrowserRouter>
        <PoolDetailPage />
      </BrowserRouter>
    );

    // Wait for chart to render
    await waitFor(() => {
      expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument();
    });

    // Verify all 8 bars are present (test fails without Number() in prepareChartData)
    const bars = container.querySelectorAll('.recharts-bar-rectangle');
    expect(bars.length).toBe(8);

    // Verify prepareChartData converts strings to numbers
    const chartData = prepareChartData(mockApiResponse as unknown as RiskScore);
    expect(chartData).toHaveLength(8);
    chartData.forEach(item => {
      expect(typeof item.value).toBe('number');
      expect(item.value).toBeGreaterThan(0);
      expect(item.value).toBeLessThanOrEqual(100);
    });
  });

  it('should filter out null values and render only non-null bars', () => {
    const mockRiskScore = {
      tvl_score: 15,
      tvl_volatility_score: null,
      apy_volatility_score: 25,
      reward_ratio_score: null,
      stablecoin_score: 10,
      il_score: 35,
      data_age_score: null,
      vault_score: 45,
    };

    const chartData = prepareChartData(mockRiskScore);

    const { container } = render(
      <ResponsiveContainer width={400} height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis domain={[0, 100]} />
          <Bar dataKey="value" fill="#0ea5e9" />
        </BarChart>
      </ResponsiveContainer>
    );

    // Only 5 bars should be present (non-null values)
    const bars = container.querySelectorAll('.recharts-bar-rectangle');
    expect(bars.length).toBe(5);

    // Verify data has only non-null values
    expect(chartData).toHaveLength(5);
    expect(chartData.every(item => typeof item.value === 'number')).toBe(true);
  });

  it('should convert mixed numeric types correctly', () => {
    // Test with numeric values (integers and floats)
    const mockRiskScore = {
      tvl_score: 15.5,
      tvl_volatility_score: 20,
      apy_volatility_score: null,
      reward_ratio_score: null,
      stablecoin_score: null,
      il_score: 35.2,
      data_age_score: null,
      vault_score: null,
    };

    const chartData = prepareChartData(mockRiskScore);

    expect(chartData).toHaveLength(3);
    expect(chartData[0].value).toBe(15.5);
    expect(chartData[1].value).toBe(20);
    expect(chartData[2].value).toBe(35.2);
    
    // All should be numbers
    chartData.forEach(item => {
      expect(typeof item.value).toBe('number');
    });
  });
});
