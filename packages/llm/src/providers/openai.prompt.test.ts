import { describe, expect, it } from 'vitest';
import { OpenAIProvider } from './openai.js';
import type { RiskInput } from '../schemas.js';

describe('OpenAI prompt semantics', () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });

  const input: RiskInput = {
    pool_id: '123e4567-e89b-12d3-a456-426614174000',
    pool_name: 'Huge Pool',
    protocol: 'aave',
    chain: 'Ethereum',
    total_risk_score: 12,
    risk_category: 'low',
    breakdown: {
      tvl_score: 5,
      tvl_volatility_score: 10,
      apy_volatility_score: 8,
      reward_ratio_score: null,
      stablecoin_score: 0,
      il_score: null,
      data_age_score: null,
      vault_score: null,
    },
    pool_metrics: {
      tvl_usd: 22_490_000_000,
      tvl_change_7d_pct: 1.2,
      apy: 3.4,
      apy_base: 3.4,
      apy_reward: 0,
      apy_sigma: 0.2,
      il_risk: null,
      is_stablecoin: true,
      count: 365,
    },
  };

  it('tells the model that a higher sub-score means higher risk', () => {
    const system = Reflect.get(provider, 'buildSystemPrompt').call(provider) as string;
    expect(system).toMatch(/HIGHER score means HIGHER risk/i);
  });

  it('passes raw TVL and APY values in the user prompt', () => {
    const user = Reflect.get(provider, 'buildUserPrompt').call(provider, input) as string;
    expect(user).toContain('22490000000');
    expect(user).toContain('higher = more risk');
    expect(user).toMatch(/APY: 3\.40%/);
    // E2E stub parses factors between `=== RISK BREAKDOWN ===` and the next `===`.
    const breakdown = user.split('=== RISK BREAKDOWN ===')[1]?.split('===')[0] ?? '';
    expect(breakdown).toMatch(/TVL Score: 5\.0/);
    expect(breakdown).toMatch(/APY Volatility: 8\.0/);
  });
});
