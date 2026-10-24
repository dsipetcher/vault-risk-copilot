import { z } from 'zod';

// Pool snapshot from database
export const poolSnapshotSchema = z.object({
  id: z.number(),
  pool_id: z.string().uuid(),
  protocol: z.string(),
  chain: z.string(),
  pool_name: z.string().nullable(),
  asset_symbol: z.string(),
  is_stablecoin: z.boolean(),
  tvl_usd: z.number().nullable(),
  tvl_change_7d_pct: z.number().nullable(),
  apy: z.number().nullable(),
  apy_base: z.number().nullable(),
  apy_reward: z.number().nullable(),
  apy_sigma: z.number().nullable(),
  apy_pct_7d: z.number().nullable(),
  il_risk: z.number().nullable(),
  count: z.number().nullable(),
  snapshot_at: z.string().datetime(),
  created_at: z.string().datetime(),
});

export type PoolSnapshot = z.infer<typeof poolSnapshotSchema>;

// Risk score with breakdown
export const riskScoreSchema = z.object({
  id: z.number(),
  pool_id: z.string().uuid(),
  snapshot_id: z.number(),
  total_risk_score: z.number(),
  risk_category: z.enum(['low', 'medium', 'high', 'critical']),
  tvl_score: z.number(),
  tvl_volatility_score: z.number(),
  apy_volatility_score: z.number(),
  reward_ratio_score: z.number(),
  stablecoin_score: z.number(),
  il_score: z.number(),
  data_age_score: z.number(),
  vault_score: z.number(),
  vault_score_applicable: z.boolean().optional(),
  is_anomaly: z.boolean(),
  anomaly_reason: z.string().nullable(),
  model_version: z.string(),
  calculated_at: z.string().datetime(),
  created_at: z.string().datetime(),
});

export type RiskScore = z.infer<typeof riskScoreSchema>;

// Vault state from on-chain
export const vaultStateSchema = z.object({
  vault_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chain_id: z.number(),
  total_assets: z.string(), // BigInt as string
  total_supply: z.string(), // BigInt as string
  share_price: z.number(),
  block_number: z.number(),
  snapshot_at: z.string().datetime(),
});

export type VaultState = z.infer<typeof vaultStateSchema>;

// API response types
export const poolWithRiskSchema = poolSnapshotSchema.merge(
  riskScoreSchema.pick({
    total_risk_score: true,
    risk_category: true,
    vault_score_applicable: true,
  })
);

export type PoolWithRisk = z.infer<typeof poolWithRiskSchema>;

// Pagination
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// Filters
export const poolFiltersSchema = z.object({
  protocol: z.string().optional(),
  chain: z.string().optional(),
  is_stablecoin: z.coerce.boolean().optional(),
  risk_category: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  min_tvl: z.coerce.number().optional(),
  max_tvl: z.coerce.number().optional(),
});

export type PoolFilters = z.infer<typeof poolFiltersSchema>;
