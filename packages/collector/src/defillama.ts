import { z } from 'zod';
import type { Logger } from 'pino';
import type { PoolSnapshot } from './db.js';

const defiLlamaPoolSchema = z.object({
  pool: z.string(),
  chain: z.string(),
  project: z.string(),
  symbol: z.string(),
  tvlUsd: z.number().nullable().optional(),
  apyBase: z.number().nullable().optional(),
  apyReward: z.number().nullable().optional(),
  apy: z.number().nullable().optional(),
  rewardTokens: z.array(z.string()).nullable().optional(),
  underlyingTokens: z.array(z.string()).nullable().optional(),
  poolMeta: z.string().nullable().optional(),
  il7d: z.number().nullable().optional(),
  apyPct1D: z.number().nullable().optional(),
  apyPct7D: z.number().nullable().optional(),
  apyPct30D: z.number().nullable().optional(),
  stablecoin: z.boolean().nullable().optional(),
  ilRisk: z.string().nullable().optional(),
  exposure: z.string().nullable().optional(),
  predictions: z
    .object({
      predictedClass: z.string().nullable().optional(),
      predictedProbability: z.number().nullable().optional(),
      binnedConfidence: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  mu: z.number().nullable().optional(),
  sigma: z.number().nullable().optional(),
  count: z.number().nullable().optional(),
  outlier: z.boolean().nullable().optional(),
  meanAPY: z.number().nullable().optional(),
});

type DefiLlamaPool = z.infer<typeof defiLlamaPoolSchema>;

const defiLlamaResponseSchema = z.object({
  status: z.string(),
  data: z.array(defiLlamaPoolSchema),
});

export async function fetchDefiLlamaPools(
  apiUrl: string,
  logger: Logger
): Promise<PoolSnapshot[]> {
  const url = `${apiUrl}/pools`;
  logger.info({ url }, 'Fetching DeFiLlama pools');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'vault-risk-copilot/0.1.0 (learning project)',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`DeFiLlama API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const parsed = defiLlamaResponseSchema.parse(json);

    logger.info({ count: parsed.data.length }, 'Fetched DeFiLlama pools');

    return parsed.data
      .filter(filterRelevantPools)
      .slice(0, 100)
      .map((pool) => transformToPoolSnapshot(pool));
  } catch (error) {
    logger.error({ error }, 'Failed to fetch DeFiLlama pools');
    throw error;
  }
}

function filterRelevantPools(pool: DefiLlamaPool): boolean {
  if (!pool.tvlUsd || pool.tvlUsd < 100_000) return false;
  if (!pool.apy || pool.apy < 0 || pool.apy > 1000) return false;
  
  const relevantChains = ['Ethereum', 'Arbitrum', 'Optimism', 'Polygon', 'Base'];
  const relevantProtocols = ['Aave', 'Compound', 'Uniswap', 'Curve', 'Lido', 'MakerDAO'];
  
  return (
    relevantChains.includes(pool.chain) &&
    relevantProtocols.some((p) => pool.project.toLowerCase().includes(p.toLowerCase()))
  );
}

function transformToPoolSnapshot(pool: DefiLlamaPool): PoolSnapshot {
  const now = new Date();
  const ilRiskValue = pool.ilRisk === 'yes' ? 1.0 : pool.ilRisk === 'no' ? 0.0 : null;

  return {
    pool_id: pool.pool,
    protocol: pool.project,
    chain: pool.chain,
    pool_name: pool.poolMeta ?? `${pool.symbol} Pool`,
    pool_address: pool.underlyingTokens?.[0] ?? null,
    asset_symbol: pool.symbol,
    asset_address: pool.underlyingTokens?.[0] ?? null,
    is_stablecoin: pool.stablecoin ?? false,
    tvl_usd: pool.tvlUsd ?? null,
    tvl_usd_7d_ago: null,
    tvl_change_7d_pct: null,
    apy: pool.apy ?? null,
    apy_base: pool.apyBase ?? null,
    apy_reward: pool.apyReward ?? null,
    apy_7d: null,
    apy_pct_7d: pool.apyPct7D ?? null,
    apy_sigma: pool.sigma ?? null,
    il_risk: ilRiskValue,
    count: pool.count ?? null,
    data_source: 'defillama' as const,
    snapshot_at: now,
  };
}
