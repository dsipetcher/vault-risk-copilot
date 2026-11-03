import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export type HyperliquidSort = 'coin' | 'funding' | 'oi' | 'volume' | 'risk' | 'deviation';

export function useHyperliquidMarkets(query: {
  search?: string;
  sort?: HyperliquidSort;
  order?: 'asc' | 'desc';
} = {}) {
  return useQuery({
    queryKey: ['hyperliquid-markets', query],
    queryFn: () => apiClient.getHyperliquidMarkets(query),
    refetchInterval: 60000,
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
