import { describe, it, expect } from 'vitest';
import { MockProvider } from './mock.js';
import { explanationOutputSchema } from '../schemas.js';

describe('MockProvider', () => {
  const provider = new MockProvider();

  it('should generate valid explanation', async () => {
    const input = {
      pool_id: '123e4567-e89b-12d3-a456-426614174000',
      pool_name: 'Test Pool',
      protocol: 'test-protocol',
      chain: 'Ethereum',
      total_risk_score: 50.0,
      risk_category: 'medium' as const,
      breakdown: {
        tvl_score: 50,
        tvl_volatility_score: 50,
        apy_volatility_score: 50,
        reward_ratio_score: 50,
        stablecoin_score: 50,
        il_score: 50,
        data_age_score: 50,
        vault_score: 50,
      },
      pool_metrics: {
        tvl_usd: 1000000,
        tvl_change_7d_pct: -10.0,
        apy: 10.0,
        apy_base: 8.0,
        apy_reward: 2.0,
        apy_sigma: 2.5,
        il_risk: 0.3,
        is_stablecoin: false,
        count: 30,
      },
    };

    const result = await provider.generate(input);

    expect(result.output).toBeDefined();
    expect(result.metadata.model).toBe('mock-v1');
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);

    const parsed = explanationOutputSchema.parse(result.output);
    expect(parsed.summary).toContain('test-protocol');
    expect(parsed.key_factors.length).toBeGreaterThan(0);
    expect(parsed.disclaimer).toContain('educational purposes');
  });

  it('should sanitize HTML in pool name', async () => {
    const input = {
      pool_id: '123e4567-e89b-12d3-a456-426614174000',
      pool_name: '<script>alert("xss")</script>',
      protocol: 'test',
      chain: 'Ethereum',
      total_risk_score: 50.0,
      risk_category: 'medium' as const,
      breakdown: {
        tvl_score: 50,
        tvl_volatility_score: 50,
        apy_volatility_score: 50,
        reward_ratio_score: 50,
        stablecoin_score: 50,
        il_score: 50,
        data_age_score: 50,
        vault_score: 50,
      },
      pool_metrics: {
        tvl_usd: 1000000,
        tvl_change_7d_pct: 0,
        apy: 10.0,
        apy_base: 10.0,
        apy_reward: 0,
        apy_sigma: 2.0,
        il_risk: null,
        is_stablecoin: false,
        count: 30,
      },
    };

    const result = await provider.generate(input);

    expect(result.output.summary).not.toContain('<script>');
    expect(result.output.summary).not.toContain('</script>');
  });

  it('should not use banned phrases', async () => {
    const input = {
      pool_id: '123e4567-e89b-12d3-a456-426614174000',
      pool_name: 'Test Pool',
      protocol: 'test',
      chain: 'Ethereum',
      total_risk_score: 10.0,
      risk_category: 'low' as const,
      breakdown: {
        tvl_score: 0,
        tvl_volatility_score: 0,
        apy_volatility_score: 0,
        reward_ratio_score: 0,
        stablecoin_score: 0,
        il_score: 0,
        data_age_score: 0,
        vault_score: 50,
      },
      pool_metrics: {
        tvl_usd: 10000000000,
        tvl_change_7d_pct: 5.0,
        apy: 5.0,
        apy_base: 5.0,
        apy_reward: 0,
        apy_sigma: 0.1,
        il_risk: null,
        is_stablecoin: true,
        count: 365,
      },
    };

    const result = await provider.generate(input);
    const fullText = JSON.stringify(result.output).toLowerCase();

    expect(fullText).not.toContain('guaranteed');
    expect(fullText).not.toContain('risk-free');
    expect(fullText).not.toContain('safe investment');
  });

  it('should include disclaimer', async () => {
    const input = {
      pool_id: '123e4567-e89b-12d3-a456-426614174000',
      pool_name: 'Test Pool',
      protocol: 'test',
      chain: 'Ethereum',
      total_risk_score: 50.0,
      risk_category: 'medium' as const,
      breakdown: {
        tvl_score: 50,
        tvl_volatility_score: 50,
        apy_volatility_score: 50,
        reward_ratio_score: 50,
        stablecoin_score: 50,
        il_score: 50,
        data_age_score: 50,
        vault_score: 50,
      },
      pool_metrics: {
        tvl_usd: 1000000,
        tvl_change_7d_pct: 0,
        apy: 10.0,
        apy_base: 10.0,
        apy_reward: 0,
        apy_sigma: 2.0,
        il_risk: null,
        is_stablecoin: false,
        count: 30,
      },
    };

    const result = await provider.generate(input);

    expect(result.output.disclaimer).toContain('educational purposes');
    expect(result.output.disclaimer).toContain('not constitute financial advice');
  });
});
