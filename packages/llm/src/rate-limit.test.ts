import { describe, expect, it } from 'vitest';
import {
  RATE_LIMIT_DEFAULT_WAIT_MS,
  RATE_LIMIT_PER_WAIT_CAP_MS,
  RATE_LIMIT_TOTAL_WAIT_CAP_MS,
  RATE_LIMIT_WAIT_CAP_MS,
  RateLimitError,
  backoffWaitMs,
  describeFallbackReason,
  exceedsBackoffBudget,
  formatRetryIn,
  isRateLimitError,
  parseDurationHeaderMs,
  parseRetryAfterMs,
  requestedWaitMs,
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

describe('parseDurationHeaderMs / requestedWaitMs', () => {
  it('parses integer seconds without capping daily-limit Retry-After values', () => {
    expect(parseDurationHeaderMs('666')).toBe(666_000);
    expect(parseDurationHeaderMs('913')).toBe(913_000);
  });

  it('parses Groq reset durations like 7m26.56s', () => {
    expect(parseDurationHeaderMs('7m26.56s')).toBeCloseTo(446_560, 0);
    expect(parseDurationHeaderMs('2s')).toBe(2_000);
    expect(parseDurationHeaderMs('11m')).toBe(660_000);
  });

  it('prefers the longest hinted wait from Retry-After or reset headers', () => {
    const headers = new Headers({
      'Retry-After': '666',
      'x-ratelimit-reset-requests': '7m26.56s',
      'x-ratelimit-reset-tokens': '2s',
    });
    expect(requestedWaitMs(headers)).toBe(666_000);
    expect(
      requestedWaitMs(new Headers({ 'x-ratelimit-reset-requests': '7m26.56s' }))
    ).toBeCloseTo(446_560, 0);
  });

  it('treats a wait longer than the remaining budget as exceeding it', () => {
    expect(exceedsBackoffBudget(666_000, RATE_LIMIT_TOTAL_WAIT_CAP_MS)).toBe(true);
    expect(exceedsBackoffBudget(2_000, RATE_LIMIT_TOTAL_WAIT_CAP_MS)).toBe(false);
    expect(exceedsBackoffBudget(null, RATE_LIMIT_TOTAL_WAIT_CAP_MS)).toBe(false);
  });
});

describe('formatRetryIn', () => {
  it('formats daily-limit waits as minutes', () => {
    expect(formatRetryIn(666_000)).toBe('retry in ~11 min');
    expect(formatRetryIn(913_000)).toBe('retry in ~15 min');
  });
});

describe('describeFallbackReason', () => {
  it('explains rate_limited clearly', () => {
    expect(describeFallbackReason('rate_limited')).toMatch(/Rate limited by the provider/i);
  });

  it('includes retry in ~11 min when Retry-After is a daily-limit wait', () => {
    expect(describeFallbackReason('rate_limited', 666_000)).toMatch(/retry in ~11 min/i);
    expect(describeFallbackReason('rate_limited', 913_000)).toMatch(/retry in ~15 min/i);
  });
});

describe('isRateLimitError', () => {
  it('recognizes RateLimitError and message fallbacks', () => {
    expect(isRateLimitError(new RateLimitError())).toBe(true);
    expect(new RateLimitError(undefined, 666_000).message).toMatch(/retry in ~11 min/i);
    expect(isRateLimitError(new Error('429 too many requests'))).toBe(true);
    expect(isRateLimitError(new Error('boom'))).toBe(false);
  });
});
