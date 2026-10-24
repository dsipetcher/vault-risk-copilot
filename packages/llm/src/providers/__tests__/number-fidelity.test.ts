import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from '../openai.js';
import type { RiskInput, ExplanationOutput } from '../../schemas.js';

describe('Number Fidelity Validation', () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });

  const baseInput: RiskInput = {
    pool_id: 'test-pool',
    pool_name: 'Test Pool',
    protocol: 'test',
    chain: 'Ethereum',
    total_risk_score: 50,
    risk_category: 'medium',
    breakdown: {
      tvl_score: 95,
      tvl_volatility_score: null,
      apy_volatility_score: null,
      reward_ratio_score: null,
      stablecoin_score: null,
      il_score: 0.05,
      data_age_score: null,
      vault_score: null,
    },
    pool_metrics: {
      tvl_usd: 520000,
      tvl_change_7d_pct: -35.2,
      apy: null,
      apy_base: null,
      apy_reward: null,
      apy_sigma: null,
      il_risk: 0.05,
      is_stablecoin: false,
      count: null,
    },
  };

  const validOutput: ExplanationOutput = {
    summary: 'TVL of $520,000 with -35.2% change. IL risk 0.05.',
    key_factors: [
      {
        signal: 'TVL Score',
        value: '95/100',
        explanation: 'High TVL of $520,000 indicates strong liquidity.',
      },
      {
        signal: 'IL Score',
        value: '0.05',
        explanation: 'Very low IL risk.',
      },
    ],
    disclaimer: 'Educational only.',
  };

  it('should accept exact matches', () => {
    const result = (provider as any).validateNumberFidelity(baseInput, validOutput);
    expect(result).toBe(true);
  });

  it('should accept numbers with thousand separators ($520,000)', () => {
    const output: ExplanationOutput = {
      summary: 'TVL of $520,000.',
      key_factors: [
        {
          signal: 'TVL',
          value: '$520,000',
          explanation: 'Test',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(true);
  });

  it('should accept numbers within 2% relative tolerance', () => {
    const output: ExplanationOutput = {
      summary: 'TVL score is 94.1 (input: 95, within 2%).',
      key_factors: [
        {
          signal: 'TVL',
          value: '94.1/100',
          explanation: 'Test',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(true);
  });

  it('should accept negative numbers with correct sign (-35.2)', () => {
    const output: ExplanationOutput = {
      summary: 'Change: -35.2%',
      key_factors: [
        {
          signal: 'TVL Change',
          value: '-35.2%',
          explanation: 'Test',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(true);
  });

  it('REJECT: flipped sign (32% vs input -35.2)', () => {
    const output: ExplanationOutput = {
      summary: 'Change: 32%',
      key_factors: [
        {
          signal: 'TVL Change',
          value: '32%',
          explanation: 'Wrong sign!',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(false);
  });

  it('REJECT: invented number (88 vs input 95)', () => {
    const output: ExplanationOutput = {
      summary: 'TVL score is 88.',
      key_factors: [
        {
          signal: 'TVL',
          value: '88/100',
          explanation: 'Hallucinated!',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(false);
  });

  it('REJECT: invented number in factor (47/100)', () => {
    const output: ExplanationOutput = {
      summary: 'Test pool.',
      key_factors: [
        {
          signal: 'Fake Score',
          value: '47/100',
          explanation: 'This number does not exist in input!',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(false);
  });

  it('REJECT: wrong IL value (0.12 vs input 0.05)', () => {
    const output: ExplanationOutput = {
      summary: 'IL risk is 0.12.',
      key_factors: [
        {
          signal: 'IL',
          value: '0.12',
          explanation: 'Wrong!',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(false);
  });
});
