import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ApiClient, ApiError } from './api-client.js';
import type { Config } from './config.js';

const mockConfig: Config = {
  apiBaseUrl: 'http://localhost:3000',
  requestTimeoutMs: 5000,
  explainTimeoutMs: 45000,
  logLevel: 'error',
  httpPort: 3001,
  httpHost: 'localhost',
};

const mockPool = {
  id: 1,
  pool_id: '550e8400-e29b-41d4-a716-446655440000',
  protocol: 'Aave',
  chain: 'Ethereum',
  pool_name: 'USDC Pool',
  asset_symbol: 'USDC',
  is_stablecoin: true,
  tvl_usd: 1000000,
  tvl_change_7d_pct: 5.2,
  apy: 3.5,
  apy_base: 2.0,
  apy_reward: 1.5,
  apy_sigma: 0.5,
  apy_pct_7d: 0.1,
  il_risk: 0,
  count: 10,
  snapshot_at: '2026-10-25T00:00:00Z',
  created_at: '2026-10-25T00:00:00Z',
  total_risk_score: 15.5,
  risk_category: 'low',
};

const mockPoolDetails = {
  ...mockPool,
  risk_score: {
    id: '650e8400-e29b-41d4-a716-446655440000',
    pool_id: '550e8400-e29b-41d4-a716-446655440000',
    snapshot_id: '750e8400-e29b-41d4-a716-446655440000',
    total_risk_score: 15.5,
    risk_category: 'low' as const,
    tvl_score: 5,
    tvl_volatility_score: 2,
    apy_volatility_score: 3,
    reward_ratio_score: 1,
    stablecoin_score: 0,
    il_score: 0,
    data_age_score: 1,
    vault_score: 0,
    is_anomaly: false,
    anomaly_reason: null,
    model_version: 'v1.0',
    calculated_at: '2026-10-25T00:00:00Z',
    created_at: '2026-10-25T00:00:00Z',
  },
};

