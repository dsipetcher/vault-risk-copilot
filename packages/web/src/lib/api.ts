import type { Pool, PoolDetail, PoolHistory, VaultState } from '@/types/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getPools(): Promise<Pool[]> {
    return this.request<Pool[]>('/api/pools');
  }

  async getPoolDetail(id: string): Promise<PoolDetail> {
    return this.request<PoolDetail>(`/api/pools/${id}`);
  }

  async getPoolHistory(id: string): Promise<PoolHistory[]> {
    return this.request<PoolHistory[]>(`/api/pools/${id}/history`);
  }

  async getVaultState(): Promise<VaultState> {
    return this.request<VaultState>('/api/vault/state');
  }

  async recomputeRisk(id: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/risk/recompute/${id}`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
