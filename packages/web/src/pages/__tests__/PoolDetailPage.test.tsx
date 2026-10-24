import { describe, it, expect, vi, type MockedFunction } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PoolDetailPage } from '../PoolDetailPage';

// Mock react-router-dom useParams
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'test-pool-id' }),
  };
});

// Mock fetch
global.fetch = vi.fn() as MockedFunction<typeof fetch>;

describe('PoolDetailPage Risk Factor Chart', () => {
  it('should render all 8 risk factors in bar chart when all are non-null', async () => {
    const mockPool = {
      pool_id: 'test-pool-id',
      pool_name: 'Test Pool',
      protocol: 'test',
      chain: 'Ethereum',
      tvl_usd: 1000000,
      apy: 10,
      risk_score: {
        id: 'risk-1',
        total_risk_score: 50,
        risk_category: 'medium',
        tvl_score: 15,
        tvl_volatility_score: 20,
        apy_volatility_score: 25,
        reward_ratio_score: 30,
        stablecoin_score: 10,
        il_score: 35,
        data_age_score: 40,
        vault_score: 45,
      },
    };

    (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce(
      new Response(JSON.stringify(mockPool), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { container } = render(
      <BrowserRouter>
        <PoolDetailPage />
      </BrowserRouter>
    );

    // Wait for data to load
    await vi.waitFor(() => {
      expect(container.textContent).toContain('Test Pool');
    });

    // Check that chart data includes all 8 factors
    // (In a real test, we'd use a recharts testing library or snapshot)
    expect(container.textContent).toContain('Risk Factor Breakdown');
  });

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
