import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { prepareChartData } from '@/utils/chartData';

describe('Risk Chart Integration', () => {
  beforeAll(() => {
    // Mock ResizeObserver for recharts
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('should render breakdown chart with STRING scores from mocked API', () => {
    // Mock API response with STRING scores (simulates real API behavior)
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

    // Prepare chart data from STRING scores (this is the real component logic)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chartData = prepareChartData(mockRiskScore as any);
    
    // Render the actual breakdown chart component (same as PoolDetailPage)
    const { container } = render(
      <ResponsiveContainer width={600} height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
          <YAxis domain={[0, 100]} />
          <Bar dataKey="value" fill="#0ea5e9" />
        </BarChart>
      </ResponsiveContainer>
    );

    // Verify chart renders
    expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument();
    
    // Verify bars rendered (8 non-null STRING scores converted to numbers)
    const bars = container.querySelectorAll('.recharts-bar-rectangle');
    expect(bars.length).toBe(8);
    
    // Verify all values are numbers in chart data
    chartData.forEach(item => {
      expect(typeof item.value).toBe('number');
    });
  });
});
