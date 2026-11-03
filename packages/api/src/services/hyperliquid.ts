import { env } from '../config.js';
import { pool } from '../database.js';
import { HyperliquidClient, type FundingHistoryPoint } from '../lib/hyperliquid-client.js';
import {
  oiUsd,
  scorePerpMarket,
  totalOpenInterestUsd,
  type PerpMarketInput,
  type PerpRiskBreakdown,
} from '../lib/hyperliquid-signals.js';
import { TtlCache } from '../lib/ttl-cache.js';

export const COIN_PATTERN = /^[A-Za-z0-9:_-]{1,32}$/;

export type HyperliquidSort =
  | 'coin'
  | 'funding'
  | 'oi'
  | 'volume'
  | 'risk'
  | 'deviation';

export interface HyperliquidMarketRow extends PerpMarketInput {
  sz_decimals: number | null;
  max_leverage: number | null;
  only_isolated: boolean;
  is_delisted: boolean;
  mid_px: number | null;
  prev_day_px: number | null;
  day_base_vlm: number | null;
  oi_usd: number | null;
  funding_annualized_pct: number | null;
  mark_oracle_deviation_pct: number | null;
  snapshot_at: string;
  risk: PerpRiskBreakdown;
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

function mapRow(row: Record<string, unknown>, recentFunding: number[]): PerpMarketInput & {
  sz_decimals: number | null;
  max_leverage: number | null;
  only_isolated: boolean;
  is_delisted: boolean;
  mid_px: number | null;
  prev_day_px: number | null;
  day_base_vlm: number | null;
  snapshot_at: string;
} {
  return {
    coin: String(row.coin),
    sz_decimals: row.sz_decimals == null ? null : Number(row.sz_decimals),
    max_leverage: row.max_leverage == null ? null : Number(row.max_leverage),
    only_isolated: bool(row.only_isolated),
    is_delisted: bool(row.is_delisted),
    funding_rate: num(row.funding_rate),
    open_interest: num(row.open_interest),
    mark_px: num(row.mark_px),
    oracle_px: num(row.oracle_px),
    mid_px: num(row.mid_px),
    premium: num(row.premium),
    prev_day_px: num(row.prev_day_px),
    day_ntl_vlm: num(row.day_ntl_vlm),
    day_base_vlm: num(row.day_base_vlm),
    snapshot_at:
      row.snapshot_at instanceof Date
        ? row.snapshot_at.toISOString()
        : String(row.snapshot_at),
    recent_funding_rates: recentFunding,
  };
}

function toMarketRow(input: ReturnType<typeof mapRow>, totalOi: number): HyperliquidMarketRow {
  const risk = scorePerpMarket(input, totalOi);
  const notional = oiUsd(input.open_interest, input.mark_px);
  const deviation =
    input.mark_px != null && input.oracle_px != null && input.oracle_px !== 0
      ? (Math.abs(input.mark_px - input.oracle_px) / Math.abs(input.oracle_px)) * 100
      : null;
  return {
    ...input,
    oi_usd: notional,
    funding_annualized_pct:
      input.funding_rate != null ? input.funding_rate * 24 * 365 * 100 : null,
    mark_oracle_deviation_pct: deviation,
    risk,
  };
}

const SORT_VALUE: Record<HyperliquidSort, (row: HyperliquidMarketRow) => number | string | null> = {
  coin: (row) => row.coin,
  funding: (row) => row.funding_annualized_pct,
  oi: (row) => row.oi_usd,
  volume: (row) => row.day_ntl_vlm,
  risk: (row) => row.risk.total_risk_score,
  deviation: (row) => row.mark_oracle_deviation_pct,
};

function compareMarkets(
  a: HyperliquidMarketRow,
  b: HyperliquidMarketRow,
  sort: HyperliquidSort,
  order: 'asc' | 'desc'
): number {
  const av = SORT_VALUE[sort](a);
  const bv = SORT_VALUE[sort](b);
  if (av == null && bv == null) return a.coin.localeCompare(b.coin);
  if (av == null) return 1;
  if (bv == null) return -1;
  const dir = order === 'asc' ? 1 : -1;
  if (typeof av === 'string' && typeof bv === 'string') {
    return av.localeCompare(bv) * dir;
  }
  return ((av as number) - (bv as number)) * dir;
}

async function latestMarketRows(includeDelisted: boolean): Promise<HyperliquidMarketRow[]> {
  const result = await pool.query(
    `
      SELECT DISTINCT ON (coin) *
      FROM hyperliquid_perp_snapshots
      ${includeDelisted ? '' : 'WHERE is_delisted = false'}
      ORDER BY coin, snapshot_at DESC
    `
  );

  if (result.rows.length === 0) return [];

  const coins = result.rows.map((row) => String(row.coin));
  const history = await pool.query(
    `
      SELECT coin, funding_rate
      FROM (
        SELECT coin, funding_rate, snapshot_at,
               ROW_NUMBER() OVER (PARTITION BY coin ORDER BY snapshot_at DESC) AS rn
        FROM hyperliquid_perp_snapshots
        WHERE coin = ANY($1)
      ) ranked
      WHERE rn <= 48
      ORDER BY coin, snapshot_at ASC
    `,
    [coins]
  );

  const fundingByCoin = new Map<string, number[]>();
  for (const row of history.rows) {
    const rate = num(row.funding_rate);
    if (rate == null) continue;
    const list = fundingByCoin.get(String(row.coin)) ?? [];
    list.push(rate);
    fundingByCoin.set(String(row.coin), list);
  }

  const mapped = result.rows.map((row) =>
    mapRow(row as Record<string, unknown>, fundingByCoin.get(String(row.coin)) ?? [])
  );
  const totalOi = totalOpenInterestUsd(mapped);
  return mapped.map((row) => toMarketRow(row, totalOi));
}

export async function listHyperliquidMarkets(options: {
  search?: string;
  sort?: HyperliquidSort;
  order?: 'asc' | 'desc';
  include_delisted?: boolean;
  limit: number;
  offset: number;
}): Promise<{
  data: HyperliquidMarketRow[];
  pagination: { total: number; limit: number; offset: number };
  snapshot_at: string | null;
  source: 'snapshot';
}> {
  const sort = options.sort ?? 'oi';
  const order = options.order ?? 'desc';
  let rows = await latestMarketRows(options.include_delisted === true);

  if (options.search) {
    const term = options.search.trim().toLowerCase();
    rows = rows.filter((row) => row.coin.toLowerCase().includes(term));
  }

  rows.sort((a, b) => compareMarkets(a, b, sort, order));
  const total = rows.length;
  const sliced = rows.slice(options.offset, options.offset + options.limit);
  const snapshotAt = sliced[0]?.snapshot_at ?? rows[0]?.snapshot_at ?? null;

  return {
    data: sliced,
    pagination: { total, limit: options.limit, offset: options.offset },
    snapshot_at: snapshotAt,
    source: 'snapshot',
  };
}

export async function getHyperliquidMarket(coin: string): Promise<HyperliquidMarketRow | null> {
  const listed = await latestMarketRows(true);
  return listed.find((row) => row.coin.toUpperCase() === coin.toUpperCase()) ?? null;
}

const fundingCache = new TtlCache<{
  coin: string;
  points: FundingHistoryPoint[];
  cached: boolean;
}>(env.HYPERLIQUID_CACHE_TTL_MS);

let cachedClient: HyperliquidClient | null = null;

function getClient(): HyperliquidClient {
  if (!cachedClient) {
    cachedClient = new HyperliquidClient({
      apiUrl: env.HYPERLIQUID_API_URL,
      timeoutMs: env.HYPERLIQUID_TIMEOUT_MS,
    });
  }
  return cachedClient;
}

export function resetHyperliquidClientForTests(): void {
  cachedClient = null;
  fundingCache.clear();
}

export async function getHyperliquidFundingHistory(
  coin: string,
  hours: number
): Promise<{
  coin: string;
  points: Array<{ time: number; funding_rate: number; premium: number | null; annualized_pct: number }>;
  source: 'live';
  cached: boolean;
}> {
  const startTime = Date.now() - hours * 60 * 60 * 1000;
  const cacheKey = `${coin}:${hours}`;
  const hit = fundingCache.get(cacheKey);
  if (hit) {
    return {
      coin: hit.coin,
      source: 'live',
      cached: true,
      points: hit.points.map((p) => ({
        time: p.time,
        funding_rate: p.funding_rate,
        premium: p.premium,
        annualized_pct: p.funding_rate * 24 * 365 * 100,
      })),
    };
  }

  const points = await getClient().fetchFundingHistory(coin, startTime);
  fundingCache.set(cacheKey, { coin, points, cached: false });
  return {
    coin,
    source: 'live',
    cached: false,
    points: points.map((p) => ({
      time: p.time,
      funding_rate: p.funding_rate,
      premium: p.premium,
      annualized_pct: p.funding_rate * 24 * 365 * 100,
    })),
  };
}
