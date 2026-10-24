import { z } from 'zod';
import type { Logger } from 'pino';
import type { PoolSnapshot } from './db.js';

const defiLlamaPoolSchema = z.object({
  pool: z.string(),
  chain: z.string(),
  project: z.string(),
  symbol: z.string(),
  tvlUsd: z.number().optional(),
  apyBase: z.number().optional(),
  apyReward: z.number().optional(),
  apy: z.number().optional(),
  rewardTokens: z.array(z.string()).optional(),
  underlyingTokens: z.array(z.string()).optional(),
  poolMeta: z.string().optional(),
  il7d: z.number().optional(),
  apyPct1D: z.number().optional(),
  apyPct7D: z.number().optional(),
  apyPct30D: z.number().optional(),
  stablecoin: z.boolean().optional(),
  ilRisk: z.string().optional(),
  exposure: z.string().optional(),
  predictions: z
    .object({
      predictedClass: z.string().optional(),
      predictedProbability: z.number().optional(),
      binnedConfidence: z.number().optional(),
    })
    .optional(),
  mu: z.number().optional(),
  sigma: z.number().optional(),
  count: z.number().optional(),
  outlier: z.boolean().optional(),
  meanAPY: z.number().optional(),
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
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'vault-risk-copilot/0.1.0 (learning project)',
      },
    });

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
    pool_name: pool.poolMeta || `${pool.symbol} Pool`,
    pool_address: pool.underlyingTokens?.[0],
    asset_symbol: pool.symbol,
    asset_address: pool.underlyingTokens?.[0],
    is_stablecoin: pool.stablecoin || false,
    tvl_usd: pool.tvlUsd,
    tvl_usd_7d_ago: undefined,
    tvl_change_7d_pct: undefined,
    apy: pool.apy,
    apy_base: pool.apyBase,
    apy_reward: pool.apyReward,
    apy_7d: undefined,
    apy_pct_7d: pool.apyPct7D,
    apy_sigma: pool.sigma,
    il_risk: ilRiskValue ?? undefined,
    count: pool.count,
    data_source: 'defillama',
    snapshot_at: now,
  };
}