const mockVaultState = {
  vault_address: '0x1234567890123456789012345678901234567890',
  chain_id: 11155111,
  total_assets: '1000000000',
  total_supply: '900000000',
  share_price: 1.111111,
  block_number: 12345678,
  snapshot_at: '2026-10-25T00:00:00Z',
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('ApiClient', () => {
  describe('listPools', () => {
    it('should list pools with default parameters', async () => {
      server.use(
        http.get('http://localhost:3000/api/pools', () => {
          return HttpResponse.json({
            data: [mockPool],
            pagination: { total: 1, limit: 20, offset: 0 },
          });
        })
      );

      const client = new ApiClient(mockConfig);
      const result = await client.listPools({});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].pool_id).toBe(mockPool.pool_id);
      expect(result.pagination.total).toBe(1);
    });

    it('should apply filters and pagination', async () => {
      server.use(
        http.get('http://localhost:3000/api/pools', ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get('chain')).toBe('Ethereum');
          expect(url.searchParams.get('limit')).toBe('10');
          expect(url.searchParams.get('min_tvl')).toBe('100000');

          return HttpResponse.json({
            data: [mockPool],
            pagination: { total: 1, limit: 10, offset: 0 },
          });
        })
      );

      const client = new ApiClient(mockConfig);
      await client.listPools({ chain: 'Ethereum', limit: 10, min_tvl: 100000 });
    });

    it('should pass sort to the API (server-side)', async () => {
      const highRisk = { ...mockPool, pool_id: '650e8400-e29b-41d4-a716-446655440001', total_risk_score: 80 };
      const lowRisk = { ...mockPool, pool_id: '650e8400-e29b-41d4-a716-446655440002', total_risk_score: 10 };

      server.use(
        http.get('http://localhost:3000/api/pools', ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get('sort')).toBe('risk');
          return HttpResponse.json({
            data: [highRisk, lowRisk],
            pagination: { total: 2, limit: 20, offset: 0 },
          });
        })
      );

      const client = new ApiClient(mockConfig);
      const result = await client.listPools({ sort: 'risk' });

      expect(result.data[0].total_risk_score).toBe(80);
      expect(result.data[1].total_risk_score).toBe(10);
    });

    it('should enforce max limit of 100', async () => {
      server.use(
        http.get('http://localhost:3000/api/pools', ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get('limit')).toBe('100');

          return HttpResponse.json({
            data: [],
            pagination: { total: 0, limit: 100, offset: 0 },
          });
        })
      );

      const client = new ApiClient(mockConfig);
      await client.listPools({ limit: 200 });
    });
  });

  describe('getPoolRisk', () => {
    it('should get pool details with risk score', async () => {
      server.use(
        http.get('http://localhost:3000/api/pools/:id', () => {
          return HttpResponse.json({ data: mockPoolDetails });
        })
      );

      const client = new ApiClient(mockConfig);
      const result = await client.getPoolRisk('550e8400-e29b-41d4-a716-446655440000');

      expect(result.pool_id).toBe(mockPoolDetails.pool_id);
      expect(result.risk_score?.total_risk_score).toBe(15.5);
    });

    it('should throw ApiError for 404', async () => {
      server.use(
        http.get('http://localhost:3000/api/pools/:id', () => {
          return HttpResponse.json({ error: 'Not found' }, { status: 404 });
        })
      );

      const client = new ApiClient(mockConfig);
      await expect(client.getPoolRisk('unknown-id')).rejects.toThrow(ApiError);
    });
  });

  describe('explainPoolRisk', () => {
    it('should send provider/model in the explain body with the BYOK header', async () => {
      const mockExplanation = {
        explanation: {
          summary: 'Low risk pool',
          key_factors: [
            { signal: 'TVL', value: '$1M', explanation: 'Good liquidity' },
          ],
          disclaimer: 'Not financial advice',
        },
        metadata: {
          provider: 'openai',
          model: 'gpt-4',
          timestamp: '2026-10-25T00:00:00Z',
          latency_ms: 1000,
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        cached: false,
      };

      server.use(
        http.post('http://localhost:3000/api/pools/:id/explain', async ({ request }) => {
          const apiKey = request.headers.get('X-LLM-Api-Key');
          expect(apiKey).toBe('test-key');
          expect(request.headers.get('Content-Type')).toContain('application/json');
          expect(await request.json()).toEqual({
            provider: 'groq',
            model: 'openai/gpt-oss-120b',
          });

          return HttpResponse.json(mockExplanation);
        })
      );

      const client = new ApiClient({
        ...mockConfig,
        llmProvider: 'groq',
        llmModel: 'openai/gpt-oss-120b',
      });
      const result = await client.explainPoolRisk('550e8400-e29b-41d4-a716-446655440000', 'test-key');

      expect(result.explanation.summary).toBe('Low risk pool');
      expect(result.cached).toBe(false);
    });

    it('should work without LLM key (fallback)', async () => {
      const mockExplanation = {
        explanation: {
          summary: 'Fallback explanation',
          key_factors: [],
          disclaimer: 'Not financial advice',
        },
        metadata: {
          provider: 'mock',
          model: 'fallback',
          timestamp: '2026-10-25T00:00:00Z',
          latency_ms: 0,
          fallback: true,
          fallback_reason: 'No LLM key provided',
        },
        cached: false,
      };

      server.use(
        http.post('http://localhost:3000/api/pools/:id/explain', async ({ request }) => {
          const apiKey = request.headers.get('X-LLM-Api-Key');
          expect(apiKey).toBeNull();

          return HttpResponse.json(mockExplanation);
        })
      );

      const client = new ApiClient(mockConfig);
      const result = await client.explainPoolRisk('550e8400-e29b-41d4-a716-446655440000');

      expect(result.metadata.fallback).toBe(true);
    });
  });

  describe('getVaultInfo', () => {
    it('should get vault state', async () => {
      server.use(
        http.get('http://localhost:3000/api/vault/state', () => {
          return HttpResponse.json({ data: mockVaultState });
        })
      );

      const client = new ApiClient(mockConfig);
      const result = await client.getVaultInfo();

      expect(result?.vault_address).toBe(mockVaultState.vault_address);
      expect(result?.share_price).toBe(1.111111);
    });

    it('should return null for 404', async () => {
      server.use(
        http.get('http://localhost:3000/api/vault/state', () => {
          return HttpResponse.json({ error: 'Not found' }, { status: 404 });
        })
      );

      const client = new ApiClient(mockConfig);
      const result = await client.getVaultInfo();

      expect(result).toBeNull();
    });

    it('should throw VaultNotConfiguredError for 503', async () => {
      server.use(
        http.get('http://localhost:3000/api/vault/state', () => {
          return HttpResponse.json({ error: 'Vault monitoring not configured' }, { status: 503 });
        })
      );

      const client = new ApiClient(mockConfig);
      await expect(client.getVaultInfo()).rejects.toThrow('Vault not configured: set VAULT_ADDRESS/RPC');
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      server.use(
        http.get('http://localhost:3000/api/pools', () => {
          return HttpResponse.error();
        })
      );

      const client = new ApiClient(mockConfig);
      await expect(client.listPools({})).rejects.toThrow(ApiError);
    });

    it('should handle timeout', async () => {
      server.use(
        http.get('http://localhost:3000/api/pools', async () => {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          return HttpResponse.json({ data: [], pagination: { total: 0, limit: 20, offset: 0 } });
        })
      );

      const shortTimeoutConfig = { ...mockConfig, requestTimeoutMs: 100 };
      const client = new ApiClient(shortTimeoutConfig);

      await expect(client.listPools({})).rejects.toThrow('Request timeout');
    });

    it('uses explainTimeoutMs so explain can outlast the default request timeout', async () => {
      server.use(
        http.post('http://localhost:3000/api/pools/:id/explain', async () => {
          await new Promise((resolve) => setTimeout(resolve, 250));
          return HttpResponse.json({
            explanation: {
              summary: 'Rate limited by the provider; retry in ~11 min.',
              key_factors: [],
              disclaimer: 'Not financial advice',
            },
            metadata: {
              provider: 'groq',
              model: 'openai/gpt-oss-120b',
              timestamp: '2026-10-25T00:00:00Z',
              latency_ms: 250,
              fallback: true,
              fallback_reason: 'rate_limited',
            },
            cached: false,
          });
        })
      );

      const client = new ApiClient({
        ...mockConfig,
        requestTimeoutMs: 50,
        explainTimeoutMs: 2_000,
      });

      const result = await client.explainPoolRisk('550e8400-e29b-41d4-a716-446655440000');
      expect(result.metadata.fallback_reason).toBe('rate_limited');
      expect(result.explanation.summary).toMatch(/retry in ~11 min/i);
    });

    it('should handle 500 errors', async () => {
      server.use(
        http.get('http://localhost:3000/api/pools', () => {
          return HttpResponse.json({ error: 'Internal server error' }, { status: 500 });
        })
      );

      const client = new ApiClient(mockConfig);
      await expect(client.listPools({})).rejects.toThrow(ApiError);
    });
  });

  describe('getPoolHistory', () => {
    it('should get pool history', async () => {
      const historyData = [
        { ...mockPool, snapshot_at: '2026-10-24T00:00:00Z' },
        { ...mockPool, snapshot_at: '2026-10-25T00:00:00Z' },
      ];

      server.use(
        http.get('http://localhost:3000/api/pools/:id/history', () => {
          return HttpResponse.json({ data: historyData });
        })
      );

      const client = new ApiClient(mockConfig);
      const result = await client.getPoolHistory('550e8400-e29b-41d4-a716-446655440000');

      expect(result).toHaveLength(2);
    });
  });
});
