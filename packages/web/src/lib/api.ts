import type { Pool, PoolDetail, PoolHistory, VaultState, ExplanationResponse, LLMProvider } from '@/types/api';

import { API_BASE_URL, apiFetch } from './config';

export class ApiRequestError extends Error {
  status?: number;
  retryable: boolean;

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

function friendlyNetworkMessage(err: unknown): string {
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return 'The API is unreachable. Is the backend running on the configured VITE_API_URL?';
  }
  if (err instanceof Error && /Failed to fetch/i.test(err.message)) {
    return 'The API is unreachable. Is the backend running on the configured VITE_API_URL?';
  }
  return err instanceof Error ? err.message : 'Unknown error';
}

export interface PoolsQuery {
  limit?: number;
  offset?: number;
  search?: string;
  sort?: 'tvl' | 'risk' | 'apy';
  order?: 'asc' | 'desc';
  risk_category?: string;
}

export interface PoolsPage {
  data: Pool[];
  pagination: { total: number; limit: number; offset: number };
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await apiFetch(`${this.baseUrl}${endpoint}`, init);
    } catch (err) {
      throw new ApiRequestError(friendlyNetworkMessage(err), { retryable: true });
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      const message = error.message || error.error || `HTTP ${response.status}`;
      throw new ApiRequestError(message, {
        status: response.status,
        retryable: response.status >= 500,
      });
    }

    return response.json();
  }

  async getPools(query: PoolsQuery = {}): Promise<PoolsPage> {
    const params = new URLSearchParams();
    params.set('limit', String(query.limit ?? 50));
    params.set('offset', String(query.offset ?? 0));
    if (query.search) params.set('search', query.search);
    if (query.sort) params.set('sort', query.sort);
    if (query.order) params.set('order', query.order);
    if (query.risk_category && query.risk_category !== 'all') {
      params.set('risk_category', query.risk_category);
    }
    return this.request<PoolsPage>(`/api/pools?${params.toString()}`);
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
    return this.request(`/api/risk/recompute/${id}`, { method: 'POST' });
  }

  async validateLlm(options: {
    provider?: LLMProvider;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
  } = {}): Promise<{ ok: boolean; provider: string; model: string; error?: string; message?: string }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.apiKey) {
      headers['X-LLM-Api-Key'] = options.apiKey;
    }
    const body: Record<string, string> = {};
    if (options.provider) body.provider = options.provider;
    if (options.model) body.model = options.model;
    if (options.baseUrl) body.baseUrl = options.baseUrl;

    return this.request('/api/llm/validate', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    });
  }

  async explainRisk(
    poolId: string,
    options: {
      provider?: LLMProvider;
      model?: string;
      baseUrl?: string;
      apiKey?: string;
    } = {}
  ): Promise<ExplanationResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.apiKey) {
      headers['X-LLM-Api-Key'] = options.apiKey;
    }

    const body: Record<string, string> = {};
    if (options.provider) body.provider = options.provider;
    if (options.model) body.model = options.model;
    if (options.baseUrl) body.baseUrl = options.baseUrl;

    return this.request(`/api/pools/${poolId}/explain`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
