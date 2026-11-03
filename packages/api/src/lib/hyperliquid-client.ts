import { z } from 'zod';

export const DEFAULT_HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz';
export const DEFAULT_HYPERLIQUID_TIMEOUT_MS = 15_000;

export const RATE_LIMIT_HTTP_ATTEMPTS = 3;
export const RATE_LIMIT_TOTAL_WAIT_CAP_MS = 30_000;
export const RATE_LIMIT_PER_WAIT_CAP_MS = 15_000;
export const RATE_LIMIT_DEFAULT_WAIT_MS = 1_000;

const ALLOWED_HOSTS = new Set(['api.hyperliquid.xyz', 'api.hyperliquid-testnet.xyz']);

const hlNumber = z.union([
  z.number().finite(),
  z
    .string()
    .refine((value) => value !== '' && Number.isFinite(Number(value)), 'Invalid numeric string')
    .transform((value) => Number(value)),
]);

const optionalHlNumber = z.union([hlNumber, z.null()]).optional();

const universeAssetSchema = z.object({
  name: z.string().min(1),
  szDecimals: z.number().int(),
  maxLeverage: z.number().int().optional(),
  onlyIsolated: z.boolean().optional(),
  isDelisted: z.boolean().optional(),
});

const assetCtxSchema = z.object({
  funding: hlNumber,
  openInterest: hlNumber,
  prevDayPx: optionalHlNumber,
  dayNtlVlm: hlNumber,
  premium: optionalHlNumber,
  oraclePx: hlNumber,
  markPx: hlNumber,
  midPx: optionalHlNumber,
  impactPxs: z.array(z.string()).nullable().optional(),
  dayBaseVlm: optionalHlNumber,
});

export const metaAndAssetCtxsSchema = z.tuple([
  z.object({
    universe: z.array(universeAssetSchema),
  }),
  z.array(assetCtxSchema),
]);

export const fundingHistorySchema = z.array(
  z.object({
    coin: z.string().min(1),
    fundingRate: hlNumber,
    premium: optionalHlNumber,
    time: z.number().int(),
  })
);

export class HyperliquidError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'HyperliquidError';
    this.status = status;
  }
}

export interface HyperliquidPerpSnapshot {
  coin: string;
  sz_decimals: number | null;
  max_leverage: number | null;
  only_isolated: boolean;
  is_delisted: boolean;
  funding_rate: number | null;
  open_interest: number | null;
  mark_px: number | null;
  oracle_px: number | null;
  mid_px: number | null;
  premium: number | null;
  prev_day_px: number | null;
  day_ntl_vlm: number | null;
  day_base_vlm: number | null;
  snapshot_at: Date;
}

export interface FundingHistoryPoint {
  coin: string;
  funding_rate: number;
  premium: number | null;
  time: number;
}

export function parseRetryAfterMs(
  header: string | null,
  perWaitCap: number = RATE_LIMIT_PER_WAIT_CAP_MS
): number {
  if (!header) return RATE_LIMIT_DEFAULT_WAIT_MS;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Math.max(Number.parseInt(trimmed, 10), 0) * 1000, perWaitCap);
  }
  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) {
    return Math.min(Math.max(asDate - Date.now(), 0), perWaitCap);
  }
  return RATE_LIMIT_DEFAULT_WAIT_MS;
}

/** Honor Retry-After when present; otherwise exponential 1s, 2s, 4s… (same pattern as the LLM client). */
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

export function resolveHyperliquidBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HyperliquidError('HYPERLIQUID_API_URL is not a valid URL');
  }

  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (isLoopback) {
    return url.origin;
  }
  if (url.protocol !== 'https:') {
    throw new HyperliquidError('HYPERLIQUID_API_URL must use https');
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new HyperliquidError('HYPERLIQUID_API_URL host is not allowlisted');
  }
  return url.origin;
}

export interface HyperliquidLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface HyperliquidClientOptions {
  apiUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  logger?: HyperliquidLogger;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asNumberOrNull(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value;
}

export class HyperliquidClient {
  private readonly infoUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger?: HyperliquidLogger;

