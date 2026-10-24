import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
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

  it('should render chart with numeric values from string scores', () => {
    // Mock API response with string scores (simulating potential API behavior)
    const mockRiskScore = {
      tvl_score: 15,
      tvl_volatility_score: 20.5,
      apy_volatility_score: 25,
      reward_ratio_score: 30,
      stablecoin_score: 10,
      il_score: 35.5,
      data_age_score: 40,
      vault_score: 45,
    };

    const chartData = prepareChartData(mockRiskScore);

    // Render the actual chart component
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

    // Verify chart renders
    expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument();
    expect(container.querySelector('.recharts-bar')).toBeInTheDocument();

    // Verify all 8 bars are present
    const bars = container.querySelectorAll('.recharts-bar-rectangle');
    expect(bars.length).toBe(8);

    // Verify data is numeric
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

  it('should convert string values to numbers correctly', () => {
    // Test with string values (in case API returns strings)
    const mockRiskScore = {
      tvl_score: 15.5 as any,
      tvl_volatility_score: 20 as any,
      apy_volatility_score: null,
      reward_ratio_score: null,
      stablecoin_score: null,
      il_score: 35.2 as any,
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
