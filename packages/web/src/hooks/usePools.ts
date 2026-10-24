import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export function usePools() {
  return useQuery({
    queryKey: ['pools'],
    queryFn: () => apiClient.getPools(),
    refetchInterval: 60000,
  });
}

export function usePoolDetail(id: string) {
  return useQuery({
    queryKey: ['pool', id],
    queryFn: () => apiClient.getPoolDetail(id),
    enabled: !!id,
  });
}

export function usePoolHistory(id: string) {
  return useQuery({
    queryKey: ['pool-history', id],
    queryFn: () => apiClient.getPoolHistory(id),
    enabled: !!id,
  });
}
