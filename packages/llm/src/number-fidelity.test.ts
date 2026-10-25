import { describe, expect, it } from 'vitest';
import {
  collectTextNumbers,
  expandScaledNumbers,
  numbersMatch,
} from './number-fidelity.js';

describe('expandScaledNumbers / collectTextNumbers', () => {
  it('parses $22.5 B with a space', () => {
    expect(collectTextNumbers('$22.5 B')).toEqual([22_500_000_000]);
    expect(expandScaledNumbers('$22.5 B')).toBe('22500000000');
  });

  it('parses $2.68 billion', () => {
    expect(collectTextNumbers('$2.68 billion')).toEqual([2_680_000_000]);
  });

  it('parses $3.5 billion as 3.5e9, not leftover 3', () => {
    expect(collectTextNumbers('$3.5 billion')).toEqual([3_500_000_000]);
    expect(collectTextNumbers('$3.5 billion')).not.toContain(3);
    expect(collectTextNumbers('TVL is $3.5 billion.')).toEqual([3_500_000_000]);
  });

  it('parses decimals with K/M/B and word scales with or without spaces', () => {
    expect(collectTextNumbers('$22.5B')).toEqual([22_500_000_000]);
    expect(collectTextNumbers('22.5 B')).toEqual([22_500_000_000]);
    expect(collectTextNumbers('$3.5billion')).toEqual([3_500_000_000]);
    expect(collectTextNumbers('2.68 million')).toEqual([2_680_000]);
    expect(collectTextNumbers('$5 thousand')).toEqual([5_000]);
  });
});

describe('numbersMatch rounding', () => {
  it('accepts $22.5 B against TVL 22532735702', () => {
    expect(numbersMatch(22_500_000_000, 22_532_735_702)).toBe(true);
  });

  it('accepts $2.68 billion against a nearby TVL', () => {
    expect(numbersMatch(2_680_000_000, 2_678_123_456)).toBe(true);
  });

  it('rejects $6 M vs $5M and $5 B vs $5M', () => {
    expect(numbersMatch(6_000_000, 5_000_000)).toBe(false);
    expect(numbersMatch(5_000_000_000, 5_000_000)).toBe(false);
  });

  it('still requires exact-ish match for scores under 1000', () => {
    expect(numbersMatch(93.2, 95)).toBe(false);
    expect(numbersMatch(95.0, 95)).toBe(true);
  });
});
