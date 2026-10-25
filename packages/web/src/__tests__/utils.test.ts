import { describe, it, expect } from 'vitest';
import { formatNumber, formatPercentage, formatDate, shortenAddress, getRiskColor } from '@/lib/utils';

describe('formatNumber', () => {
  it('formats large numbers with B suffix', () => {
    expect(formatNumber(5000000000)).toBe('$5.00B');
    expect(formatNumber(1234567890)).toBe('$1.23B');
  });

  it('formats medium numbers with M suffix', () => {
    expect(formatNumber(5000000)).toBe('$5.00M');
    expect(formatNumber(1234567)).toBe('$1.23M');
  });

  it('formats small numbers with K suffix', () => {
    expect(formatNumber(5000)).toBe('$5.00K');
    expect(formatNumber(1234)).toBe('$1.23K');
  });

  it('formats very small numbers without suffix', () => {
    expect(formatNumber(500)).toBe('$500.00');
    expect(formatNumber(12.34)).toBe('$12.34');
  });
});

describe('formatPercentage', () => {
  it('formats percentages with default decimals', () => {
    expect(formatPercentage(5.5)).toBe('5.50%');
    expect(formatPercentage(12.345)).toBe('12.35%');
  });

  it('formats percentages with custom decimals', () => {
    expect(formatPercentage(5.5, 0)).toBe('6%');
    expect(formatPercentage(12.345, 3)).toBe('12.345%');
  });
});

describe('formatDate', () => {
  it('formats Date objects', () => {
    const date = new Date('2024-03-15T10:30:00Z');
    const formatted = formatDate(date);
    expect(formatted).toMatch(/Mar 1[45], 2024/); // Time zone dependent
  });

  it('formats ISO date strings from PostgreSQL', () => {
    const isoString = '2024-03-15T10:30:00.000Z';
    const formatted = formatDate(isoString);
    expect(formatted).toMatch(/Mar 1[45], 2024/);
  });

  it('formats timestamp strings', () => {
    const timestamp = '2024-10-24T18:20:00Z';
    const formatted = formatDate(timestamp);
    expect(formatted).toMatch(/Oct 2[45], 2024/);
  });

  it('does not return Invalid Date for valid dates', () => {
    const date = new Date('2024-03-15T10:30:00Z');
    const formatted = formatDate(date);
    expect(formatted).not.toContain('Invalid');
  });
});

describe('shortenAddress', () => {
  it('shortens Ethereum addresses', () => {
    expect(shortenAddress('0x1234567890123456789012345678901234567890')).toBe(
      '0x1234...7890'
    );
  });

  it('uses custom character count', () => {
    expect(shortenAddress('0x1234567890123456789012345678901234567890', 6)).toBe(
      '0x123456...567890'
    );
  });
});

describe('getRiskColor', () => {
  it('returns correct color for low risk', () => {
    expect(getRiskColor('low')).toContain('green');
  });

  it('returns correct color for medium risk', () => {
    expect(getRiskColor('medium')).toContain('yellow');
  });

  it('returns correct color for high risk', () => {
    expect(getRiskColor('high')).toContain('orange');
  });

  it('returns correct color for critical risk', () => {
    expect(getRiskColor('critical')).toContain('red');
  });

  it('returns gray for unknown risk', () => {
    expect(getRiskColor('unknown')).toContain('gray');
  });
});
