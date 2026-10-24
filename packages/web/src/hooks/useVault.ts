import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export function useVaultState() {
  return useQuery({
    queryKey: ['vault-state'],
    queryFn: () => apiClient.getVaultState(),
    refetchInterval: 30000,
  });
}
