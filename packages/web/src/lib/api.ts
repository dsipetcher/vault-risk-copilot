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
    const response = await this.request<{ data: Pool[] }>('/api/pools');
    return response.data;
  }

  async getPoolDetail(id: string): Promise<PoolDetail> {
    const response = await this.request<{ data: PoolDetail }>(`/api/pools/${id}`);
    return response.data;
  }

  async getPoolHistory(id: string): Promise<PoolHistory[]> {
    const response = await this.request<{ data: PoolHistory[] }>(`/api/pools/${id}/history`);
    return response.data;
  }

  async getVaultState(): Promise<VaultState> {
    const response = await this.request<{ data: VaultState }>('/api/vault/state');
    return response.data;
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