  constructor(options: HyperliquidClientOptions = {}) {
    const baseUrl = resolveHyperliquidBaseUrl(options.apiUrl ?? DEFAULT_HYPERLIQUID_API_URL);
    this.infoUrl = `${baseUrl}/info`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_HYPERLIQUID_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.logger = options.logger;
  }

  async fetchPerpSnapshots(snapshotAt: Date = new Date()): Promise<HyperliquidPerpSnapshot[]> {
    const json = await this.postInfo({ type: 'metaAndAssetCtxs' });
    const parsed = metaAndAssetCtxsSchema.safeParse(json);
    if (!parsed.success) {
      this.logger?.error(
        { issueCount: parsed.error.issues.length },
        'Hyperliquid metaAndAssetCtxs failed validation'
      );
      throw new HyperliquidError('Hyperliquid metaAndAssetCtxs response failed validation');
    }

    const [meta, ctxs] = parsed.data;
    const count = Math.min(meta.universe.length, ctxs.length);
    const snapshots: HyperliquidPerpSnapshot[] = [];
    for (let i = 0; i < count; i++) {
      const asset = meta.universe[i];
      const ctx = ctxs[i];
      snapshots.push({
        coin: asset.name,
        sz_decimals: asset.szDecimals,
        max_leverage: asset.maxLeverage ?? null,
        only_isolated: asset.onlyIsolated ?? false,
        is_delisted: asset.isDelisted ?? false,
        funding_rate: asNumberOrNull(ctx.funding),
        open_interest: asNumberOrNull(ctx.openInterest),
        mark_px: asNumberOrNull(ctx.markPx),
        oracle_px: asNumberOrNull(ctx.oraclePx),
        mid_px: asNumberOrNull(ctx.midPx),
        premium: asNumberOrNull(ctx.premium),
        prev_day_px: asNumberOrNull(ctx.prevDayPx),
        day_ntl_vlm: asNumberOrNull(ctx.dayNtlVlm),
        day_base_vlm: asNumberOrNull(ctx.dayBaseVlm),
        snapshot_at: snapshotAt,
      });
    }
    return snapshots;
  }

  async fetchFundingHistory(
    coin: string,
    startTimeMs: number,
    endTimeMs?: number
  ): Promise<FundingHistoryPoint[]> {
    const body: Record<string, unknown> = {
      type: 'fundingHistory',
      coin,
      startTime: startTimeMs,
    };
    if (endTimeMs != null) body.endTime = endTimeMs;

    const json = await this.postInfo(body);
    const parsed = fundingHistorySchema.safeParse(json);
    if (!parsed.success) {
      this.logger?.error(
        { issueCount: parsed.error.issues.length, coin },
        'Hyperliquid fundingHistory failed validation'
      );
      throw new HyperliquidError('Hyperliquid fundingHistory response failed validation');
    }

    return parsed.data.map((row) => ({
      coin: row.coin,
      funding_rate: row.fundingRate,
      premium: asNumberOrNull(row.premium),
      time: row.time,
    }));
  }

  private async postInfo(body: Record<string, unknown>): Promise<unknown> {
    let remainingBudget = RATE_LIMIT_TOTAL_WAIT_CAP_MS;

    for (let attempt = 0; attempt < RATE_LIMIT_HTTP_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await this.fetchImpl(this.infoUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'vault-risk-copilot/0.1.0 (learning project)',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new HyperliquidError(`Hyperliquid request timed out after ${this.timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitMs = backoffWaitMs(attempt, retryAfter, remainingBudget);
        const lastAttempt = attempt === RATE_LIMIT_HTTP_ATTEMPTS - 1;
        if (lastAttempt || waitMs <= 0) {
          throw new HyperliquidError('Hyperliquid rate limited', 429);
        }
        this.logger?.warn({ attempt, waitMs, type: String(body.type) }, 'Hyperliquid 429, backing off');
        await this.sleep(waitMs);
        remainingBudget -= waitMs;
        continue;
      }

      if (!response.ok) {
        throw new HyperliquidError(
          `Hyperliquid API error: ${response.status} ${response.statusText}`,
          response.status
        );
      }

      return response.json();
    }

    throw new HyperliquidError('Hyperliquid rate limited', 429);
  }
}
