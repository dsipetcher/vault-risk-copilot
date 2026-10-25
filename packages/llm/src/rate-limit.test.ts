import { describe, expect, it } from 'vitest';
import {
  RATE_LIMIT_DEFAULT_WAIT_MS,
  RATE_LIMIT_PER_WAIT_CAP_MS,
  RATE_LIMIT_WAIT_CAP_MS,
  RateLimitError,
  backoffWaitMs,
  describeFallbackReason,
  isRateLimitError,
  parseRetryAfterMs,
} from './rate-limit.js';

describe('parseRetryAfterMs', () => {
  it('uses the default wait when the header is missing', () => {
    expect(parseRetryAfterMs(null)).toBe(RATE_LIMIT_DEFAULT_WAIT_MS);
  });

  it('parses integer seconds and caps long waits', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('60')).toBe(RATE_LIMIT_WAIT_CAP_MS);
  });

  it('parses HTTP-date Retry-After values', () => {
    const when = new Date(Date.now() + 1500).toUTCString();
    const wait = parseRetryAfterMs(when);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(RATE_LIMIT_WAIT_CAP_MS);
  });
});

describe('backoffWaitMs', () => {
  it('honors Retry-After and stays within the remaining budget', () => {
    expect(backoffWaitMs(0, '2', 30_000)).toBe(2000);
    expect(backoffWaitMs(0, '60', 30_000)).toBe(RATE_LIMIT_PER_WAIT_CAP_MS);
    expect(backoffWaitMs(0, '10', 3_000)).toBe(3000);
  });

  it('uses exponential backoff when Retry-After is absent', () => {
    expect(backoffWaitMs(0, null, 30_000)).toBe(1000);
    expect(backoffWaitMs(1, null, 30_000)).toBe(2000);
    expect(backoffWaitMs(2, null, 30_000)).toBe(4000);
  });
});

describe('describeFallbackReason', () => {
  it('explains rate_limited clearly', () => {
    expect(describeFallbackReason('rate_limited')).toMatch(/Rate limited by the provider/i);
  });
});

describe('isRateLimitError', () => {
  it('recognizes RateLimitError and message fallbacks', () => {
    expect(isRateLimitError(new RateLimitError())).toBe(true);
    expect(isRateLimitError(new Error('429 too many requests'))).toBe(true);
    expect(isRateLimitError(new Error('boom'))).toBe(false);
  });
});
