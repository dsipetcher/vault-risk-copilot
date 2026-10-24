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
      tvl_volatility_score: 75,
      apy_volatility_score: 60,
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
        signal: 'IL Risk',
        value: '0.05',
        explanation: 'Very low IL risk of 0.05.',
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
          signal: 'TVL Score',
          value: '$520,000',
          explanation: 'TVL of $520,000 indicates strong liquidity.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(true);
  });

  it('should accept numbers within 2% relative tolerance', () => {
    const output: ExplanationOutput = {
      summary: 'TVL score is high.',
      key_factors: [
        {
          signal: 'TVL Score',
          value: '93.2/100',
          explanation: 'TVL score 93.2 is within tolerance of input value 95.',
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
          signal: 'TVL Volatility',
          value: '-35.2%',
          explanation: 'TVL change -35.2% shows decline.',
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

  it('should accept K/M/B unit scaling ($0.52M for 520000)', () => {
    const output: ExplanationOutput = {
      summary: 'TVL of $0.52M.',
      key_factors: [
        {
          signal: 'TVL Score',
          value: '$0.52M',
          explanation: 'TVL of $0.52M indicates strong liquidity.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(true);
  });

  it('should accept K/M/B unit scaling ($520K for 520000)', () => {
    const output: ExplanationOutput = {
      summary: 'TVL of $520K.',
      key_factors: [
        {
          signal: 'TVL Score',
          value: '$520K',
          explanation: 'TVL of $520K shows decent size.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(true);
  });

  it('should accept "TVL dropped 35.2%" for negative input -35.2', () => {
    const output: ExplanationOutput = {
      summary: 'TVL dropped 35.2% in the last 7 days.',
      key_factors: [
        {
          signal: 'TVL Volatility',
          value: '35.2%',
          explanation: 'TVL dropped 35.2% indicating withdrawal pressure.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(true);
  });

  it('should accept "decreased by 35.2%" for negative input -35.2', () => {
    const output: ExplanationOutput = {
      summary: 'TVL decreased by 35.2%.',
      key_factors: [
        {
          signal: 'TVL Volatility',
          value: '35.2%',
          explanation: 'Decreased by 35.2% showing negative trend.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(true);
  });

  it('REJECT: "TVL rose 35.2%" with negative input -35.2', () => {
    const output: ExplanationOutput = {
      summary: 'TVL rose 35.2%.',
      key_factors: [
        {
          signal: 'TVL Volatility',
          value: '35.2%',
          explanation: 'TVL rose 35.2% showing growth.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(false);
  });

  it('REJECT: APY volatility 88 (real 95) - wrong field number', () => {
    const output: ExplanationOutput = {
      summary: 'Test',
      key_factors: [
        {
          signal: 'APY Volatility',
          value: '88/100',
          explanation: 'APY volatility score is 88.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(false);
  });

  it('REJECT: Vault score 92 (real 75) - hallucinated number', () => {
    const inputWith75 = {
      ...baseInput,
      breakdown: { ...baseInput.breakdown, vault_score: 75 },
    };
    const output: ExplanationOutput = {
      summary: 'Test',
      key_factors: [
        {
          signal: 'Vault Score',
          value: '92/100',
          explanation: 'Vault score is 92.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(inputWith75, output);
    expect(result).toBe(false);
  });

  it('REJECT: $510K vs input 500K (2% tolerance = 10K, so 510K fails)', () => {
    const inputWith500K = {
      ...baseInput,
      pool_metrics: { ...baseInput.pool_metrics, tvl_usd: 500000 },
    };
    const output: ExplanationOutput = {
      summary: 'Test',
      key_factors: [
        {
          signal: 'TVL Score',
          value: '$511K',
          explanation: 'TVL is $511K.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(inputWith500K, output);
    expect(result).toBe(false);
  });

  // === SUMMARY VALIDATION TESTS ===

  it('REJECT: summary "APY volatility score is 88" (real 95)', () => {
    const output: ExplanationOutput = {
      summary: 'APY volatility score is 88',
      key_factors: [
        {
          signal: 'APY Volatility',
          value: '95/100',
          explanation: 'High volatility.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(false);
  });

  it('REJECT: summary "TVL rose 35.2%" (real -35.2)', () => {
    const output: ExplanationOutput = {
      summary: 'TVL rose 35.2%',
      key_factors: [
        {
          signal: 'TVL Volatility',
          value: '-35.2%',
          explanation: 'Decline.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(false);
  });

  it('REJECT: summary "score 47 of 100" (invented)', () => {
    const output: ExplanationOutput = {
      summary: 'score 47 of 100',
      key_factors: [
        {
          signal: 'TVL Score',
          value: '95/100',
          explanation: 'Good.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(false);
  });

  it('REJECT: summary "TVL is $9M and risk 12" (9M invented, 12 invented)', () => {
    const output: ExplanationOutput = {
      summary: 'TVL is $9M and risk 12',
      key_factors: [
        {
          signal: 'TVL Score',
          value: '95/100',
          explanation: 'Good.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = (provider as any).validateNumberFidelity(baseInput, output);
    expect(result).toBe(false);
  });
});
