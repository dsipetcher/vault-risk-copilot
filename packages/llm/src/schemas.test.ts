import { describe, expect, it } from 'vitest';
import { explanationOutputSchema, riskFactorSchema } from './schemas.js';

describe('explanation schema', () => {
  it('coerces key_factors[].value from a number to a string', () => {
    const factor = riskFactorSchema.parse({
      signal: 'APY',
      value: 2.8,
      explanation: 'APY of 2.8 is the quoted yield.',
    });
    expect(factor.value).toBe('2.8');
    expect(typeof factor.value).toBe('string');
  });

  it('accepts a numeric value inside a full explanation payload', () => {
    const parsed = explanationOutputSchema.parse({
      summary: 'This Aave v3 pool has a moderate risk rating overall.',
      key_factors: [
        {
          signal: 'TVL Score',
          value: 95,
          explanation: 'High TVL score of 95 indicates lower size risk.',
        },
      ],
      disclaimer: 'This is educational only and not financial advice.',
    });
    expect(parsed.key_factors[0].value).toBe('95');
  });

  it('still accepts string values', () => {
    const factor = riskFactorSchema.parse({
      signal: 'TVL Score',
      value: '95/100',
      explanation: 'Score is 95 out of 100.',
    });
    expect(factor.value).toBe('95/100');
  });
});
