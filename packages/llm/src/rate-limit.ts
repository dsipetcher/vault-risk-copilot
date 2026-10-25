export class RateLimitError extends Error {
  readonly retryAfterMs?: number;

  constructor(message?: string, retryAfterMs?: number) {
    super(message ?? rateLimitErrorMessage(retryAfterMs));
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
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

const RESET_HEADER_NAMES = [
  'retry-after',
  'x-ratelimit-reset-requests',
  'x-ratelimit-reset-tokens',
  'x-ratelimit-reset',
] as const;

export type HeaderReader = { get(name: string): string | null };

/** Uncapped parse of Retry-After or Groq-style reset durations (`7m26.56s`). */
export function parseDurationHeaderMs(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return Math.max(Number.parseInt(trimmed, 10), 0) * 1000;
  }

  const duration = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/i.exec(trimmed);
  if (duration && duration[0] !== '') {
    const hours = Number(duration[1] ?? 0);
    const minutes = Number(duration[2] ?? 0);
    const seconds = Number(duration[3] ?? 0);
    return Math.max((hours * 3600 + minutes * 60 + seconds) * 1000, 0);
  }

  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) {
    return Math.max(asDate - Date.now(), 0);
  }
  return null;
}

export function parseRetryAfterMs(
  header: string | null,
  perWaitCap: number = RATE_LIMIT_PER_WAIT_CAP_MS
): number {
  const raw = parseDurationHeaderMs(header);
  if (raw == null) return RATE_LIMIT_DEFAULT_WAIT_MS;
  return Math.min(raw, perWaitCap);
}

/** Longest hinted wait from Retry-After or provider reset headers (uncapped). */
export function requestedWaitMs(headers: HeaderReader): number | null {
  let max: number | null = null;
  for (const name of RESET_HEADER_NAMES) {
    const value = parseDurationHeaderMs(headers.get(name));
    if (value != null && (max == null || value > max)) {
      max = value;
    }
  }
  return max;
}

export function exceedsBackoffBudget(
  requestedMs: number | null,
  remainingBudgetMs: number
): boolean {
  return requestedMs != null && requestedMs > remainingBudgetMs;
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

export function formatRetryIn(ms: number): string {
  if (ms >= 60_000) {
    return `retry in ~${Math.max(1, Math.round(ms / 60_000))} min`;
  }
  return `retry in ~${Math.max(1, Math.round(ms / 1000))} s`;
}

export function rateLimitErrorMessage(retryAfterMs?: number): string {
  if (retryAfterMs == null) return 'Rate limit exceeded';
  return `Rate limit exceeded; ${formatRetryIn(retryAfterMs)}`;
}

export function describeFallbackReason(reason?: string, retryAfterMs?: number): string {
  switch (reason) {
    case 'rate_limited':
      return retryAfterMs != null
        ? `Rate limited by the provider; ${formatRetryIn(retryAfterMs)}.`
        : 'Rate limited by the provider. Wait a moment and try again.';
    case 'invalid_key':
      return 'The API key was rejected.';
    case 'validation_failed':
      return 'The model reply failed validation.';
    default:
      return reason ? `Limited analysis (${reason}).` : 'Limited analysis.';
  }
}
