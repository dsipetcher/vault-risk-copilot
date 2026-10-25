import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from '../openai.js';
import type { RiskInput, ExplanationOutput } from '../../schemas.js';

type NumberFidelityFn = (
  input: RiskInput,
  output: ExplanationOutput
) => boolean;

function validateNumberFidelity(
  p: OpenAIProvider,
  input: RiskInput,
  output: ExplanationOutput
): boolean {
  const fn = Reflect.get(p, 'validateNumberFidelity') as NumberFidelityFn;
  return fn.call(p, input, output);
}

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
    const result = validateNumberFidelity(provider, baseInput, validOutput);
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
    const result = validateNumberFidelity(provider, baseInput, output);
    expect(result).toBe(true);
  });

  it('REJECT: 93.2 vs input 95 (exact match required, rounding to 2 decimals)', () => {
    const output: ExplanationOutput = {
      summary: 'TVL score is high.',
      key_factors: [
        {
          signal: 'TVL Score',
          value: '93.2/100',
          explanation: 'TVL score 93.2 differs from input 95.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = validateNumberFidelity(provider, baseInput, output);
    expect(result).toBe(false);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, inputWith75, output);
    expect(result).toBe(false);
  });

  it('REJECT: $550K vs input 500K (10% is not reasonable rounding)', () => {
    const inputWith500K = {
      ...baseInput,
      pool_metrics: { ...baseInput.pool_metrics, tvl_usd: 500000 },
    };
    const output: ExplanationOutput = {
      summary: 'Test',
      key_factors: [
        {
          signal: 'TVL Score',
          value: '$550K',
          explanation: 'TVL is $550K.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = validateNumberFidelity(provider, inputWith500K, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
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
    const result = validateNumberFidelity(provider, baseInput, output);
    expect(result).toBe(false);
  });

  it('ACCEPT: "TVL changed -35.2%, meaning higher risk" (higher modifies risk, not TVL)', () => {
    const output: ExplanationOutput = {
      summary: 'TVL changed -35.2%, meaning higher risk',
      key_factors: [
        {
          signal: 'TVL Volatility',
          value: '-35.2%',
          explanation: 'Decline indicates higher risk.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = validateNumberFidelity(provider, baseInput, output);
    expect(result).toBe(true);
  });

  it('ACCEPT: summary "risk score of 85.5/100" (total_risk_score)', () => {
    const inputWith85 = {
      ...baseInput,
      total_risk_score: 85.5,
    };
    const output: ExplanationOutput = {
      summary: 'Pool has a risk score of 85.5/100',
      key_factors: [
        {
          signal: 'TVL Score',
          value: '95/100',
          explanation: 'Good TVL.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = validateNumberFidelity(provider, inputWith85, output);
    expect(result).toBe(true);
  });

  it('ACCEPT: "TVL dropped 35.2%, signalling higher risk" (honor decrease word even when risk nearby)', () => {
    const output: ExplanationOutput = {
      summary: 'TVL dropped 35.2%, signalling higher risk',
      key_factors: [
        {
          signal: 'TVL Volatility',
          value: '35.2%',
          explanation: 'Dropped 35.2%, signalling higher risk.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = validateNumberFidelity(provider, baseInput, output);
    expect(result).toBe(true);
  });

  it('REJECT: "score of 100" with real 75 (hallucination)', () => {
    const inputWith75 = {
      ...baseInput,
      breakdown: { ...baseInput.breakdown, vault_score: 75 },
    };
    const output: ExplanationOutput = {
      summary: 'Vault has a score of 100',
      key_factors: [
        {
          signal: 'Vault Score',
          value: '75/100',
          explanation: 'Good.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = validateNumberFidelity(provider, inputWith75, output);
    expect(result).toBe(false);
  });

  it('ACCEPT: "75 out of 100" with real 75 (strip scale, keep number)', () => {
    const inputWith75 = {
      ...baseInput,
      breakdown: { ...baseInput.breakdown, vault_score: 75 },
    };
    const output: ExplanationOutput = {
      summary: 'Vault has a score',
      key_factors: [
        {
          signal: 'Vault Score',
          value: '75 out of 100',
          explanation: 'Vault score is 75.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = validateNumberFidelity(provider, inputWith75, output);
    expect(result).toBe(true);
  });

  it('ACCEPT: "100 out of 100" only when real value is 100', () => {
    const inputWith100 = {
      ...baseInput,
      breakdown: { ...baseInput.breakdown, vault_score: 100 },
    };
    const output: ExplanationOutput = {
      summary: 'Vault has perfect score',
      key_factors: [
        {
          signal: 'Vault Score',
          value: '100 out of 100',
          explanation: 'Perfect vault score.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = validateNumberFidelity(provider, inputWith100, output);
    expect(result).toBe(true);
  });

  it('REJECT: "100 out of 100" when real value is 75', () => {
    const inputWith75 = {
      ...baseInput,
      breakdown: { ...baseInput.breakdown, vault_score: 75 },
    };
    const output: ExplanationOutput = {
      summary: 'Vault has perfect score',
      key_factors: [
        {
          signal: 'Vault Score',
          value: '100 out of 100',
          explanation: 'Perfect vault score.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = validateNumberFidelity(provider, inputWith75, output);
    expect(result).toBe(false);
  });

  // Groq gpt-oss-120b commonly writes "7-day TVL change" and "Impermanent Loss".
  // Those used to fail the validator as invented numbers / unknown signals (false positives).
  it('ACCEPT: Groq/gpt-oss phrasing "7-day" window + Impermanent Loss alias', () => {
    const output: ExplanationOutput = {
      summary: 'Over the 7-day window TVL of $520,000 dropped 35.2%.',
      key_factors: [
        {
          signal: 'TVL Volatility',
          value: '-35.2%',
          explanation: '7-day TVL change of -35.2% indicates a decline.',
        },
        {
          signal: 'Impermanent Loss',
          value: '0.05',
          explanation: 'Impermanent loss risk is 0.05 over the 7-day window.',
        },
      ],
      disclaimer: 'Educational only.',
    };
    const result = validateNumberFidelity(provider, baseInput, output);
    expect(result).toBe(true);
  });

  const tvl5M: RiskInput = {
    ...baseInput,
    pool_metrics: { ...baseInput.pool_metrics, tvl_usd: 5_000_000 },
  };

  function tvlOutput(text: string): ExplanationOutput {
    return {
      summary: `TVL is ${text}.`,
      key_factors: [
        {
          signal: 'TVL Score',
          value: text,
          explanation: `TVL of ${text} is healthy.`,
        },
      ],
      disclaimer: 'Test',
    };
  }

  it('ACCEPT: "$5M" compact unit', () => {
    expect(validateNumberFidelity(provider, tvl5M, tvlOutput('$5M'))).toBe(true);
  });

  it('ACCEPT: "$5 M" with a space (Groq/gpt-oss)', () => {
    expect(validateNumberFidelity(provider, tvl5M, tvlOutput('$5 M'))).toBe(true);
  });

  it('ACCEPT: "$5 million" word scale', () => {
    expect(validateNumberFidelity(provider, tvl5M, tvlOutput('$5 million'))).toBe(true);
  });

  it('ACCEPT: "$1.2 billion" word scale', () => {
    const input: RiskInput = {
      ...baseInput,
      pool_metrics: { ...baseInput.pool_metrics, tvl_usd: 1_200_000_000 },
    };
    expect(validateNumberFidelity(provider, input, tvlOutput('$1.2 billion'))).toBe(true);
  });

  it('REJECT: "$6 M" when true TVL is $5M', () => {
    expect(validateNumberFidelity(provider, tvl5M, tvlOutput('$6 M'))).toBe(false);
  });

  it('REJECT: "$50 M" when true TVL is $5M', () => {
    expect(validateNumberFidelity(provider, tvl5M, tvlOutput('$50 M'))).toBe(false);
  });

  it('REJECT: "$5 B" when true TVL is $5M', () => {
    expect(validateNumberFidelity(provider, tvl5M, tvlOutput('$5 B'))).toBe(false);
  });

  it('REJECT: "$5 billion" when true TVL is $5M', () => {
    expect(validateNumberFidelity(provider, tvl5M, tvlOutput('$5 billion'))).toBe(false);
  });

  it('REJECT: "$5 marks" is not read as $5M', () => {
    expect(validateNumberFidelity(provider, tvl5M, tvlOutput('$5 marks'))).toBe(false);
  });

  it('ACCEPT: "$22.5 B" rounded from TVL 22532735702', () => {
    const input: RiskInput = {
      ...baseInput,
      pool_metrics: { ...baseInput.pool_metrics, tvl_usd: 22532735702 },
    };
    expect(validateNumberFidelity(provider, input, tvlOutput('$22.5 B'))).toBe(true);
  });

  it('ACCEPT: "$2.68 billion" rounded from TVL 2678123456', () => {
    const input: RiskInput = {
      ...baseInput,
      pool_metrics: { ...baseInput.pool_metrics, tvl_usd: 2_678_123_456 },
    };
    expect(validateNumberFidelity(provider, input, tvlOutput('$2.68 billion'))).toBe(true);
  });

  it('ACCEPT: "$3.5 billion" parses the decimal+word scale (not leftover 3)', () => {
    const input: RiskInput = {
      ...baseInput,
      pool_metrics: { ...baseInput.pool_metrics, tvl_usd: 3_500_000_000 },
    };
    expect(validateNumberFidelity(provider, input, tvlOutput('$3.5 billion'))).toBe(true);
  });

  it('ACCEPT: "$3.5billion" without a space', () => {
    const input: RiskInput = {
      ...baseInput,
      pool_metrics: { ...baseInput.pool_metrics, tvl_usd: 3_512_000_000 },
    };
    expect(validateNumberFidelity(provider, input, tvlOutput('$3.5billion'))).toBe(true);
  });

  it('ACCEPT: grouped thousands without a $ prefix (520,000)', () => {
    const output: ExplanationOutput = {
      summary: 'TVL is 520,000 USD.',
      key_factors: [
        {
          signal: 'TVL Score',
          value: '95',
          explanation: 'TVL of 520,000 supports a high score.',
        },
      ],
      disclaimer: 'Test',
    };
    const result = validateNumberFidelity(provider, baseInput, output);
    expect(result).toBe(true);
  });
});
