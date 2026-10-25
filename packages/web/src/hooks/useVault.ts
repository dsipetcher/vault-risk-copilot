import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { isVaultConfigured } from '@/lib/vault-config';

export function useVaultState() {
  return useQuery({
    queryKey: ['vault-state'],
    queryFn: () => apiClient.getVaultState(),
    enabled: isVaultConfigured(),
    refetchInterval: 30000,
  });
}
