import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PoolDetailPage } from '@/pages/PoolDetailPage';

// Mock react-router-dom params
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'test-pool-id' }),
  };
});

describe('Risk Chart Integration', () => {
  beforeAll(() => {
    // Mock ResizeObserver for recharts
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('should render breakdown chart with STRING scores from mocked API', async () => {
    // Mock API response with STRING scores (simulates real API behavior)
    const mockPoolResponse = {
      pool_id: 'test-pool-id',
      pool_name: 'Test Pool',
      protocol: 'Test Protocol',
      chain: 'Ethereum',
      tvl_usd: 1000000,
      apy: 5.5,
      risk_score: {
        pool_id: 'test-pool-id',
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
      },
    };

    // Mock fetch
    const fetchMock = vi.fn((url: string | URL | Request): Promise<Response> => {
      const urlString = typeof url === 'string' ? url : url.toString();
      
      if (urlString.includes('/api/pools/test-pool-id') && !urlString.includes('/history')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockPoolResponse,
        } as Response);
      }
      
      if (urlString.includes('/api/pools/test-pool-id/history')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        } as Response);
      }
      
      return Promise.reject(new Error('Not found'));
    });
    global.fetch = fetchMock as typeof fetch;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <PoolDetailPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    // Wait for chart to render
    await waitFor(() => {
      expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument();
    }, { timeout: 5000 });

    // Verify chart bars rendered (8 non-null scores)
    const bars = container.querySelectorAll('.recharts-bar-rectangle');
    expect(bars.length).toBeGreaterThan(0);
    
    // Verify Risk Factor Breakdown heading exists
    expect(container.textContent).toContain('Risk Factor Breakdown');
  });
});
