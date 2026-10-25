import { describe, expect, it } from 'vitest';
import {
  RATE_LIMIT_DEFAULT_WAIT_MS,
  RATE_LIMIT_WAIT_CAP_MS,
  RateLimitError,
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

describe('isRateLimitError', () => {
  it('recognizes RateLimitError and message fallbacks', () => {
    expect(isRateLimitError(new RateLimitError())).toBe(true);
    expect(isRateLimitError(new Error('429 too many requests'))).toBe(true);
    expect(isRateLimitError(new Error('boom'))).toBe(false);
  });
});
