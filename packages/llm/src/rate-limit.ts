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

export const RATE_LIMIT_HTTP_ATTEMPTS = 3;
export const RATE_LIMIT_TOTAL_WAIT_CAP_MS = 30_000;
export const RATE_LIMIT_PER_WAIT_CAP_MS = 15_000;
export const RATE_LIMIT_WAIT_CAP_MS = RATE_LIMIT_PER_WAIT_CAP_MS;
export const RATE_LIMIT_DEFAULT_WAIT_MS = 1_000;

export function parseRetryAfterMs(
  header: string | null,
  perWaitCap: number = RATE_LIMIT_PER_WAIT_CAP_MS
): number {
  if (!header) return RATE_LIMIT_DEFAULT_WAIT_MS;
  const asSeconds = Number.parseInt(header, 10);
  if (!Number.isNaN(asSeconds) && String(asSeconds) === header.trim()) {
    return Math.min(Math.max(asSeconds, 0) * 1000, perWaitCap);
  }
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    return Math.min(Math.max(asDate - Date.now(), 0), perWaitCap);
  }
  return RATE_LIMIT_DEFAULT_WAIT_MS;
}

/** Honor Retry-After when present; otherwise exponential 1s, 2s, 4s… */
export function backoffWaitMs(
  attemptIndex: number,
  retryAfterHeader: string | null,
  remainingBudget: number
): number {
  const exponential = Math.min(
    RATE_LIMIT_DEFAULT_WAIT_MS * 2 ** attemptIndex,
    RATE_LIMIT_PER_WAIT_CAP_MS
  );
  const raw = retryAfterHeader !== null ? parseRetryAfterMs(retryAfterHeader) : exponential;
  return Math.max(0, Math.min(raw, remainingBudget, RATE_LIMIT_PER_WAIT_CAP_MS));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function describeFallbackReason(reason?: string): string {
  switch (reason) {
    case 'rate_limited':
      return 'Rate limited by the provider. Wait a moment and try again.';
    case 'invalid_key':
      return 'The API key was rejected.';
    case 'validation_failed':
      return 'The model reply failed validation.';
    default:
      return reason ? `Limited analysis (${reason}).` : 'Limited analysis.';
  }
}
