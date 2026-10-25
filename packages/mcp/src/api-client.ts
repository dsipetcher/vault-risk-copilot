import type { Config } from './config.js';
import {
  poolWithRiskSchema,
  poolDetailsSchema,
  vaultStateSchema,
  explanationSchema,
  type PoolWithRisk,
  type PoolDetails,
  type VaultState,
  type Explanation,
} from './types.js';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.apiBaseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs
    );

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        let errorDetails: unknown;
        try {
          errorDetails = await response.json();
        } catch {
          errorDetails = await response.text();
        }
        throw new ApiError(
          `API request failed: ${response.statusText}`,
          response.status,
          errorDetails
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ApiError('Request timeout', 408);
        }
        throw new ApiError(`Network error: ${error.message}`);
      }

      throw new ApiError('Unknown error occurred');
    }
  }

  async listPools(params: {
    limit?: number;
    offset?: number;
    chain?: string;
    protocol?: string;
    min_tvl?: number;
    sort?: 'tvl' | 'risk' | 'apy';
  }): Promise<{ data: PoolWithRisk[]; pagination: { total: number; limit: number; offset: number } }> {
    const queryParams = new URLSearchParams();

    if (params.limit !== undefined) queryParams.set('limit', String(Math.min(params.limit, 100)));
    if (params.offset !== undefined) queryParams.set('offset', String(params.offset));
    if (params.chain) queryParams.set('chain', params.chain);
    if (params.protocol) queryParams.set('protocol', params.protocol);
    if (params.min_tvl !== undefined) queryParams.set('min_tvl', String(params.min_tvl));

    const result = await this.fetch<{
      data: unknown[];
      pagination: { total: number; limit: number; offset: number };
    }>(`/api/pools?${queryParams.toString()}`);

    const validatedPools = result.data.map((pool) => poolWithRiskSchema.parse(pool));

    let sortedPools = validatedPools;
    if (params.sort === 'tvl') {
      sortedPools = validatedPools.sort((a, b) => (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0));
    } else if (params.sort === 'risk') {
      sortedPools = validatedPools.sort((a, b) => (b.total_risk_score ?? 0) - (a.total_risk_score ?? 0));
    } else if (params.sort === 'apy') {
      sortedPools = validatedPools.sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));
    }

    return {
      data: sortedPools,
      pagination: result.pagination,
    };
  }

  async getPoolRisk(poolId: string): Promise<PoolDetails> {
    const result = await this.fetch<{ data: unknown }>(`/api/pools/${poolId}`);
    return poolDetailsSchema.parse(result.data);
  }

  async explainPoolRisk(poolId: string, llmApiKey?: string): Promise<Explanation> {
    const headers: Record<string, string> = {};
    if (llmApiKey) {
      headers['X-LLM-Api-Key'] = llmApiKey;
    }

    const result = await this.fetch<unknown>(`/api/pools/${poolId}/explain`, {
      method: 'POST',
      headers,
    });

    return explanationSchema.parse(result);
  }

  async getVaultInfo(): Promise<VaultState | null> {
    try {
      const result = await this.fetch<{ data: unknown }>('/api/vault/state');
      return vaultStateSchema.parse(result.data);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async getPoolHistory(poolId: string, limit: number = 30): Promise<PoolWithRisk[]> {
    const result = await this.fetch<{ data: unknown[] }>(`/api/pools/${poolId}/history?limit=${limit}`);
    return result.data.map((item) => poolWithRiskSchema.parse(item));
  }
}
