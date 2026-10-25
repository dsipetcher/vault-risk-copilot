import { useQuery } from '@tanstack/react-query';
import { apiClient, type PoolsQuery } from '@/lib/api';

export function usePools(query: PoolsQuery = {}) {
  return useQuery({
    queryKey: ['pools', query],
    queryFn: () => apiClient.getPools(query),
    refetchInterval: 60000,
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPoolIdUuid(id: string | undefined): boolean {
  return !!id && UUID_RE.test(id);
}

export function usePoolDetail(id: string) {
  return useQuery({
    queryKey: ['pool', id],
    queryFn: () => apiClient.getPoolDetail(id),
    enabled: isPoolIdUuid(id),
  });
}

export function usePoolHistory(id: string) {
  return useQuery({
    queryKey: ['pool-history', id],
    queryFn: () => apiClient.getPoolHistory(id),
    enabled: isPoolIdUuid(id),
  });
}
