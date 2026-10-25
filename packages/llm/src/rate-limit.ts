export class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function isRateLimitError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('rate limit') || msg.includes('too many requests');
}

/** Cap the wait so a large Retry-After does not block the request. */
export const RATE_LIMIT_WAIT_CAP_MS = 5_000;
export const RATE_LIMIT_DEFAULT_WAIT_MS = 1_000;

export function parseRetryAfterMs(header: string | null): number {
  if (!header) return RATE_LIMIT_DEFAULT_WAIT_MS;
  const asSeconds = Number.parseInt(header, 10);
  if (!Number.isNaN(asSeconds) && String(asSeconds) === header.trim()) {
    return Math.min(Math.max(asSeconds, 0) * 1000, RATE_LIMIT_WAIT_CAP_MS);
  }
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    return Math.min(Math.max(asDate - Date.now(), 0), RATE_LIMIT_WAIT_CAP_MS);
  }
  return RATE_LIMIT_DEFAULT_WAIT_MS;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
