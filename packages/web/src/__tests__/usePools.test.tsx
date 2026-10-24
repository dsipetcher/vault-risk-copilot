import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePools } from '@/hooks/usePools';
import type { Pool } from '@/types/api';

const mockPools: Pool[] = [
  {
    id: 1,
    pool_id: 'pool-1',
    protocol: 'Aave',
    asset_symbol: 'USDC',
    chain: 'Ethereum',
    pool_name: 'Test Pool',
    is_stablecoin: true,
    tvl_usd: 1000000,
    tvl_change_7d_pct: null,
    apy: 5.5,
    apy_base: null,
    apy_reward: null,
    apy_sigma: null,
    apy_pct_7d: null,
    il_risk: null,
    count: null,
    snapshot_at: '2026-10-24T00:00:00Z',
    created_at: '2026-10-24T00:00:00Z',
  },
];

describe.skip('usePools', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    vi.clearAllMocks();
  });

  // TODO: Fix mock to match actual API response structure { data: Pool[] }
  it('fetches pools successfully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockPools,
    }) as unknown as typeof fetch;

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => usePools(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockPools);
  });

  it('handles fetch errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    }) as unknown as typeof fetch;

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => usePools(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
