import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export type HyperliquidSort = 'coin' | 'funding' | 'oi' | 'volume' | 'risk' | 'deviation';

export function useHyperliquidMarkets(query: {
  search?: string;
  sort?: HyperliquidSort;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
} = {}) {
  return useQuery({
    queryKey: ['hyperliquid-markets', query],
    queryFn: () => apiClient.getHyperliquidMarkets(query),
    refetchInterval: 60000,
  });
}

export function useHyperliquidMarket(coin: string | null) {
  return useQuery({
    queryKey: ['hyperliquid-market', coin],
    queryFn: () => apiClient.getHyperliquidMarket(coin!),
    enabled: Boolean(coin),
  });
}

export function useHyperliquidFunding(coin: string | null, hours = 24) {
  return useQuery({
    queryKey: ['hyperliquid-funding', coin, hours],
    queryFn: () => apiClient.getHyperliquidFunding(coin!, hours),
    enabled: Boolean(coin),
    refetchInterval: 60000,
  });
}
