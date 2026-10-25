import type { Config } from './config.js';
import {
  poolWithRiskSchema,
  poolSnapshotSchema,
  poolDetailsSchema,
  vaultStateSchema,
  explanationSchema,
  type PoolWithRisk,
  type PoolSnapshot,
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

export class VaultNotConfiguredError extends Error {
  constructor(message = 'Vault not configured: set VAULT_ADDRESS/RPC') {
    super(message);
    this.name = 'VaultNotConfiguredError';
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
          Accept: 'application/json',
          // Only declare a JSON body when there is one (Fastify 400s on empty JSON bodies).
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
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
        throw new ApiError('Network error', 0);
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
    if (params.sort) queryParams.set('sort', params.sort);

    const result = await this.fetch<{
      data: unknown[];
      pagination: { total: number; limit: number; offset: number };
    }>(`/api/pools?${queryParams.toString()}`);

    const validatedPools = result.data.map((pool) => poolWithRiskSchema.parse(pool));

    return {
      data: validatedPools,
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
      body: JSON.stringify(this.buildExplainBody()),
    });

    return explanationSchema.parse(result);
  }

  private buildExplainBody(): Record<string, string> {
    const body: Record<string, string> = {};
    if (this.config.llmProvider) body.provider = this.config.llmProvider;
    const model =
      this.config.llmModel ||
      (this.config.llmProvider === 'groq'
        ? 'openai/gpt-oss-120b'
        : this.config.llmProvider === 'ollama'
          ? 'llama3.2'
          : this.config.llmProvider === 'openrouter'
            ? 'openai/gpt-4o-mini'
            : this.config.llmProvider === 'openai'
              ? 'gpt-4o-mini'
              : undefined);
    if (model) body.model = model;
    return body;
  }

  async getVaultInfo(): Promise<VaultState | null> {
    try {
      const result = await this.fetch<{ data: unknown }>('/api/vault/state');
      return vaultStateSchema.parse(result.data);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 503) {
        throw new VaultNotConfiguredError();
      }
      if (error instanceof ApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async getPoolHistory(poolId: string, limit: number = 30): Promise<PoolSnapshot[]> {
    const result = await this.fetch<{ data: unknown[] }>(`/api/pools/${poolId}/history?limit=${limit}`);
    return result.data.map((item) => poolSnapshotSchema.parse(item));
  }
}
