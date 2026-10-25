import { z } from 'zod';

export const poolSnapshotSchema = z.object({
  id: z.union([z.number(), z.string()]),
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
  snapshot_at: z.string().optional(),
  created_at: z.string().optional(),
});

export const riskScoreSchema = z.object({
  id: z.string().uuid(),
  pool_id: z.string().uuid(),
  snapshot_id: z.string().uuid().nullable(),
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
  is_anomaly: z.boolean(),
  anomaly_reason: z.string().nullable(),
  model_version: z.string(),
  calculated_at: z.string().optional(),
  created_at: z.string().optional(),
});

export const poolWithRiskSchema = poolSnapshotSchema.merge(
  riskScoreSchema.pick({
    total_risk_score: true,
    risk_category: true,
  })
);

export const poolDetailsSchema = poolSnapshotSchema.extend({
  risk_score: riskScoreSchema.optional(),
});

export const vaultStateSchema = z.object({
  vault_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chain_id: z.number(),
  total_assets: z.string(),
  total_supply: z.string(),
  share_price: z.number(),
  block_number: z.number(),
  snapshot_at: z.string().datetime(),
});

export const explanationSchema = z.object({
  explanation: z.object({
    summary: z.string(),
    key_factors: z.array(
      z.object({
        signal: z.string(),
        value: z.string(),
        explanation: z.string(),
      })
    ),
    disclaimer: z.string(),
  }),
  metadata: z.object({
    provider: z.string(),
    model: z.string(),
    timestamp: z.string(),
    latency_ms: z.number(),
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
    fallback: z.boolean().optional(),
    fallback_reason: z.string().optional(),
  }),
  cached: z.boolean(),
});

export type PoolSnapshot = z.infer<typeof poolSnapshotSchema>;
export type RiskScore = z.infer<typeof riskScoreSchema>;
export type PoolWithRisk = z.infer<typeof poolWithRiskSchema>;
export type PoolDetails = z.infer<typeof poolDetailsSchema>;
export type VaultState = z.infer<typeof vaultStateSchema>;
export type Explanation = z.infer<typeof explanationSchema>;
