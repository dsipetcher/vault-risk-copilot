import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiClient } from './api-client.js';
import { ApiError } from './api-client.js';
import {
  listPoolsTool,
  getPoolRiskTool,
  comparePoolsTool,
  explainPoolRiskTool,
  getVaultInfoTool, safeErrorMessage, toolErrorResult } from './tools.js';

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
  risk_category: 'low' as const,
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

describe('Tools', () => {
  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      listPools: vi.fn(),
      getPoolRisk: vi.fn(),
      explainPoolRisk: vi.fn(),
      getVaultInfo: vi.fn(),
      getPoolHistory: vi.fn(),
    } as unknown as ApiClient;
  });

  describe('listPoolsTool', () => {
    it('should list pools successfully', async () => {
      vi.mocked(mockApiClient.listPools).mockResolvedValue({
        data: [mockPool],
        pagination: { total: 1, limit: 20, offset: 0 },
      });

      const result = await listPoolsTool(mockApiClient, {});

      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Found 1 pools');
    });

    it('should validate limit bounds', async () => {
      vi.mocked(mockApiClient.listPools).mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 50, offset: 0 },
      });

      await expect(listPoolsTool(mockApiClient, { limit: 100 })).rejects.toThrow();
    });

    it('should handle API errors', async () => {
      vi.mocked(mockApiClient.listPools).mockRejectedValue(
        new ApiError('API error', 500)
      );

      await expect(listPoolsTool(mockApiClient, {})).rejects.toThrow(ApiError);
    });
  });

  describe('getPoolRiskTool', () => {
    it('should get pool risk successfully', async () => {
      vi.mocked(mockApiClient.getPoolRisk).mockResolvedValue(mockPoolDetails);
      vi.mocked(mockApiClient.getPoolHistory).mockResolvedValue([mockPool]);

      const result = await getPoolRiskTool(mockApiClient, {
        pool_id: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.content).toHaveLength(2);
      expect(result.content[0].text).toContain('Aave');
      expect(result.content[0].text).toContain('15.50');
    });

    it('should require valid UUID', async () => {
      await expect(
        getPoolRiskTool(mockApiClient, { pool_id: 'invalid-uuid' })
      ).rejects.toThrow();
    });

    it('should handle 404 errors', async () => {
      vi.mocked(mockApiClient.getPoolRisk).mockRejectedValue(
        new ApiError('Not found', 404)
      );

      await expect(
        getPoolRiskTool(mockApiClient, {
          pool_id: '550e8400-e29b-41d4-a716-446655440000',
        })
      ).rejects.toThrow(ApiError);
    });
  });

  describe('comparePoolsTool', () => {
    it('should compare multiple pools', async () => {
      const pool1 = { 
        ...mockPoolDetails, 
        pool_id: '650e8400-e29b-41d4-a716-446655440001',
        risk_score: { ...mockPoolDetails.risk_score, total_risk_score: 10 }
      };
      const pool2 = { 
        ...mockPoolDetails, 
        pool_id: '650e8400-e29b-41d4-a716-446655440002',
        risk_score: { ...mockPoolDetails.risk_score, total_risk_score: 20 }
      };

      vi.mocked(mockApiClient.getPoolRisk)
        .mockResolvedValueOnce(pool1)
        .mockResolvedValueOnce(pool2);

      const result = await comparePoolsTool(mockApiClient, {
        pool_ids: ['650e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440002'],
      });

      expect(result.content[0].text).toContain('Comparing 2 pools');
      const comparison = JSON.parse(result.content[1].text);
      expect(comparison.comparison[0].risk_score).toBe(20);
    });

    it('should enforce min/max pool count', async () => {
      await expect(
        comparePoolsTool(mockApiClient, { pool_ids: ['pool-1'] })
      ).rejects.toThrow();

      await expect(
        comparePoolsTool(mockApiClient, {
          pool_ids: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
        })
      ).rejects.toThrow();
    });
  });

  describe('explainPoolRiskTool', () => {
    it('should get explanation with LLM key', async () => {
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

      vi.mocked(mockApiClient.explainPoolRisk).mockResolvedValue(mockExplanation);

      const result = await explainPoolRiskTool(
        mockApiClient,
        { pool_id: '550e8400-e29b-41d4-a716-446655440000' },
        'test-key'
      );

      expect(result.content[0].text).toContain('Low risk pool');
      expect(result.content[0].text).not.toContain('fallback');
    });

    it('should indicate fallback mode', async () => {
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

      vi.mocked(mockApiClient.explainPoolRisk).mockResolvedValue(mockExplanation);

      const result = await explainPoolRiskTool(mockApiClient, {
        pool_id: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.content[0].text).toContain('fallback');
      expect(result.content[0].text).toContain('No LLM key provided');
    });
  });

  describe('getVaultInfoTool', () => {
    it('should get vault info', async () => {
      const mockVaultState = {
        vault_address: '0x1234567890123456789012345678901234567890',
        chain_id: 11155111,
        total_assets: '1000000000',
        total_supply: '900000000',
        share_price: 1.111111,
        block_number: 12345678,
        snapshot_at: '2026-10-25T00:00:00Z',
      };

      vi.mocked(mockApiClient.getVaultInfo).mockResolvedValue(mockVaultState);

      const result = await getVaultInfoTool(mockApiClient);

      expect(result.content[0].text).toContain('0x1234567890123456789012345678901234567890');
      expect(result.content[0].text).toContain('1.111111');
    });

    it('should handle unavailable vault', async () => {
      vi.mocked(mockApiClient.getVaultInfo).mockResolvedValue(null);

      const result = await getVaultInfoTool(mockApiClient);

      expect(result.content[0].text).toContain('not available');
    });
  });
});

describe('safeErrorMessage / toolErrorResult', () => {
  it('maps errors to safe isError results', () => {
    expect(toolErrorResult(new ApiError('x', 404))).toEqual({ isError: true, content: [{ type: 'text', text: 'Not found: no pool with that id' }] });
    expect(safeErrorMessage(new ApiError('Network error', 0))).toBe('Risk API is unreachable');
    expect(safeErrorMessage(new Error('secret http://internal/x'))).toBe('Internal error');
  });
});
